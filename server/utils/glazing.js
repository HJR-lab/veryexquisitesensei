/**
 * Glazing class rules — one place, because there were four.
 *
 * Glazing used to be derived from the class code alone, in six places that
 * disagreed with each other:
 *
 *   BACKEND (all now routed through here)
 *   classes.js reschedule   /(\d+)\.(\d+)$/ both equal    — correct
 *   classes.js book-makeup  week === '6' || week === '7'  — WRONG: reads week 6
 *   classes.js reschedule                                   of a 7-WEEK course
 *                                                           (WT1104AM_DL7.6) as
 *                                                           glazing, imposing the
 *                                                           pre-glazing gap around
 *                                                           an ordinary class
 *
 *   FRONTEND (display only, not yet unified)
 *   StudentRescheduleModal  classType.includes('6.6')     — misses 7.7
 *   StudentBookingsTab      6.6 || 7.7, and a positional "last unbooked" guess
 *   SharedUI.jsx            6.6 || 7.7
 *   ClassScheduleNew.jsx    marked flag + <total>.<week>   — correct
 *
 * The frontend sites that test 6.6 || 7.7 are right for WT but cannot see a marked
 * HB glazing class, so they label one as an ordinary class. Display-only, so a
 * student sees the wrong badge rather than being wrongly allowed or blocked.
 *
 * A WT cohort's glazing is still its final week — that is structural and worth
 * keeping automatic. What is new is that a class can also be marked as glazing
 * explicitly (class_instances.is_glazing), which is the only way an HB drop-in
 * can be one: HB has no week numbering for the regex to read.
 */

// How many of a glazing class's seats may be taken by glazing students. The
// class keeps its own max_capacity (HB is 8); this caps the glazing share of it,
// so a marked HB session still works as a normal handbuilding class for
// everyone else. Per-class override lives in class_instances.glazing_capacity.
const GLAZING_SUBCAP = 4;

// Minimum days between the second-to-last class and the glazing class. Work made
// in that class has to dry (~3 days) and then be bisque fired before it can be
// glazed (~3 days) — so anything thrown or built inside this window cannot be
// glaze fired in time, and the student would glaze nothing at their final class.
//
// Applies to everyone. This replaced a 5-day gap that only covered cohort
// students: the kiln schedule does not depend on what someone bought, so a
// cohort makeup booked 5 days out was just as unfireable as a package student's
// flex class. Package students previously had no gap rule at all — they are
// exempt from the after-glazing block (they legitimately book after their 6.6
// cohort glazing) and the gap check sat inside that same exemption.
const GLAZING_DRYING_GAP_DAYS = 6;

/**
 * Is this class code a WT cohort's final (glazing) week?
 * e.g. WT0206NT_JL6.6 → true, WT1104AM_DL7.7 → true, WT0206NT_JL6.3 → false
 */
function isFinalWeekClassType(classType) {
  const m = String(classType || '').match(/(\d+)\.(\d+)$/);
  return !!m && m[1] === m[2];
}

/**
 * Is this class a glazing class — either marked as one, or a WT cohort's final week?
 * @param {object} classInstance needs class_type and (optionally) is_glazing
 */
function isGlazingClass(classInstance) {
  if (!classInstance) return false;
  return classInstance.is_glazing === true || isFinalWeekClassType(classInstance.class_type);
}

/**
 * Was this class explicitly marked (as opposed to being a WT final week)?
 * Marked classes are the ones carrying the glazing sub-capacity.
 */
function isMarkedGlazing(classInstance) {
  return classInstance?.is_glazing === true;
}

/**
 * How many glazing bookings this class allows. Only marked classes are capped —
 * a WT cohort's final week is glazing for the whole cohort by definition, so
 * capping its glazing share would lock out students who are already enrolled.
 * @returns {number|null} null when no glazing sub-cap applies
 */
function glazingSubCap(classInstance) {
  if (!isMarkedGlazing(classInstance)) return null;
  const own = classInstance.glazing_capacity;
  return Number.isInteger(own) && own >= 0 ? own : GLAZING_SUBCAP;
}

/**
 * Set or clear a class's glazing marker. Shared by the instructor and admin
 * endpoints, which differ only in who they let through — the rules about what a
 * valid change looks like belong here, once.
 *
 * @param {number|string} classId
 * @param {{isGlazing: boolean, glazingCapacity?: number|null}} change
 * @returns {{class: object}|{error: string, status: number}}
 */
async function setClassGlazing(classId, { isGlazing, glazingCapacity }) {
  const { supabase } = require('./supabaseClient');

  if (typeof isGlazing !== 'boolean') {
    return { error: 'isGlazing (boolean) is required', status: 400 };
  }
  if (glazingCapacity !== undefined && glazingCapacity !== null &&
      (!Number.isInteger(glazingCapacity) || glazingCapacity < 0)) {
    return { error: 'glazingCapacity must be a whole number of places, or null for the default', status: 400 };
  }

  // Unmarking a class that glazing bookings already rely on would leave those
  // students with a spent glazing entitlement and nothing to show for it.
  if (!isGlazing) {
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('class_instance_id', classId)
      .eq('status', 'booked')
      .eq('counts_as_glazing', true);

    if (count > 0) {
      return {
        error: `${count} student${count !== 1 ? 's have' : ' has'} already booked this as their glazing class. Move them first, then unmark it.`,
        status: 400,
      };
    }
  }

  const update = { is_glazing: isGlazing, updated_at: new Date().toISOString() };
  if (isGlazing) {
    if (glazingCapacity !== undefined) update.glazing_capacity = glazingCapacity;
  } else {
    update.glazing_capacity = null;
  }

  const { data, error } = await supabase
    .from('class_instances')
    .update(update)
    .eq('id', classId)
    .select('id, class_type, class_date, start_time, instructor, is_glazing, glazing_capacity, max_capacity')
    .single();

  if (error) return { error: error.message, status: 500 };
  return { class: data };
}

module.exports = {
  GLAZING_SUBCAP,
  GLAZING_DRYING_GAP_DAYS,
  isFinalWeekClassType,
  isGlazingClass,
  isMarkedGlazing,
  glazingSubCap,
  setClassGlazing,
};
