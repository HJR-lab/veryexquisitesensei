/**
 * Glazing class detection for the frontend — mirrors server/utils/glazing.js.
 *
 * A class is glazing if it is EITHER explicitly marked (class_instances.is_glazing,
 * the only way a handbuilding drop-in can be one) OR the final week of a WT cohort,
 * where the trailing <total>.<week> of the class code are equal.
 *
 * Replaces four separate derivations that each got it wrong differently:
 *
 *   StudentRescheduleModal  classType.includes('6.6')   — missed 7.7 entirely, so a
 *                                                         7-week cohort's glazing
 *                                                         week looked ordinary
 *   StudentBookingsTab      '6.6' || '7.7' on a string
 *   SharedUI getClassLabel  '6.6' || '7.7'
 *   ClassScheduleNew        '6.6' || '7.7'
 *
 * The last three are right for wheelthrowing but blind to a marked HB class, so a
 * student looking for their glazing session saw it labelled as an ordinary class.
 *
 * Field names are read in both shapes on purpose: some endpoints map to camelCase
 * (classType/isGlazing) and others return raw rows (class_type/is_glazing).
 */

/** Is this class code a WT cohort's final week? e.g. WT0206NT_JL6.6, WT1104AM_DL7.7 */
export function isFinalWeekClassType(classType) {
  const m = String(classType || '').match(/(\d+)\.(\d+)$/);
  return !!m && m[1] === m[2];
}

/**
 * Is this class a glazing class?
 * @param {object|string} cls a class/booking object, or a bare class-type string
 */
export function isGlazingClass(cls) {
  if (!cls) return false;
  if (typeof cls === 'string') return isFinalWeekClassType(cls);

  const marked = cls.isGlazing ?? cls.is_glazing ??
    cls.class?.isGlazing ?? cls.classInstance?.isGlazing;
  if (marked === true) return true;

  const classType = cls.classType ?? cls.class_type ??
    cls.class?.classType ?? cls.classInstance?.classType ?? '';
  return isFinalWeekClassType(classType);
}
