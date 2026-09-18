const { isGlazingClass } = require('./glazing');

const GLAZING_ONLY = 'glazing';

function evaluateRestrictedCreditBooking({ remaining = 0, glazingOnly = 0, classInstance }) {
  const restricted = Math.min(Math.max(0, glazingOnly), Math.max(0, remaining));
  const unrestricted = Math.max(0, remaining - restricted);
  const targetIsGlazing = isGlazingClass(classInstance);

  return {
    allowed: remaining > 0 && (targetIsGlazing || unrestricted > 0),
    consumeGlazingOnly: remaining > 0 && targetIsGlazing && restricted > 0,
    unrestricted,
  };
}

async function getGlazingOnlyCredits(supabase, studentId, enrollmentId = null) {
  let query = supabase
    .from('booking_credit_adjustments')
    .select('id, booking_id, course_enrollment_id, created_at')
    .eq('student_id', studentId)
    .eq('restriction_type', GLAZING_ONLY)
    .is('consumed_by_booking_id', null)
    .order('created_at', { ascending: true });

  if (enrollmentId) query = query.eq('course_enrollment_id', enrollmentId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function consumeGlazingOnlyCredit(supabase, { studentId, enrollmentId, bookingId }) {
  const available = await getGlazingOnlyCredits(supabase, studentId, enrollmentId);
  const credit = available[0];
  if (!credit) return null;

  const { data, error } = await supabase
    .from('booking_credit_adjustments')
    .update({ consumed_by_booking_id: bookingId, consumed_at: new Date().toISOString() })
    .eq('id', credit.id)
    .eq('student_id', studentId)
    .is('consumed_by_booking_id', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

module.exports = {
  GLAZING_ONLY,
  evaluateRestrictedCreditBooking,
  getGlazingOnlyCredits,
  consumeGlazingOnlyCredit,
};
