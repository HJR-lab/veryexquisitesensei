/**
 * reconcile-flex-credits.js
 *
 * One-off repair script for students whose 10-class package flex credits
 * drifted out of sync because the old admin reschedule flow did DELETE+POST
 * instead of an in-place reschedule. Symptoms:
 *   - "Orphan" bookings with course_enrollment_id = null but a makeup/booked
 *     booking that logically belongs to a student's active enrollment.
 *   - class_credits_remaining on the enrollment that does not match
 *     (allocated - bookings beyond the base 6-week course).
 *
 * What it does, per student:
 *   1. Find all enrollments that track credits (class_credits_allocated > 0).
 *   2. Re-link orphan bookings (course_enrollment_id IS NULL, status IN
 *      (booked, attended, completed)) to the student's newest credit-tracking
 *      enrollment — ONLY if that enrollment has room left.
 *   3. Recompute class_credits_used / class_credits_remaining from the
 *      number of linked bookings beyond total_weeks (base-course quota).
 *
 * Usage:
 *   cd server && node scripts/reconcile-flex-credits.js --email beverlytan27@yahoo.com
 *   cd server && node scripts/reconcile-flex-credits.js --email beverlytan27@yahoo.com --apply
 *   cd server && node scripts/reconcile-flex-credits.js --all           # dry-run across all credit-tracking enrollments
 *   cd server && node scripts/reconcile-flex-credits.js --all --apply
 */

require('dotenv').config();

const { supabase } = require('../utils/supabaseDb');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ALL   = args.includes('--all');
const emailIdx = args.indexOf('--email');
const EMAIL = emailIdx >= 0 ? args[emailIdx + 1] : null;

if (!EMAIL && !ALL) {
  console.error('Usage: node scripts/reconcile-flex-credits.js --email <email> [--apply]');
  console.error('       node scripts/reconcile-flex-credits.js --all [--apply]');
  process.exit(1);
}

function banner(s) {
  console.log('\n' + '='.repeat(72));
  console.log(s);
  console.log('='.repeat(72));
}

async function reconcileStudent(customer) {
  console.log(`\n── ${customer.first_name} ${customer.last_name} <${customer.email}> (id ${customer.id}) ──`);

  // 1. Load credit-tracking enrollments (newest first)
  const { data: enrollments, error: enrErr } = await supabase
    .from('course_enrollments')
    .select('id, course_type, course_identifier, status, number_of_weeks, total_weeks, class_credits_allocated, class_credits_used, class_credits_remaining')
    .eq('student_id', customer.id)
    .gt('class_credits_allocated', 0)
    .order('created_at', { ascending: false });

  if (enrErr) throw enrErr;

  if (!enrollments || enrollments.length === 0) {
    console.log('   No credit-tracking enrollments — nothing to reconcile.');
    return { changed: false };
  }

  // 2. Find orphan bookings for this student
  const { data: orphans } = await supabase
    .from('bookings')
    .select('id, class_instance_id, status, booking_type, created_at, class_instances!bookings_class_instance_id_fkey(class_date)')
    .eq('student_id', customer.id)
    .is('course_enrollment_id', null)
    .in('status', ['booked', 'attended', 'completed']);

  console.log(`   Enrollments: ${enrollments.length}, Orphan bookings: ${orphans?.length || 0}`);

  // 3. Link orphans to the newest active enrollment that still has capacity
  //    Capacity = number_of_weeks - (current bookings linked)
  const targetEnrollment = enrollments.find(e => e.status === 'active') || enrollments[0];

  let linkedCount = 0;
  if (orphans && orphans.length > 0) {
    const { count: linkedNow } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('course_enrollment_id', targetEnrollment.id)
      .in('status', ['booked', 'attended', 'completed']);

    const capacity = (targetEnrollment.number_of_weeks || 0) - (linkedNow || 0);
    const toLink   = orphans.slice(0, Math.max(0, capacity));

    if (toLink.length < orphans.length) {
      console.log(`   ⚠️  ${orphans.length - toLink.length} orphan(s) cannot be linked — enrollment ${targetEnrollment.id} (${targetEnrollment.course_identifier || 'n/a'}) has no room.`);
    }

    for (const ob of toLink) {
      console.log(`   · link orphan booking ${ob.id} (${ob.class_instances?.class_date || 'no date'}, ${ob.status}) → enrollment ${targetEnrollment.id}`);
      if (APPLY) {
        await supabase
          .from('bookings')
          .update({ course_enrollment_id: targetEnrollment.id, updated_at: new Date().toISOString() })
          .eq('id', ob.id);
      }
      linkedCount++;
    }
  }

  // 4. Recompute class_credits_used / class_credits_remaining per enrollment
  //    used = max(0, bookings_linked - (total_weeks || (number_of_weeks - allocated)))
  //    i.e. any booking beyond the base course counts against flex credits.
  let anyUpdate = false;
  for (const e of enrollments) {
    const { count: linkedCountNow } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('course_enrollment_id', e.id)
      .in('status', ['booked', 'attended', 'completed']);

    const baseQuota = (e.total_weeks || ((e.number_of_weeks || 0) - (e.class_credits_allocated || 0)));
    const flexUsed = Math.max(0, (linkedCountNow || 0) - baseQuota);
    const newRemaining = Math.max(0, (e.class_credits_allocated || 0) - flexUsed);

    if (flexUsed !== (e.class_credits_used || 0) || newRemaining !== (e.class_credits_remaining || 0)) {
      console.log(`   · enrollment ${e.id} (${e.course_identifier || 'n/a'}): ` +
        `bookings=${linkedCountNow}, base=${baseQuota}, alloc=${e.class_credits_allocated} | ` +
        `used ${e.class_credits_used}→${flexUsed}, remaining ${e.class_credits_remaining}→${newRemaining}`);
      anyUpdate = true;
      if (APPLY) {
        await supabase
          .from('course_enrollments')
          .update({
            class_credits_used: flexUsed,
            class_credits_remaining: newRemaining,
            updated_at: new Date().toISOString()
          })
          .eq('id', e.id);
      }
    } else {
      console.log(`   · enrollment ${e.id} (${e.course_identifier || 'n/a'}): already in sync (used=${flexUsed}, remaining=${newRemaining})`);
    }
  }

  return { changed: linkedCount > 0 || anyUpdate };
}

async function main() {
  banner(`Flex-credit reconciliation ${APPLY ? '[APPLY]' : '[DRY RUN — pass --apply to write]'}`);

  let customers = [];
  if (EMAIL) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, email, first_name, last_name')
      .ilike('email', EMAIL)
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) {
      console.error(`No customer found for email ${EMAIL}`);
      process.exit(1);
    }
    customers = data;
  } else {
    // --all: every student with a credit-tracking enrollment
    const { data: enrs, error } = await supabase
      .from('course_enrollments')
      .select('student_id')
      .gt('class_credits_allocated', 0);
    if (error) throw error;
    const ids = [...new Set((enrs || []).map(e => e.student_id))];
    if (ids.length === 0) {
      console.log('No credit-tracking enrollments found.');
      return;
    }
    const { data } = await supabase
      .from('customers')
      .select('id, email, first_name, last_name')
      .in('id', ids)
      .order('id', { ascending: true });
    customers = data || [];
  }

  let touched = 0;
  for (const c of customers) {
    try {
      const { changed } = await reconcileStudent(c);
      if (changed) touched++;
    } catch (e) {
      console.error(`   ❌ ${c.email}: ${e.message}`);
    }
  }

  banner(`Done. ${touched}/${customers.length} students ${APPLY ? 'updated' : 'would be updated'}.`);
  if (!APPLY) console.log('Re-run with --apply to write changes.');
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
