/**
 * Daily anomaly probe for enrollment/credit invariant violations.
 *
 * Born from the Ryan Ling case (cust #2231): two active 10-class packages where
 * June cohort bookings were appended to an older enrollment as makeups, over-
 * allocating it (5 future bookings against 1 credit remaining) while leaving
 * the newer enrollment unassigned (course_identifier=null). Nothing in the
 * system flagged the contradiction.
 *
 * Checks (start small, expand later):
 *  1. Over-allocated enrollment — committed bookings exceed allocated credits.
 *  2. Stale unassigned 10-class — number_of_weeks=10, status=active,
 *     course_identifier IS NULL, created >7 days ago, no bookings linked.
 *
 * Returns: Array<{type, severity, student_id, student_name, enrollment_id, details}>
 */

const { supabase } = require('./supabaseDb');

const STALE_DAYS = 7;

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
        enrollment_id: s.id,
        details: `10-class package created ${ageDays} days ago is still unassigned (no course, no bookings).`,
      };
    });
}

/**
 * Run all invariant checks and return aggregated findings.
 * Failures within a single check do not abort the whole probe.
 */
async function runAnomalyProbe() {
  const results = await Promise.allSettled([
    checkOverAllocated(),
    checkStaleUnassigned10Class(),
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

module.exports = { runAnomalyProbe, checkOverAllocated, checkStaleUnassigned10Class };
