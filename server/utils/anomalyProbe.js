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

module.exports = { runAnomalyProbe, checkOverAllocated, checkStaleUnassigned10Class, checkUnlinkedUpcomingBookings, checkRecentPurchaseWithoutEnrollment, checkDuplicateSpotEnrollments, findDuplicateSpots };
