/**
 * Auto-completion of finished course enrollments.
 *
 * Lifted out of routes/shopify.js so it can be exercised from a script without
 * standing up the Express app — the rule below decides whether a paying student's
 * record disappears from the active list, and that deserves a dry run before it
 * writes anything.
 */

const supabaseDb = require('./supabaseDb');

const ACTIVE_BOOKING_STATUSES = ['booked', 'completed', 'attended'];

/**
 * A zero-booking enrollment is only safe to retire when some OTHER enrollment of
 * the same student actually served the course window it paid for. That is the
 * signature of a superseded duplicate: the Shopify order created one row, the
 * cohort was built on a second row, and the first was left behind with no
 * course_identifier and no classes.
 *
 * The distinction matters. A zero-booking enrollment with NO such sibling is a
 * student who paid and was never placed in a cohort — Alma MORA ORDONEZ sat like
 * that from Dec 2025 to Aug 2026. Those must stay 'active' and visible; quietly
 * completing them is how the gap went unnoticed for eight months in the first
 * place. Note that getEnrollmentCredits reports allocated 0 for a standard WT
 * enrollment, so `remaining === 0` means "credits are not tracked here", NOT
 * "nothing is owed" — it cannot be used as the safety guard for this case.
 */
async function isSupersededDuplicate(enrollment) {
  const start = enrollment.course_start_date?.split(/[T ]/)[0];
  if (!start) return false;

  const { data: siblings } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id')
    .eq('student_id', enrollment.student_id)
    .neq('id', enrollment.id)
    .neq('status', 'cancelled');

  if (!siblings?.length) return false;

  // Students who miss an intake get rolled into a later one, so the replacement
  // cohort can start months after the purchased date — allow a generous window.
  const windowEnd = new Date(new Date(start).getTime() + 180 * 86400000)
    .toISOString().split('T')[0];

  const { data: siblingBookings } = await supabaseDb.supabase
    .from('bookings')
    .select('id, class_instances!bookings_class_instance_id_fkey(class_date)')
    .in('course_enrollment_id', siblings.map(s => s.id))
    .in('status', ACTIVE_BOOKING_STATUSES);

  return (siblingBookings || []).some(b => {
    const d = b.class_instances?.class_date?.split(/[T ]/)[0];
    return d && d >= start && d <= windowEnd;
  });
}

/**
 * Mark active enrollments completed once every class they cover is in the past.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.dryRun] report what would change without writing
 * @returns {Promise<number|{completed: array, allocated: array}>} count, or the
 *          planned changes when dryRun is set
 */
async function autoCompleteFinishedEnrollments({ dryRun = false } = {}) {
  const plan = { completed: [], allocated: [] };
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // Get all active enrollments (include credit + package fields)
    const { data: activeEnrollments, error } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, student_id, course_identifier, course_type, number_of_weeks, total_weeks, class_credits_allocated, class_credits_remaining, course_start_date, course_end_date')
      .in('status', ['active']);

    if (error || !activeEnrollments?.length) return dryRun ? plan : 0;

    let completedCount = 0;

    for (const enrollment of activeEnrollments) {
      // Get all bookings for this enrollment
      const { data: bookings } = await supabaseDb.supabase
        .from('bookings')
        .select('id, class_instances!bookings_class_instance_id_fkey(class_date)')
        .eq('course_enrollment_id', enrollment.id)
        .in('status', ACTIVE_BOOKING_STATUSES);

      // No bookings used to `continue` here, which made such a row structurally
      // impossible to ever complete: no bookings means no dates means the allPast
      // test never ran, so it stayed 'active' forever. Jan 2026 cohorts were still
      // badged ACTIVE in Aug 2026. Fall back to the purchased course window, but
      // only retire the row if a sibling enrollment actually served it.
      let allPast;
      let superseded = false;
      if (!bookings || bookings.length === 0) {
        const end = enrollment.course_end_date?.split(/[T ]/)[0];
        // Credit-based enrollments (HB, 10-class flex) carry no course_end_date;
        // they are governed by the credit guards below, not by a calendar window.
        if (!end || end >= todayStr) continue;
        if (!(await isSupersededDuplicate(enrollment))) continue;
        allPast = true;
        superseded = true;
      } else {
        // Check if ALL booking dates are in the past (use regex to handle both "T" and space separators)
        allPast = bookings.every(b => {
          const d = b.class_instances?.class_date?.split(/[T ]/)[0];
          return d && d < todayStr;
        });
      }

      if (allPast) {
        // Compute credits from actual bookings (never trust stale DB columns)
        const credits = await supabaseDb.getEnrollmentCredits(enrollment.id);

        // Skip HB credit-based enrollments that still have remaining credits
        const isHB = enrollment.course_type && enrollment.course_type.toLowerCase().includes('handbuilding');
        if (isHB && credits.remaining > 0) {
          continue; // Student still has credits to use
        }

        // 10-class packages (number_of_weeks=10, total_weeks=6): allocate 4 flex credits
        // when WT course completes, instead of marking as completed
        const is10ClassPackage = enrollment.number_of_weeks === 10 && (enrollment.total_weeks === 6 || bookings?.length === 6);
        if (is10ClassPackage && !enrollment.class_credits_allocated) {
          const flexCredits = enrollment.number_of_weeks - (enrollment.total_weeks || 6);
          plan.allocated.push({ id: enrollment.id, course: enrollment.course_identifier, flexCredits });
          if (!dryRun) {
            await supabaseDb.supabase
              .from('course_enrollments')
              .update({
                class_credits_allocated: flexCredits,
                updated_at: new Date().toISOString()
              })
              .eq('id', enrollment.id);
            console.log(`Allocated ${flexCredits} flex credits for 10-class package enrollment ${enrollment.id} (${enrollment.course_identifier})`);
          }
          continue; // Don't complete yet — student has flex credits to use
        }

        // Skip if enrollment still has flex credits remaining
        if (credits.remaining > 0) {
          continue;
        }

        // A superseded duplicate is cancelled, not completed. The student did finish
        // the course, but on the sibling record — marking this one completed too
        // would put a second, courseless ghost row in Past Students for one purchase.
        // course_purchase_count takes max(shopify count, non-cancelled rows), so the
        // Shopify figure still floors it and the purchase is not undercounted.
        const newStatus = superseded ? 'cancelled' : 'completed';

        plan.completed.push({
          id: enrollment.id,
          course: enrollment.course_identifier,
          bookings: bookings?.length || 0,
          status: newStatus
        });
        if (!dryRun) {
          await supabaseDb.supabase
            .from('course_enrollments')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', enrollment.id);
          console.log(
            superseded
              ? `Cancelled superseded duplicate enrollment ${enrollment.id} — no classes, sibling enrollment served the course`
              : `Auto-completed enrollment ${enrollment.id} (${enrollment.course_identifier}) — all classes past`
          );
        }
        completedCount++;
      }
    }

    if (dryRun) return plan;

    if (completedCount > 0) {
      console.log(`Auto-completed ${completedCount} finished enrollments`);
    }
    return completedCount;
  } catch (error) {
    console.error('Error auto-completing enrollments:', error);
    return dryRun ? plan : 0;
  }
}

module.exports = { autoCompleteFinishedEnrollments, isSupersededDuplicate };
