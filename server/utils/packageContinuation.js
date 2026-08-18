/**
 * Package continuation — one path for placing a multi-course package student
 * into their next cohort.
 *
 * Three callers need this and must never drift apart:
 *   - the admin "Enroll in Next Course" button
 *   - the admin "Ask student" button, which needs to know what it is offering
 *   - the student's own confirmation on /continue/:token
 *
 * Extracted verbatim from routes/admin.js so the student-facing path cannot
 * quietly diverge from the admin one — in particular it cannot skip the
 * capacity gate.
 */

const { supabase } = require('./supabaseDb');
const supabaseDb = require('./supabaseDb');
const { getPackageProgress } = require('./packageProgress');
const { checkCohortSignupCapacity } = require('./cohortCapacity');

/**
 * Derive schedule info from a course identifier when the enrollment's own
 * fields are null, e.g. WT2802PM_DL6 → { schedulePattern: 'SATURDAY',
 * classTime: '1:00 PM - 3:30 PM' }.
 */
function deriveScheduleFromIdentifier(courseIdentifier) {
  if (!courseIdentifier) return {};
  const timeMatch = courseIdentifier.match(/(AM|PM|NT)_/);
  if (!timeMatch) return {};
  const timeCode = timeMatch[1];
  const timeMap = { AM: '9:30 AM - 12:00 PM', PM: '1:00 PM - 3:30 PM', NT: '7:00 PM - 9:30 PM' };
  const classTime = timeMap[timeCode] || null;

  const dateMatch = courseIdentifier.match(/^[A-Z]{2}(\d{2})(\d{2})/);
  if (!dateMatch) return { classTime };
  const day = parseInt(dateMatch[1]);
  const month = parseInt(dateMatch[2]) - 1;
  const year = new Date().getFullYear();
  const date = new Date(year, month, day);
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return { schedulePattern: days[date.getDay()], classTime };
}

/**
 * The last dated class this enrollment holds — used when course_end_date was
 * never populated, so "the next course after this one" still means something.
 */
async function deriveEndDateFromBookings(enrollmentId) {
  const { data: lastBooking } = await supabase
    .from('bookings')
    .select('class_instances!bookings_class_instance_id_fkey(class_date)')
    .eq('course_enrollment_id', enrollmentId)
    .order('class_instances(class_date)', { ascending: false })
    .limit(1);
  return lastBooking?.[0]?.class_instances?.class_date?.split(/[T ]/)[0]
    || new Date().toISOString().split('T')[0];
}

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/**
 * The date a cohort ACTUALLY starts, for showing to a human.
 *
 * course_enrollments.course_start_date cannot be trusted for display: on live
 * data it sits one day before the real first class on 6 of 8 upcoming cohorts
 * (WT1009NT_JL6 — a Thursday cohort — stores 2026-09-09, a Wednesday, while
 * its first class instance is 2026-09-10). The stored value is still the right
 * KEY for matching cohorts, because every enrollment shares the same wrong
 * value; it is only wrong as a date.
 *
 * So: prefer the first class instance, which is correct. Failing that (a
 * cohort with no classes created yet), nudge the stored date forward to the
 * weekday the cohort actually runs on.
 */
async function resolveFirstClassDate(courseIdentifier, fallbackDate, schedulePattern) {
  const wanted = DAY_NAMES.indexOf(String(schedulePattern || '').toUpperCase());

  // Weekday of a YYYY-MM-DD, evaluated in SGT so a UTC-midnight timestamp
  // cannot slide the date back a day — the exact mistake being guarded here.
  const weekdayOf = ymd => new Date(`${ymd}T00:00:00+08:00`).getDay();

  const base = String(courseIdentifier || '').split('.')[0];
  if (base) {
    const { data } = await supabase
      .from('class_instances')
      .select('class_date')
      .like('class_type', `${base}.%`)
      .order('class_date', { ascending: true })
      .limit(1);
    const first = data?.[0]?.class_date;
    if (first) {
      const ymd = String(first).split(/[T ]/)[0];
      // The booked class is the strongest evidence there is, so it wins — but
      // if it contradicts the cohort's own stated day, something is wrong
      // upstream and a human needs to know.
      if (wanted >= 0 && weekdayOf(ymd) !== wanted) {
        console.error(`[Continuation] ${base}: first class ${ymd} is a ${DAY_NAMES[weekdayOf(ymd)]} but the cohort claims ${schedulePattern}. Using the class date.`);
      }
      return ymd;
    }
  }

  const stored = String(fallbackDate || '').split(/[T ]/)[0];
  if (!stored || wanted < 0) return stored || null;

  const delta = (wanted - weekdayOf(stored) + 7) % 7;
  if (delta === 0) return stored;

  const d = new Date(`${stored}T00:00:00+08:00`);
  d.setDate(d.getDate() + delta);
  const corrected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  console.warn(`[Continuation] ${base || 'cohort'}: course_start_date ${stored} is a ${DAY_NAMES[weekdayOf(stored)]}, not ${schedulePattern}. Showing ${corrected}.`);
  return corrected;
}

/**
 * Guard for any date about to be shown to a student. Returns the date if its
 * weekday matches the cohort, otherwise null — callers must never render a
 * date this rejects.
 */
function assertDisplayDate(ymd, schedulePattern) {
  if (!ymd) return null;
  const wanted = DAY_NAMES.indexOf(String(schedulePattern || '').toUpperCase());
  if (wanted < 0) return ymd;
  const actual = new Date(`${String(ymd).split(/[T ]/)[0]}T00:00:00+08:00`).getDay();
  if (actual === wanted) return ymd;
  console.error(`[Continuation] REFUSING to display ${ymd} (${DAY_NAMES[actual]}) for a ${schedulePattern} cohort.`);
  return null;
}

/**
 * Work out which cohort this student's next course would be, and whether they
 * can actually be put in it.
 *
 * Never throws for an ordinary "no" — the reason is in the return value so
 * callers can render it. Reasons: not_package, no_remaining, missing_schedule,
 * no_matching_course, already_enrolled, cohort_full.
 *
 * @param {object} enrollment  the student's CURRENT course_enrollments row
 * @param {number} studentId
 */
async function resolveNextCourse(enrollment, studentId) {
  if (!enrollment || !enrollment.package_total_courses || enrollment.package_total_courses < 2) {
    return { ok: false, reason: 'not_package' };
  }

  // Position inside THIS package — a repeat purchase restarts at course 1.
  const progress = await getPackageProgress(supabase, studentId, enrollment);
  const remaining = progress ? progress.remaining : 0;
  const currentCourseNumber = progress ? progress.current : 0;
  if (remaining <= 0) return { ok: false, reason: 'no_remaining' };

  const derived = deriveScheduleFromIdentifier(enrollment.course_identifier);
  const schedulePattern = enrollment.schedule_pattern || derived.schedulePattern;
  const classTime = enrollment.class_time || derived.classTime;
  const currentEndDate = enrollment.course_end_date || await deriveEndDateFromBookings(enrollment.id);

  if (!schedulePattern || !classTime) return { ok: false, reason: 'missing_schedule' };

  // Backfill what we just derived so the next lookup is cheaper and the
  // enrollment stops being a special case.
  if (!enrollment.schedule_pattern || !enrollment.class_time) {
    await supabase
      .from('course_enrollments')
      .update({ schedule_pattern: schedulePattern, class_time: classTime, updated_at: new Date().toISOString() })
      .eq('id', enrollment.id);
  }

  // "After their current course ends" is not the same as "in the future". A
  // student between courses — finished one, not yet in the next — has an end
  // date in the past, and asking only for cohorts after it happily returns one
  // that has already run. April Koh (1182) resolved to WT2107NT_JL6 starting
  // 21 Jul while today was 18 Aug. Take whichever boundary is later.
  const todayStr = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
  const notBefore = currentEndDate > todayStr ? currentEndDate : todayStr;

  // Future enrollments at the same slot stand in for "launched cohorts" —
  // the app cannot see the Shopify catalogue, so a cohort is only visible
  // once somebody is in it.
  const { data: futureCourses } = await supabase
    .from('course_enrollments')
    .select('course_start_date, course_end_date, course_identifier, schedule_pattern, class_time, instructor, course_title, course_variant_title')
    .eq('schedule_pattern', schedulePattern)
    .eq('class_time', classTime)
    .gt('course_start_date', notBefore)
    .not('course_start_date', 'is', null)
    .order('course_start_date', { ascending: true });

  const seenDates = new Set();
  const uniqueCourses = (futureCourses || []).filter(c => {
    if (seenDates.has(c.course_start_date)) return false;
    seenDates.add(c.course_start_date);
    return true;
  });

  if (uniqueCourses.length === 0) return { ok: false, reason: 'no_matching_course' };

  const nextCourse = uniqueCourses[0];
  const firstClassDate = await resolveFirstClassDate(
    nextCourse.course_identifier, nextCourse.course_start_date, schedulePattern
  );
  const base = { nextCourse, firstClassDate, schedulePattern, classTime, currentEndDate, remaining, currentCourseNumber };

  const { data: existing } = await supabase
    .from('course_enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('course_start_date', nextCourse.course_start_date)
    .eq('schedule_pattern', schedulePattern)
    .eq('class_time', classTime)
    .maybeSingle();

  if (existing) return { ok: false, reason: 'already_enrolled', ...base };

  const seats = await checkCohortSignupCapacity({
    courseStartDate: nextCourse.course_start_date,
    schedulePattern,
    classTime,
    courseIdentifier: nextCourse.course_identifier,
  }, studentId);

  if (!seats.allowed) return { ok: false, reason: 'cohort_full', seats, ...base };

  return { ok: true, seats, ...base };
}

/**
 * Create the next enrollment. Re-resolves from scratch rather than trusting a
 * caller's earlier view, so a stale admin tab or a token page opened yesterday
 * cannot place a student into a cohort that has since filled.
 *
 * @returns {{ok: true, enrollment, nextCourse, packageCoursesRemaining}} on success,
 *          {{ok: false, reason, seats?}} otherwise
 */
async function enrollInNextCourse(enrollment, studentId) {
  const resolved = await resolveNextCourse(enrollment, studentId);
  if (!resolved.ok) return resolved;

  const { nextCourse, schedulePattern, classTime, remaining, currentCourseNumber } = resolved;
  const courseType = enrollment.course_type || 'Wheelthrowing Beginner';

  const newEnrollment = await supabaseDb.createCourseEnrollment({
    studentId,
    shopifyOrderId: enrollment.shopify_order_id,
    shopifyLineItemId: `${enrollment.shopify_line_item_id || 'PKG'}-C${currentCourseNumber + 1}`,
    courseTitle: enrollment.course_title,
    courseVariantTitle: nextCourse.course_variant_title || enrollment.course_variant_title,
    courseType,
    schedulePattern,
    numberOfWeeks: 6,
    courseStartDate: nextCourse.course_start_date,
    courseEndDate: nextCourse.course_end_date,
    classTime,
    instructor: nextCourse.instructor || enrollment.instructor,
    room: enrollment.room,
    status: 'active',
    packageTotalCourses: enrollment.package_total_courses,
    packageTotalClasses: enrollment.package_total_classes,
    packageCoursesRemaining: remaining - 1,
  });

  // Creates classes and bookings once the cohort has enough students. A
  // failure here leaves a valid enrollment behind on purpose — the student is
  // placed, and the threshold check re-runs on the next enrollment anyway.
  try {
    const { checkAndProcessThreshold } = require('./courseEnrollmentManager');
    await checkAndProcessThreshold(newEnrollment);
  } catch (thresholdErr) {
    console.error('⚠️ Threshold check failed (enrollment still created):', thresholdErr);
  }

  console.log(`📦 Package continuation: student ${studentId} → ${nextCourse.course_start_date} (${remaining - 1} remaining)`);

  return {
    ok: true,
    enrollment: newEnrollment,
    nextCourse,
    packageCoursesRemaining: remaining - 1,
  };
}

module.exports = {
  deriveScheduleFromIdentifier,
  resolveFirstClassDate,
  assertDisplayDate,
  resolveNextCourse,
  enrollInNextCourse,
};
