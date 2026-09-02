/**
 * Daily anomaly probe for enrollment/credit invariant violations.
 *
 * Born from the Ryan Ling case (cust #2231): two active 10-class packages where
 * June cohort bookings were appended to an older enrollment as makeups, over-
 * allocating it (5 future bookings against 1 credit remaining) while leaving
 * the newer enrollment unassigned (course_identifier=null). Nothing in the
 * system flagged the contradiction.
 *
 * Checks:
 *  1. Over-allocated enrollment — committed bookings exceed allocated credits.
 *  2. Stale unassigned 10-class — number_of_weeks=10, status=active,
 *     course_identifier IS NULL, created >7 days ago, no bookings linked.
 *  3. Unlinked upcoming booking — no course_enrollment_id, so it takes a seat
 *     and spends no credit (Nicole Wong Apr '26, Sanjana Vijay Aug '26).
 *  4. Recent purchase with no enrollment — someone paid and is in no cohort.
 *  5. Duplicate spot enrollment — one purchased spot held twice by the same
 *     student, which is what a spot filed under a non-standard dedupe key
 *     looks like after the next sync (Denise Lai, Nigel Lim, Apr '26).
 *
 * Each check earns its place by having already missed something in production.
 * Both 3 and 4 exist because the other invariants could not see the failure:
 * stored counters and the computed ledger agreed with each other while being
 * blind to the same booking.
 *
 * Returns: Array<{type, severity, student_id, student_name, enrollment_id, details}>
 */

const { supabase } = require('./supabaseDb');

const STALE_DAYS = 7;
// A purchase older than this is history, not an unserved customer.
const RECENT_PURCHASE_DAYS = 30;
// Same reasoning for duplicated spots: catch the next one, not the backlog.
const DUPLICATE_SPOT_DAYS = 60;

function computeAllocated(enr) {
  const isHB = (enr.course_type || '').toLowerCase().includes('handbuilding');
  const is10Class = enr.number_of_weeks === 10;
  if (is10Class) return enr.number_of_weeks || 10;
  if (isHB) return enr.class_credits_allocated || (enr.number_of_weeks || 4);
  // Standard WT — only flag when we have a real allocation to compare against,
  // otherwise we'd produce noise on enrollments with allocated=0.
  return enr.class_credits_allocated || enr.number_of_weeks || 0;
}

function formatStudentName(c) {
  if (!c) return 'Unknown student';
  const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
  return name || c.email || 'Unknown student';
}

async function checkOverAllocated() {
  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_type, number_of_weeks, class_credits_allocated, course_identifier, status, customers!course_enrollments_student_id_fkey(id, first_name, last_name, email)')
    .in('status', ['active', 'upcoming']);

  if (error) {
    console.error('[AnomalyProbe] over-allocated query error:', error);
    return [];
  }
  if (!enrollments || enrollments.length === 0) return [];

  const enrollmentIds = enrollments.map(e => e.id);

  // Batch-fetch all relevant bookings
  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select('id, course_enrollment_id, status')
    .in('course_enrollment_id', enrollmentIds)
    .in('status', ['attended', 'completed', 'booked']);

  if (bErr) {
    console.error('[AnomalyProbe] bookings query error:', bErr);
    return [];
  }

  const countByEnrollment = new Map();
  for (const b of bookings || []) {
    countByEnrollment.set(b.course_enrollment_id, (countByEnrollment.get(b.course_enrollment_id) || 0) + 1);
  }

  const findings = [];
  for (const enr of enrollments) {
    const allocated = computeAllocated(enr);
    if (allocated <= 0) continue; // can't meaningfully compare
    const committed = countByEnrollment.get(enr.id) || 0;
    if (committed > allocated) {
      const overage = committed - allocated;
      findings.push({
        type: 'over_allocated',
        severity: overage >= 2 ? 'high' : 'medium',
        student_id: enr.student_id,
        student_name: formatStudentName(enr.customers),
        student_email: enr.customers ? enr.customers.email || null : null,
        enrollment_id: enr.id,
        details: `${committed} bookings against ${allocated} credits (overage: ${overage}). Course: ${enr.course_identifier || 'unassigned'}, weeks: ${enr.number_of_weeks}.`,
      });
    }
  }
  return findings;
}

async function checkStaleUnassigned10Class() {
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: stale, error } = await supabase
    .from('course_enrollments')
    .select('id, student_id, created_at, number_of_weeks, customers!course_enrollments_student_id_fkey(id, first_name, last_name, email)')
    .eq('number_of_weeks', 10)
    .eq('status', 'active')
    .is('course_identifier', null)
    .lt('created_at', cutoff);

  if (error) {
    console.error('[AnomalyProbe] stale unassigned query error:', error);
    return [];
  }
  if (!stale || stale.length === 0) return [];

  const ids = stale.map(s => s.id);
  const { data: linked, error: bErr } = await supabase
    .from('bookings')
    .select('course_enrollment_id')
    .in('course_enrollment_id', ids);

  if (bErr) {
    console.error('[AnomalyProbe] stale bookings query error:', bErr);
    return [];
  }

  const haveBookings = new Set((linked || []).map(b => b.course_enrollment_id));

  return stale
    .filter(s => !haveBookings.has(s.id))
    .map(s => {
      const ageDays = Math.floor((Date.now() - new Date(s.created_at).getTime()) / (24 * 60 * 60 * 1000));
      return {
        type: 'stale_unassigned_10class',
        severity: ageDays >= 30 ? 'high' : 'medium',
        student_id: s.student_id,
        student_name: formatStudentName(s.customers),
        student_email: s.customers ? s.customers.email || null : null,
        enrollment_id: s.id,
        details: `10-class package created ${ageDays} days ago is still unassigned (no course, no bookings).`,
      };
    });
}

/**
 * Upcoming bookings that consume no credit because they carry no enrollment
 * link. getEnrollmentCredits counts by course_enrollment_id, so an unlinked
 * booking takes a seat and is charged to nobody — a free class.
 *
 * This is the check that would have caught Nicole Wong in April and Sanjana
 * Vijay in August. Both were invisible to every other invariant here, because
 * the stored counters and the computed ledger agreed with each other — they
 * were blind to the same booking.
 *
 * Only upcoming bookings are flagged. A past unlinked booking is history and
 * relinking it retroactively rewrites a balance the student has lived with, so
 * those are a per-student decision, never an alert.
 */
async function checkUnlinkedUpcomingBookings() {
  const todayStr = new Date().toISOString().split('T')[0];
  const CONSUMING = ['booked', 'attended', 'completed', 'forfeited', 'absent'];

  let bookings = [], page = 0, more = true;
  while (more) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, student_id, status, course_enrollment_id, class_instances!bookings_class_instance_id_fkey(class_date, class_type), customers!bookings_student_id_fkey(id, first_name, last_name, email)')
      .is('course_enrollment_id', null)
      .in('status', CONSUMING)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) {
      console.error('[AnomalyProbe] unlinked-booking query error:', error);
      return [];
    }
    bookings = bookings.concat(data || []);
    more = (data || []).length === 1000;
    page++;
  }

  return bookings
    .filter(b => (b.class_instances?.class_date || '').split(/[T ]/)[0] >= todayStr)
    .map(b => ({
      type: 'unlinked_upcoming_booking',
      severity: 'high',
      student_id: b.student_id,
      student_name: formatStudentName(b.customers),
      enrollment_id: null,
      details: `Booking ${b.id} on ${(b.class_instances?.class_date || '').slice(0, 10)} ` +
        `(${b.class_instances?.class_type || 'unknown class'}) has no enrollment link, so it consumes no credit. ` +
        `Repair with: node scripts/relink-unlinked-bookings.js --booking=${b.id} --apply`,
    }));
}

/**
 * Someone bought recently and has no enrollment to show for it.
 *
 * The enrollment is what gets a student into a cohort and onto a roster, so a
 * purchase without one means a paying customer is waiting and nothing in the
 * system knows. Known ways it has happened: dead Shopify webhooks, the em-dash
 * variant-title parser break (c6e72b2), and line-item quantity > 1 creating one
 * enrollment instead of two.
 *
 * Recent purchases only. An audit on 12/08/26 found 361 customers with a
 * purchase count and no enrollment, every one of them dated 2025 — Shopify
 * records imported at launch, before enrollments were created going forward.
 * Not one 2026 purchase was missing an enrollment, so the whole backlog is
 * archaeology and flagging it would be permanent noise. What matters is
 * catching the next one.
 */
async function checkRecentPurchaseWithoutEnrollment() {
  const cutoff = new Date(Date.now() - RECENT_PURCHASE_DAYS * 86400000).toISOString().split('T')[0];

  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, course_purchase_count, course_purchase_date')
    .gt('course_purchase_count', 0)
    .gte('course_purchase_date', cutoff);

  if (error) {
    console.error('[AnomalyProbe] recent-purchase query error:', error);
    return [];
  }
  if (!customers || !customers.length) return [];

  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('student_id')
    .in('student_id', customers.map(c => c.id));

  const hasEnrollment = new Set((enrollments || []).map(e => e.student_id));

  return customers
    .filter(c => !hasEnrollment.has(c.id))
    .map(c => ({
      type: 'recent_purchase_without_enrollment',
      severity: 'high',
      student_id: c.id,
      student_name: formatStudentName(c),
      enrollment_id: null,
      details: `Purchased on ${(c.course_purchase_date || '').slice(0, 10)} ` +
        `(${c.course_purchase_count} course${c.course_purchase_count === 1 ? '' : 's'}) but has no enrollment row. ` +
        `They are not in any cohort and will not appear on a roster — check the Shopify order synced correctly.`,
    }));
}

/**
 * A purchased spot enrolled twice for the same student.
 *
 * The sync dedupes a spot by (shopify_order_id, shopify_line_item_id), where
 * extra pax carry a per-unit suffix: `1527...` for spot 1, `1527...-2` for
 * spot 2. A spot filed under any other key is invisible to that dedupe, so the
 * next sync enrolls it again. It happened on 23/04/26: two +1s added by hand in
 * April were keyed 'MANUAL-DUP', and a deep re-sync duplicated both (Denise
 * Lai, Nigel Lim — phantoms removed 17/08/26).
 *
 * One line item legitimately producing several enrollments is NOT this. A
 * 3 Course Package spawns one enrollment per course, keyed '-C2' and '-C2-C3',
 * each with its own cohort and its own bookings — the first draft of this check
 * flagged three of them and found only one real problem. So a sibling only
 * counts as a duplicate when it is either the quiet phantom shape (no
 * course_identifier and no bookings, which is what a re-created spot looks
 * like) or sits in the same cohort as another row in the group.
 *
 * Grouping is (student_id, shopify_order_id) and deliberately NOT the line item
 * id: the whole failure mode is two rows for one spot carrying keys that do not
 * resemble each other ('MANUAL-DUP' vs '15271763345566-2'), so grouping by any
 * form of that key is blind to exactly the case worth catching.
 *
 * Recent enrollments only, for the reason check 4 gives: older tangles are
 * archaeology and flagging them forever is noise. What matters is the next one.
 */
function findDuplicateSpots(enrollments, bookingCount) {
  const groups = new Map();
  for (const e of enrollments) {
    const key = `${e.student_id}|${e.shopify_order_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const findings = [];
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;

    const cohorts = new Map();
    for (const e of rows) {
      if (!e.course_identifier) continue;
      cohorts.set(e.course_identifier, (cohorts.get(e.course_identifier) || 0) + 1);
    }

    for (const e of rows) {
      const bookings = bookingCount.get(e.id) || 0;
      const isPhantom = !e.course_identifier && bookings === 0;
      const sharesCohort = Boolean(e.course_identifier) && cohorts.get(e.course_identifier) > 1;
      if (!isPhantom && !sharesCohort) continue;

      const siblings = rows.filter(r => r.id !== e.id).map(r => `#${r.id} '${r.shopify_line_item_id}'`).join(', ');
      findings.push({
        type: 'duplicate_spot_enrollment',
        severity: 'medium',
        student_id: e.student_id,
        student_name: formatStudentName(e.customers),
        enrollment_id: e.id,
        details: isPhantom
          ? `Enrollment #${e.id} (key '${e.shopify_line_item_id}') on order ${e.shopify_order_id} has no cohort and ` +
            `no bookings, alongside ${siblings} on the same order. This is what a spot re-created by the sync ` +
            `looks like — the original was filed under a key the (shopify_order_id, shopify_line_item_id) dedupe ` +
            `cannot see. Cancel this one and re-key the original to match what the sync generates.`
          : `Enrollment #${e.id} (key '${e.shopify_line_item_id}') puts this student in cohort ${e.course_identifier} ` +
            `twice on order ${e.shopify_order_id}, alongside ${siblings}. Two enrollments in one cohort take two ` +
            `seats — keep the one carrying the bookings and cancel the other.`,
      });
    }
  }

  return findings;
}

async function checkDuplicateSpotEnrollments() {
  const cutoff = new Date(Date.now() - DUPLICATE_SPOT_DAYS * 86400000).toISOString();

  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select('id, student_id, shopify_order_id, shopify_line_item_id, course_identifier, status, created_at, customers:student_id (first_name, last_name, email)')
    .not('shopify_order_id', 'is', null)
    .neq('shopify_order_id', 'MANUAL')
    .neq('status', 'cancelled')
    .gte('created_at', cutoff);

  if (error) {
    console.error('[AnomalyProbe] duplicate-spot query error:', error);
    return [];
  }
  if (!enrollments || !enrollments.length) return [];

  // Booking counts, so an empty enrollment can be told from a real course.
  const { data: bookings } = await supabase
    .from('bookings')
    .select('course_enrollment_id')
    .in('course_enrollment_id', enrollments.map(e => e.id));
  const bookingCount = new Map();
  for (const b of bookings || []) {
    bookingCount.set(b.course_enrollment_id, (bookingCount.get(b.course_enrollment_id) || 0) + 1);
  }

  return findDuplicateSpots(enrollments, bookingCount);
}

const { weekdayName, todaySGT } = require('./sgtDate');

/**
 * course_start_date disagreeing with the day the cohort actually runs.
 *
 * Found 18/08/26: 6 of 8 upcoming cohorts stored the day BEFORE their first
 * class (WT1009NT_JL6, a Thursday cohort, stored 2026-09-09 — a Wednesday —
 * while its first class instance was 2026-09-10). A UTC/SGT boundary loss at
 * write time. Anything that renders course_start_date to a person shows the
 * wrong day, which is how a student nearly got told the wrong start date.
 *
 * Display code must resolve the real date via packageContinuation
 * .resolveFirstClassDate(). This check exists so the underlying drift is
 * visible rather than silently papered over by that helper.
 */
async function checkCohortStartDateDrift() {
  const today = todaySGT();
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_start_date, schedule_pattern, course_identifier, status, customers!course_enrollments_student_id_fkey(id, first_name, last_name, email)')
    .gte('course_start_date', today)
    .not('schedule_pattern', 'is', null)
    .not('course_start_date', 'is', null);

  if (error) {
    console.error('[AnomalyProbe] cohort start date query error:', error);
    return [];
  }

  // One finding per cohort, not per student — the drift is a property of the
  // cohort, and nine students in one bad cohort is one problem, not nine.
  const seen = new Map();
  for (const e of data || []) {
    if (e.status === 'cancelled') continue;
    const date = String(e.course_start_date).split(/[T ]/)[0];
    // Timezone-independent: Date#getDay() would answer differently on Railway
    // (UTC) than on a Singapore laptop, which is how this check first shipped
    // reporting every weekday one day early.
    const actual = weekdayName(date);
    const stated = String(e.schedule_pattern).toUpperCase();
    if (actual === stated) continue;

    const key = `${date}|${stated}`;
    if (!seen.has(key)) {
      seen.set(key, {
        type: 'cohort_start_date_drift',
        severity: 'high',
        student_id: e.student_id,
        student_name: formatStudentName(e.customers),
        student_email: e.customers ? e.customers.email || null : null,
        enrollment_id: e.id,
        details: `Cohort ${e.course_identifier || 'unassigned'} stores course_start_date ${date}, which is a ${actual[0]}${actual.slice(1).toLowerCase()}, but the cohort runs on ${stated[0]}${stated.slice(1).toLowerCase()}. Any screen or email showing course_start_date will state the wrong day.`,
        _count: 0,
      });
    }
    seen.get(key)._count++;
  }

  return [...seen.values()].map(f => {
    const { _count, ...rest } = f;
    return { ...rest, details: `${rest.details} Affects ${_count} enrollment${_count === 1 ? '' : 's'}.` };
  });
}


/**
 * A cohort carrying more signups than the studio sells.
 *
 * The gate on the Continue button only blocks DISCRETIONARY paths. An order
 * cannot be refused — the customer has already paid — so a cohort can still go
 * over, and until now nothing said so. WT2908PM_DL6 sat at 9/8 for days while
 * every screen reported it as healthy, because the only cap in the database is
 * the 10-wheel booking cap and 9 is under it.
 *
 * Counts SIGNUPS (distinct non-cancelled enrollments), not bookings, so
 * make-ups legitimately using the 9th and 10th wheel are not mistaken for
 * over-selling. One finding per cohort — nine students in one bad cohort is one
 * problem, not nine.
 */
async function checkCohortOverCapacity() {
  const { WT_SIGNUP_CAP, WT_SIGNUP_CRITICAL, signupSeverity } = require('../config/capacity');
  const today = todaySGT();

  const { data, error } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_start_date, schedule_pattern, class_time, course_identifier, course_type, status, customers!course_enrollments_student_id_fkey(id, first_name, last_name, email)')
    .gte('course_start_date', today)
    .not('schedule_pattern', 'is', null)
    .not('class_time', 'is', null);

  if (error) {
    console.error('[AnomalyProbe] cohort capacity query error:', error);
    return [];
  }

  const cohorts = new Map();
  for (const e of data || []) {
    if (e.status === 'cancelled') continue;
    if (/handbuilding/i.test(e.course_type || '')) continue; // HB is credit-based, not a cohort
    const key = `${String(e.course_start_date).split(/[T ]/)[0]}|${e.schedule_pattern}|${e.class_time}`;
    if (!cohorts.has(key)) cohorts.set(key, { sample: e, students: new Set() });
    cohorts.get(key).students.add(e.student_id);
  }

  const findings = [];
  for (const [key, c] of cohorts) {
    const signups = c.students.size;
    if (signups <= WT_SIGNUP_CAP) continue;
    const over = signups - WT_SIGNUP_CAP;
    const critical = signups >= WT_SIGNUP_CRITICAL;
    findings.push({
      type: 'cohort_over_capacity',
      severity: critical ? 'high' : signupSeverity(signups) === 'over' ? 'medium' : 'low',
      student_id: c.sample.student_id,
      student_name: formatStudentName(c.sample.customers),
      student_email: c.sample.customers ? c.sample.customers.email || null : null,
      enrollment_id: c.sample.id,
      details: `Cohort ${c.sample.course_identifier || key} has ${signups} signups against a cap of ${WT_SIGNUP_CAP} (${over} over). ${
        critical
          ? 'Every wheel is committed to a signup — this cohort can no longer absorb a single make-up.'
          : `Workable (${signups} signups + ${WT_SIGNUP_CRITICAL - signups} make-up wheel${WT_SIGNUP_CRITICAL - signups === 1 ? '' : 's'} still fits 10), but a seat was sold that was not meant to exist — check the listed quantity.`
      }`,
    });
  }
  return findings;
}

/**
 * Continuation offers past their deadline that were never closed.
 *
 * Lapsing happens in the nightly sweep. A pending row past its expiry means the
 * sweep did not run — and because a live offer blocks a new one for the same
 * cohort, that student silently stops being re-offered. A cron that quietly
 * stops looks exactly like a quiet week, so this is the only signal.
 */
async function checkStaleContinuationOffers() {
  const { data, error } = await supabase
    .from('continuation_offers')
    .select('id, student_id, expires_at, cohort_identifier, first_class_date, customers!continuation_offers_student_id_fkey(id, first_name, last_name, email)')
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString());

  if (error) {
    // Table may not exist on an environment without the migration.
    if (error.code !== 'PGRST116' && !/does not exist/i.test(error.message || '')) {
      console.error('[AnomalyProbe] stale offers query error:', error);
    }
    return [];
  }

  return (data || []).map(o => {
    const hoursLate = Math.floor((Date.now() - new Date(o.expires_at).getTime()) / 3600000);
    return {
      type: 'stale_continuation_offer',
      severity: hoursLate >= 48 ? 'high' : 'medium',
      student_id: o.student_id,
      student_name: formatStudentName(o.customers),
      student_email: o.customers ? o.customers.email || null : null,
      enrollment_id: null,
      details: `Offer #${o.id} for ${o.cohort_identifier || o.first_class_date} passed its deadline ${hoursLate}h ago and is still pending. The nightly sweep should have lapsed it — until it does, this student cannot be offered that cohort again.`,
    };
  });
}

/**
 * A package student owed a course with nowhere to go.
 *
 * By design these students are told NOTHING: an offer is only sent once a real
 * cohort exists at their day and time, so nobody ever receives a dateless
 * email. The cost of that rule is silence — if no cohort is ever scheduled,
 * the student simply waits and no part of the system mentions it. This check is
 * the counterweight.
 *
 * Covers 3-course packages only (package_total_courses >= 2). A 10-Class
 * package is one cohort plus flex classes booked individually, so there is no
 * next course to place them into.
 */
async function checkFinishingStudentNoCohort() {
  const { resolveNextCourse } = require('./packageContinuation');
  const { addDays, toYmd } = require('./sgtDate');
  const today = todaySGT();
  const horizon = addDays(today, 21);

  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*, customers!course_enrollments_student_id_fkey(id, first_name, last_name, email)')
    .gte('package_total_courses', 2)
    .neq('status', 'cancelled');

  if (error) {
    console.error('[AnomalyProbe] package student query error:', error);
    return [];
  }

  // Only the newest enrollment describes where a student is now.
  const latest = new Map();
  for (const e of data || []) {
    const prev = latest.get(e.student_id);
    if (!prev || (e.course_start_date || '') > (prev.course_start_date || '')) latest.set(e.student_id, e);
  }

  const findings = [];
  for (const e of latest.values()) {
    if (e.status === 'paused') continue; // a pause is a deliberate "not now"

    // Ending within three weeks, or already ended and still owed a course.
    const end = toYmd(e.course_end_date);
    if (end && end > horizon) continue;

    let r;
    try {
      r = await resolveNextCourse(e, e.student_id);
    } catch (err) {
      console.error(`[AnomalyProbe] resolve failed for student ${e.student_id}:`, err.message);
      continue;
    }
    if (r.reason !== 'no_matching_course') continue;

    const ended = end && end < today;
    findings.push({
      type: 'package_student_no_cohort',
      severity: ended ? 'high' : 'medium',
      student_id: e.student_id,
      student_name: formatStudentName(e.customers),
      student_email: e.customers ? e.customers.email || null : null,
      enrollment_id: e.id,
      details: `Owed ${r.remaining || 1} more course${(r.remaining || 1) === 1 ? '' : 's'} on a ${e.package_total_courses}-course package, but no cohort is scheduled at their slot (${e.schedule_pattern} ${e.class_time}). Their course ${ended ? `ended on ${end}` : `ends on ${end || 'an unknown date'}`}. They are deliberately not emailed until a cohort exists, so nothing else will surface this.`,
    });
  }
  return findings;
}

/**
 * A pickup the student has booked that nobody has staged yet.
 *
 * The +2 day rule exists so staff can put a batch out before the student comes
 * for it — but nothing announced a booking, so the whole arrangement rested on
 * somebody happening to open the pipeline board. Miss it for three days and a
 * student arrives to a cabinet with nothing in it, having been told a date.
 *
 * Severity climbs as the date closes: the last day before is when staging still
 * fixes it, and the day itself is already a failure in progress.
 */
async function checkUnstagedPickups() {
  const { toYmd, addDays } = require('./sgtDate');
  const today = todaySGT();

  const { data, error } = await supabase
    .from('piece_batches')
    .select('id, collection_date, piece_count, initials, customers(id, first_name, last_name, email)')
    .eq('status', 'collecting')
    .not('collection_date', 'is', null);

  if (error) {
    console.error('[AnomalyProbe] unstaged pickups query error:', error);
    return [];
  }

  const findings = [];
  for (const b of data || []) {
    const due = String(b.collection_date).split('T')[0];
    // Anything still unstaged counts, including dates already gone — a missed
    // pickup does not stop mattering because the day passed.
    if (due > toYmd(addDays(today, 3))) continue;

    const daysAway = Math.round(
      (new Date(due + 'T00:00:00+08:00') - new Date(toYmd(today) + 'T00:00:00+08:00')) / 86400000
    );

    let severity = 'low';
    if (daysAway <= 0) severity = 'high';
    else if (daysAway === 1) severity = 'medium';

    const when = daysAway < 0 ? `${Math.abs(daysAway)} day(s) ago`
      : daysAway === 0 ? 'TODAY'
      : daysAway === 1 ? 'TOMORROW'
      : `in ${daysAway} days`;

    findings.push({
      type: 'unstaged_pickup',
      severity,
      student_id: b.customers ? b.customers.id : null,
      student_name: formatStudentName(b.customers),
      student_email: b.customers ? b.customers.email || null : null,
      enrollment_id: null,
      details: `${formatStudentName(b.customers)} is collecting ${b.piece_count} piece(s) (${b.initials || 'no initials'}) ${when} — ${due} — and batch #${b.id} is still not in the cabinet. Find it and press Place in Cabinet, which is also what sends their confirmation.`,
    });
  }

  return findings;
}

/**
 * The handbuilding calendar is running out of classes.
 *
 * HB has no cohort to schedule from, so its calendar only exists because
 * hbScheduleGenerator fills it. If that job stops running — a failed deploy, a
 * crash in the 2 AM batch, a timetable emptied by mistake — nothing else in the
 * system notices. It went blank once already, on 2026-09-01, with 48 open
 * enrolments holding 165 unspent credits and no error anywhere to say so. HB
 * credits never expire, so there is no expiry sweep to trip either.
 *
 * The generator keeps a four-month horizon. Two weeks of runway left means it
 * has not run in over three months.
 */
const HB_RUNWAY_DAYS = 14;

async function checkHbCalendarRunway() {
  const { toYmd } = require('./sgtDate');
  const { HB_SLOTS } = require('../config/hbSchedule');
  const today = toYmd(todaySGT());

  const { data, error } = await supabase
    .from('class_instances')
    .select('class_date')
    .in('class_type', HB_SLOTS.map(s => s.classType))
    .eq('status', 'active')
    .gte('class_date', today)
    .order('class_date', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[AnomalyProbe] HB runway query error:', error);
    return [];
  }

  return hbRunwayFinding(data && data[0] ? toYmd(data[0].class_date) : null, today);
}

/**
 * The finding for a calendar whose last active class is `lastClassDate`, or
 * none if there is enough runway left.
 *
 * Split from the query so the threshold can be tested at its boundary — the
 * check is worthless if it is quiet in the one case it exists to catch.
 *
 * @param {string|null} lastClassDate - last active HB class, YYYY-MM-DD
 * @param {string} today - YYYY-MM-DD
 * @returns {Object[]} zero or one finding
 */
function hbRunwayFinding(lastClassDate, today) {
  const { addDays } = require('./sgtDate');
  if (lastClassDate && lastClassDate > addDays(today, HB_RUNWAY_DAYS)) return [];

  const details = lastClassDate
    ? `The handbuilding calendar runs out on ${lastClassDate} — under ${HB_RUNWAY_DAYS} days away. Students with HB credits will find nothing to book after that date. The nightly top-up should keep it four months ahead, so it has not run successfully in months: check the 2 AM batch, then run \`node scripts/backfill-hb-schedule.js --until <date> --write\` from server/.`
    : 'There are NO handbuilding classes scheduled at all. Every student holding HB credits is looking at an empty calendar right now. Run `node scripts/backfill-hb-schedule.js --until <date> --write` from server/ and check why the nightly top-up stopped.';

  return [{
    type: 'hb_calendar_runway',
    severity: 'high',
    student_id: null,
    student_name: null,
    student_email: null,
    enrollment_id: null,
    details,
  }];
}

/**
 * Customers whose stored email address Resend refuses to send to.
 *
 * A hard bounce puts the address on Resend's suppression list permanently.
 * Every later send returns "suppressed" and never leaves Resend, while
 * sendAndLogEmail still writes a success row to sent_emails — so the app
 * believes it is mailing someone who has heard nothing since. Sian Bostrom
 * (31/08/26) lost her Clay Club confirmation this way: her order carried a
 * one-character typo (sina… for sian…), the address bounced, and nothing
 * surfaced it until she was asked about it.
 *
 * Only addresses actually stored on a customer are reported. The list also
 * collects typos people mistype into the sign-in form, which harm nobody and
 * would otherwise make this fire every day until it is ignored.
 */
async function checkUndeliverableCustomerEmails() {
  if (!process.env.RESEND_API_KEY) return [];

  let suppressed;
  try {
    const res = await fetch('https://api.resend.com/suppressions?limit=100', {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (!res.ok) {
      console.error('[AnomalyProbe] Resend suppressions:', res.status);
      return [];
    }
    suppressed = ((await res.json()).data || []);
  } catch (err) {
    // Never let a third-party outage take down the rest of the probe.
    console.error('[AnomalyProbe] Resend suppressions unreachable:', err.message);
    return [];
  }
  if (suppressed.length === 0) return [];

  // Page: an unbounded select stops at 1000 rows without saying so.
  const customers = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('customers')
      .select('id, first_name, last_name, email').range(from, from + 999);
    if (error) throw error;
    customers.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  return undeliverableFindings(suppressed, customers);
}

/**
 * Pure half of checkUndeliverableCustomerEmails: which customers hold an
 * address that Resend will not deliver to. Split out so it is testable without
 * reaching Resend or the database.
 *
 * @param {Array<{email: string, created_at: string, origin: string}>} suppressed
 * @param {Array<{id: number, first_name: string, last_name: string, email: string}>} customers
 */
function undeliverableFindings(suppressed, customers) {
  const byAddress = new Map(
    (suppressed || []).map(s => [String(s.email || '').toLowerCase().trim(), s])
  );
  if (byAddress.size === 0) return [];

  const findings = [];
  for (const c of customers || []) {
    const addr = String(c.email || '').toLowerCase().trim();
    if (!addr) continue;
    const hit = byAddress.get(addr);
    if (!hit) continue;

    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || `customer ${c.id}`;
    findings.push({
      type: 'undeliverable_customer_email',
      severity: 'high',
      student_id: c.id,
      student_name: name,
      student_email: c.email,
      enrollment_id: null,
      details: `${name} <${c.email}> is on Resend's suppression list since ${String(hit.created_at).slice(0, 10)} (${hit.origin}). Every email the app sends them is discarded before it leaves Resend, and the app records it as sent — they have received nothing since. Usually a typo in the address: check it against the customer, correct it in Shopify AND on the customer record, then re-send anything they missed. Removing the suppression without fixing the address just bounces again.`,
    });
  }

  return findings;
}

/**
 * Phantom seat — the booking page offers a seat the server will refuse.
 *
 * The student page and the booking gate answer "is there room?" by different
 * routes: the page reads a batched payload, the gate re-counts one class at the
 * moment of booking. Whenever those two disagree in the permissive direction a
 * student is invited to book something that then fails, which is how a full
 * Sunday cohort advertised "7 left" for weeks (02/09/26 — the payload counted
 * bookings from a Supabase page capped at 1000 rows and silently undercounted
 * 190 of 386 classes).
 *
 * The specific bug is fixed; this check exists so the NEXT way they drift apart
 * is caught the night it appears rather than by a student hitting a dead Book
 * button. It compares the two paths directly and reports only the direction
 * that misleads — a page that is stricter than the gate is safe.
 */
async function checkPhantomSeats() {
  const { getAvailableClasses, checkSeatAvailability } = require('./bookingDb');
  const { todaySGT } = require('./sgtDate');

  const today = todaySGT();
  const offered = (await getAvailableClasses()).filter(
    c => String(c.classDate).slice(0, 10) >= today && !c.isFull
  );
  if (offered.length === 0) return [];

  const { data: rows, error } = await supabase
    .from('class_instances')
    .select('*')
    .in('id', offered.map(c => c.id));
  if (error) throw error;

  const byId = {};
  (rows || []).forEach(r => { byId[r.id] = r; });

  const findings = [];
  for (const cls of offered) {
    const row = byId[cls.id];
    if (!row) continue;

    // No studentId: a per-student capacity grant is a deliberate exception, not
    // an open seat, so the verdict wanted here is the one an ordinary student
    // would get.
    const verdict = await checkSeatAvailability(row, null, { checkWheels: true });
    if (verdict.allowed) continue;

    const { booked, cap, wheels, studioWheels } = verdict.counts;
    findings.push({
      type: 'phantom_seat',
      severity: 'high',
      student_id: null,
      student_name: null,
      enrollment_id: null,
      details: `${cls.classType} on ${String(cls.classDate).slice(0, 10)} ${cls.startTime} shows "${Math.max(0, cls.spotsAvailable)} left" with a live Book button, but the booking gate refuses it with ${verdict.reason} (${booked} booked against a class cap of ${cap}${wheels !== null ? `, ${wheels} in the timeslot against ${studioWheels}` : ''}). Students are being invited to book a seat that does not exist. The page and the gate count seats by different routes; find which one is wrong before touching capacity numbers.`,
    });
  }

  return findings;
}

/**
 * Run all invariant checks and return aggregated findings.
 * Failures within a single check do not abort the whole probe.
 */
async function runAnomalyProbe() {
  const results = await Promise.allSettled([
    checkOverAllocated(),
    checkStaleUnassigned10Class(),
    checkUnlinkedUpcomingBookings(),
    checkRecentPurchaseWithoutEnrollment(),
    checkDuplicateSpotEnrollments(),
    checkCohortStartDateDrift(),
    checkCohortOverCapacity(),
    checkStaleContinuationOffers(),
    checkFinishingStudentNoCohort(),
    checkUnstagedPickups(),
    checkHbCalendarRunway(),
    checkUndeliverableCustomerEmails(),
    checkPhantomSeats(),
  ]);

  const findings = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      findings.push(...r.value);
    } else if (r.status === 'rejected') {
      console.error('[AnomalyProbe] check failed:', r.reason);
    }
  }

  // Highest-severity first, then by type for stable ordering
  const sevRank = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) || a.type.localeCompare(b.type));

  return findings;
}

module.exports = { runAnomalyProbe, checkPhantomSeats, checkUndeliverableCustomerEmails, undeliverableFindings, checkHbCalendarRunway, hbRunwayFinding, checkUnstagedPickups, checkCohortStartDateDrift, checkCohortOverCapacity, checkStaleContinuationOffers, checkFinishingStudentNoCohort, checkOverAllocated, checkStaleUnassigned10Class, checkUnlinkedUpcomingBookings, checkRecentPurchaseWithoutEnrollment, checkDuplicateSpotEnrollments, findDuplicateSpots };
