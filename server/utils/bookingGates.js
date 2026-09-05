/**
 * Booking gates that more than one caller has to answer identically.
 *
 * The cross-type gate lived as two byte-identical copies inside routes/classes.js
 * and a third, already-drifting copy inside scripts/verify-hb-bookability.js —
 * the script whose whole job is to report which students cannot book. A monitor
 * running its own copy of the rule reports on a system that no longer exists, so
 * it reads the real gate instead of imitating it.
 *
 * The gate itself is not a glazing rule, which is why it is here and not in
 * utils/glazing.js. What it asks OF glazing.js is the one question that module
 * owns: does this student hold a 10-class package?
 */

const { supabase } = require('./supabaseClient');
const { hasTenClassPackage } = require('./glazing');

/**
 * May this student book this class, given what they are enrolled in?
 *
 * A handbuilding-only student may not book wheelthrowing, and a wheelthrowing-only
 * student may not book handbuilding. The 10-class package buys both, and whether
 * the student holds one is asked through the shared helper rather than re-derived
 * here.
 *
 * That last part is the fix this module was made for. Every copy of this gate
 * answered the package question from its own enrollment query filtered to status
 * 'active' — and a package is routinely marked completed once its 6-week cohort
 * ends while the 4 flex classes are still unspent. The exemption therefore did not
 * fire for exactly the students who needed it: refused handbuilding outright, they
 * could never spend the flex glazing class they still held. utils/glazing.js
 * filters on neq('cancelled') for this very reason, and now so does this.
 *
 * The HB/WT question below stays scoped to ACTIVE enrollments on purpose: it asks
 * what the student is enrolled in NOW, which is a different question from what
 * they have paid for and not yet used.
 *
 * @param {number} studentId
 * @param {{class_type: string}} classInstance
 * @returns {Promise<string|null>} the refusal to send, or null if they may book
 */
async function crossTypeRefusal(studentId, classInstance) {
  const classIsHB = (classInstance.class_type || '').startsWith('HB');
  const classIsWT = (classInstance.class_type || '').startsWith('WT');
  if (!classIsHB && !classIsWT) return null;

  if (await hasTenClassPackage(studentId)) return null;

  const { data: activeEnrollments } = await supabase
    .from('course_enrollments')
    .select('id, course_type, course_identifier')
    .eq('student_id', studentId)
    .eq('status', 'active');

  // No active enrollment at all is not this gate's business; the credit gate
  // ahead of it is what decides whether they may book anything.
  if (!activeEnrollments || activeEnrollments.length === 0) return null;

  const looksHB = (e) => (e.course_type || '').toLowerCase().includes('handbuilding') || (e.course_identifier || '').startsWith('HB');
  const looksWT = (e) => (e.course_type || '').toLowerCase().includes('wheelthrowing') || (e.course_identifier || '').startsWith('WT');
  const hasHBEnrollment = activeEnrollments.some(looksHB);
  const hasWTEnrollment = activeEnrollments.some(looksWT);

  if (classIsWT && hasHBEnrollment && !hasWTEnrollment) {
    return 'Your enrollment is for Handbuilding classes only. You cannot book Wheelthrowing classes.';
  }
  if (classIsHB && hasWTEnrollment && !hasHBEnrollment) {
    return 'Your enrollment is for Wheelthrowing classes only. You cannot book Handbuilding classes.';
  }
  return null;
}

module.exports = { crossTypeRefusal };
