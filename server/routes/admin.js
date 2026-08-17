const supabaseDb = require('../utils/supabaseDb');
const { generateICS, generateMultipleICS } = require('../utils/calendarGenerator');
const courseConfig = require('../utils/courseConfig');
const { getPackageProgress } = require('../utils/packageProgress');

// In-memory cache for admin stats summary (30s TTL)
let adminStatsSummaryCache = null;
let adminStatsSummaryCacheTime = 0;
const ADMIN_STATS_CACHE_TTL = 30 * 1000; // 30 seconds

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler }) {

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Search students by name or email
app.get('/api/admin/students/search', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ students: [] });
  const { data, error } = await supabaseDb.supabase
    .from('customers')
    .select('id, email, first_name, last_name, customer_type')
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(10);
  if (error) throw error;
  res.json({ students: data || [] });
}));

// Students owed classes with nothing booked — the quiet failure mode.
//
// Nicole Wong is the case that prompted this: owed 2 classes, her follow-on
// cohort was cancelled, and nobody was ever prompted to rebook her. Her record
// looked healthy because it was: ACTIVE, credits intact, simply forgotten.
// Nothing here is automated and nothing reaches the student.
app.get('/api/admin/students/idle-credits', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { supabase } = supabaseDb;
  const todayStr = new Date().toISOString().split('T')[0];

  let enrollments = [], page = 0, more = true;
  while (more) {
    const { data } = await supabase
      .from('course_enrollments')
      .select(`
        id, student_id, course_title, course_identifier, course_type, status,
        number_of_weeks, class_credits_allocated, class_credits_remaining,
        credits_closed_at, course_end_date,
        customers!course_enrollments_student_id_fkey (id, email, first_name, last_name, last_login_at)
      `)
      .in('status', ['active', 'paused', 'upcoming', 'completed'])
      .range(page * 1000, (page + 1) * 1000 - 1);
    enrollments = enrollments.concat(data || []);
    more = (data || []).length === 1000;
    page++;
  }

  const rows = [];
  for (const enr of enrollments) {
    if (enr.credits_closed_at) continue;

    const credits = await supabaseDb.getEnrollmentCredits(enr.id);
    if (credits.remaining <= 0) continue;

    // "Nothing booked" means nothing AHEAD of them. Past bookings are history;
    // what matters is whether anything is coming.
    const { data: upcoming } = await supabase
      .from('bookings')
      .select('id, class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('course_enrollment_id', enr.id)
      .eq('status', 'booked');

    const futureCount = (upcoming || []).filter(b => {
      const d = b.class_instances?.class_date?.split(/[T ]/)[0];
      return d && d >= todayStr;
    }).length;

    if (futureCount > 0) continue;

    const c = enr.customers || {};
    rows.push({
      enrollmentId: enr.id,
      studentId: enr.student_id,
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email,
      email: c.email,
      lastLoginAt: c.last_login_at,
      courseTitle: enr.course_title,
      courseIdentifier: enr.course_identifier,
      status: enr.status,
      remaining: credits.remaining,
      attended: credits.attended,
      allocated: credits.allocated,
      courseEndDate: enr.course_end_date,
    });
  }

  // Most owed first — the biggest obligations are the ones worth chasing.
  rows.sort((a, b) => b.remaining - a.remaining);

  res.json({
    students: rows,
    totalStudents: rows.length,
    totalClassesOwed: rows.reduce((s, r) => s + r.remaining, 0),
  });
}));

// Get student statistics summary (lightweight, count-only, cached 30s)
app.get('/api/admin/students/stats/summary', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  // Return cached result if fresh
  if (adminStatsSummaryCache && (Date.now() - adminStatsSummaryCacheTime < ADMIN_STATS_CACHE_TTL)) {
    return res.json(adminStatsSummaryCache);
  }

  const [
    { count: totalStudents, error: e1 },
    { count: activeStudents, error: e2 },
    { count: pausedStudents, error: e3 },
    { count: hbStudents, error: e4 },
    { count: activeMembers, error: e5 }
  ] = await Promise.all([
    supabaseDb.supabase
      .from('customers')
      .select('*', { count: 'exact', head: true }),
    supabaseDb.supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'upcoming']),
    supabaseDb.supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'paused'),
    supabaseDb.supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true })
      .ilike('course_type', '%handbuilding%')
      .in('status', ['active', 'upcoming']),
    supabaseDb.supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'expiring'])
  ]);

  const err = e1 || e2 || e3 || e4 || e5;
  if (err) throw err;

  const result = {
    totalStudents: totalStudents || 0,
    activeStudents: activeStudents || 0,
    pausedStudents: pausedStudents || 0,
    hbStudents: hbStudents || 0,
    activeMembers: activeMembers || 0
  };

  // Cache the result
  adminStatsSummaryCache = result;
  adminStatsSummaryCacheTime = Date.now();

  res.json(result);
}));

// Lightweight student list — fast initial load (replaces heavy /stats for page render)
app.get('/api/admin/students/list', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = req.query.limit === 'all' ? null : (parseInt(req.query.limit) || 50);
  const filter = req.query.filter || 'all'; // 'all'|'wt-all'|'pkg-wt6'|'hb-all'|'pkg-hb4'|'members'

  // Single query: enrollments with customer data
  const { data: enrollments, error: enrErr } = await supabaseDb.supabase
    .from('course_enrollments')
    .select(`
      id, student_id, course_type, course_title, course_variant_title,
      course_identifier, schedule_pattern, class_time, status,
      number_of_weeks, weeks_completed, weeks_remaining,
      class_credits_allocated, class_credits_used, class_credits_remaining,
      course_start_date, course_end_date, created_at, package_total_courses,
      customers!course_enrollments_student_id_fkey (
        id, email, first_name, last_name, customer_type,
        course_purchase_count, classes_allocated, created_at,
        last_login_at, login_count
      )
    `)
    .in('status', ['active', 'paused', 'upcoming'])
    .order('created_at', { ascending: false });

  // Also fetch completed HB enrollments — filter for remaining credits in JS (computed, not stale column)
  const { data: completedHBAll } = await supabaseDb.supabase
    .from('course_enrollments')
    .select(`
      id, student_id, course_type, course_title, course_variant_title,
      course_identifier, schedule_pattern, class_time, status,
      number_of_weeks, weeks_completed, weeks_remaining,
      class_credits_allocated, class_credits_used, class_credits_remaining,
      credits_closed_at,
      course_start_date, course_end_date, created_at, package_total_courses,
      customers!course_enrollments_student_id_fkey (
        id, email, first_name, last_name, customer_type,
        course_purchase_count, classes_allocated, created_at,
        last_login_at, login_count
      )
    `)
    .eq('status', 'completed')
    .ilike('course_type', '%handbuilding%')
    .order('created_at', { ascending: false });

  // Filter completed HB enrollments that still have remaining credits (computed from bookings).
  // A block an admin has deliberately closed is honoured even when the computed
  // value disagrees — e.g. legacy rows with no bookings at all would otherwise
  // compute a full "remaining" from nothing. Closure is an explicit fact
  // (credits_closed_at), not an inference from the stored number being zero.
  const completedHB = [];
  for (const enr of (completedHBAll || [])) {
    if (enr.credits_closed_at) continue;
    const credits = await supabaseDb.getEnrollmentCredits(enr.id);
    if (credits.remaining > 0) completedHB.push(enr);
  }

  // Merge — completedHB appended so active/paused take priority in dedup
  const allEnrollments = [...(enrollments || []), ...(completedHB || [])];

  if (enrErr) throw enrErr;

  // Get memberships + booking attendance counts in parallel
  const [{ data: memberships }, { data: bookingRows }] = await Promise.all([
    supabaseDb.supabase
      .from('memberships')
      .select('id, customer_id, membership_type, status, start_date, end_date, purchase_date, created_at, customers!memberships_customer_id_fkey(id, email, first_name, last_name, customer_type)')
      // 'pending' included: a Clay Club signup is pending until an admin
      // activates it on the member's first visit. Excluding it made brand-new
      // signups invisible in the Users list entirely.
      // Ordered newest-first so that when a member has several memberships
      // (renewals), the current one wins the membershipByEmail lookup and the
      // earlier ones stay as history.
      .in('status', ['active', 'expiring', 'pending'])
      .order('created_at', { ascending: false }),
    // Paginate bookings to avoid Supabase 1000-row default limit
    (async () => {
      let all = [], page = 0, hasMore = true;
      while (hasMore) {
        const { data } = await supabaseDb.supabase
          .from('bookings')
          .select('course_enrollment_id, status, class_instances!bookings_class_instance_id_fkey(class_date)')
          .in('status', ['booked', 'attended', 'completed'])
          .not('course_enrollment_id', 'is', null)
          .range(page * 1000, (page + 1) * 1000 - 1);
        all = all.concat(data || []);
        hasMore = (data || []).length === 1000;
        page++;
      }
      return { data: all };
    })()
  ]);

  // Build attended count per enrollment (attended/completed + past booked)
  const todayStr = new Date().toISOString().split('T')[0];
  const attendedByEnrollment = {};
  // Date of the last class this enrollment actually sat. Derived from bookings
  // rather than read from course_end_date, because that column is null for 27%
  // of handbuilding rows by design — HB is credit-based drop-in and has no
  // fixed course end. What happened is a better answer than what was planned,
  // and it costs nothing: these rows are already in memory.
  const lastClassByEnrollment = {};
  (bookingRows || []).forEach(b => {
    if (!b.course_enrollment_id) return;
    const classDate = b.class_instances?.class_date?.split(/[T ]/)[0];
    const isPast = classDate < todayStr;
    if (b.status === 'attended' || b.status === 'completed' || (b.status === 'booked' && isPast)) {
      attendedByEnrollment[b.course_enrollment_id] = (attendedByEnrollment[b.course_enrollment_id] || 0) + 1;
    }
    if (classDate && isPast) {
      const prev = lastClassByEnrollment[b.course_enrollment_id];
      if (!prev || classDate > prev) lastClassByEnrollment[b.course_enrollment_id] = classDate;
    }
  });

  // Build student map — pick most recent enrollment per student
  const studentMap = {};
  const membershipByEmail = {};

  (memberships || []).forEach(m => {
    const email = m.customers?.email;
    if (!email) return;
    // Memberships arrive newest-first. A member with renewals has several
    // rows; the first one seen is the current membership and the rest are
    // history, so never let an older row overwrite it.
    if (membershipByEmail[email]) return;
    const now = new Date();
    const end = m.end_date ? new Date(m.end_date) : null;
    const daysRemaining = end ? Math.ceil((end - now) / (1000 * 60 * 60 * 24)) : null;
    membershipByEmail[email] = {
      membershipId: m.id,
      membershipType: m.membership_type,
      membershipStatus: m.status,
      startDate: m.start_date,
      endDate: m.end_date,
      daysRemaining
    };
  });

  for (const enr of allEnrollments) {
    const student = enr.customers;
    if (!student) continue;
    const sid = student.id;

    const isHB = (enr.course_type || '').toLowerCase().includes('handbuilding');
    const isWT = !isHB;

    // Compute HB credits from bookings (not stale DB columns)
    if (isHB) {
      enr._computedCredits = await supabaseDb.getEnrollmentCredits(enr.id);
    }

    const entry = {
      studentId: student.id,
      name: `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown',
      email: student.email,
      courseType: enr.course_type,
      courseTitle: enr.course_title,
      variantTitle: enr.course_variant_title || (enr.schedule_pattern && enr.course_start_date && enr.course_end_date
        ? `${enr.schedule_pattern} • ${new Date(enr.course_start_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}–${new Date(enr.course_end_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} • ${enr.class_time || ''}`
        : null),
      courseIdentifier: enr.course_identifier,
      enrollmentStatus: enr.status,
      enrollmentId: enr.id,
      enrollmentCreatedAt: enr.created_at,
      schedulePattern: enr.schedule_pattern,
      classTime: enr.class_time,
      numberOfWeeks: enr.number_of_weeks,
      // Pause progress — surfaced on paused rows in the Users list so the
      // standalone /admin/students/paused page is no longer needed.
      weeksCompleted: enr.weeks_completed || 0,
      weeksRemaining: enr.weeks_remaining ?? enr.number_of_weeks,
      packageTotalCourses: enr.package_total_courses,
      creditsAllocated: isHB ? enr.class_credits_allocated : null,
      creditsUsed: isHB ? (enr._computedCredits?.attended ?? enr.class_credits_used) : null,
      creditsRemaining: isHB ? (enr._computedCredits?.remaining ?? enr.class_credits_remaining) : null,
      classesAllocated: isWT ? (enr.number_of_weeks || 6) : null,
      classesAttended: attendedByEnrollment[enr.id] || 0,
      coursePurchaseCount: student.course_purchase_count || 1,
      customerType: student.customer_type,
      isHB,
      isWT,
      membership: membershipByEmail[student.email] || null,
      lastLoginAt: student.last_login_at || null,
      loginCount: student.login_count || 0
    };

    // Keep most recent enrollment per student, but track upcoming separately
    // Priority: active/paused > completed (completed only used if no active/paused exists)
    if (!studentMap[sid]) {
      studentMap[sid] = { current: null, upcoming: null, pkgCourses: 0 };
    }

    // Track the largest multi-course package flag across ALL of this student's
    // enrollments. A 3-course package sitting on an upcoming (future-dated) or
    // otherwise non-primary enrollment must still classify the student as a
    // package buyer (x3) — otherwise a concurrent single-course enrollment that
    // happens to be "primary" hides it.
    if ((enr.package_total_courses || 0) > studentMap[sid].pkgCourses) {
      studentMap[sid].pkgCourses = enr.package_total_courses;
    }

    if (enr.status === 'upcoming' || (enr.course_start_date && new Date(enr.course_start_date) > new Date())) {
      if (!studentMap[sid].upcoming || new Date(enr.created_at) > new Date(studentMap[sid].upcoming.enrollmentCreatedAt)) {
        studentMap[sid].upcoming = entry;
      }
    } else if (enr.status === 'completed') {
      // Only use completed if no active/paused enrollment exists yet
      if (!studentMap[sid].current || studentMap[sid].current.enrollmentStatus === 'completed') {
        if (!studentMap[sid].current || new Date(enr.created_at) > new Date(studentMap[sid].current.enrollmentCreatedAt)) {
          studentMap[sid].current = entry;
        }
      }
    } else {
      // active or paused — always preferred over completed
      if (!studentMap[sid].current || studentMap[sid].current.enrollmentStatus === 'completed' || new Date(enr.created_at) > new Date(studentMap[sid].current.enrollmentCreatedAt)) {
        studentMap[sid].current = entry;
      }
    }
  }

  // Build flat list
  let students = Object.values(studentMap).map(({ current, upcoming, pkgCourses }) => {
    // Prefer a live (active/paused) enrollment. Otherwise an upcoming course
    // outranks a completed one — a finished HB with leftover credits must not
    // mask an active/upcoming WT enrollment that simply starts in the future.
    const primary = (current && current.enrollmentStatus !== 'completed')
      ? current
      : (upcoming || current);
    if (!primary) return null;
    return {
      ...primary,
      // Student-level package flag: reflects a package on ANY enrollment, not
      // just whichever one was chosen as primary above.
      packageTotalCourses: pkgCourses || primary.packageTotalCourses || null,
      upcomingCourse: (upcoming && primary !== upcoming) ? {
        courseIdentifier: upcoming.courseIdentifier,
        variantTitle: upcoming.variantTitle,
        numberOfWeeks: upcoming.numberOfWeeks || 6
      } : null,
      // For sorting by most recent enrollment
      latestEnrollmentDate: upcoming ? upcoming.enrollmentCreatedAt : primary.enrollmentCreatedAt
    };
  }).filter(Boolean);

  // Add members-only (no enrollment)
  const emailSet = new Set(students.map(s => s.email));
  (memberships || []).forEach(m => {
    const email = m.customers?.email;
    if (!email) return;
    const alreadyListed = emailSet.has(email);
    if (!alreadyListed) {
      students.push({
        // Carried so per-customer data keyed on customer id (VES credit
        // balance) resolves for members too. Navigation is by email, so this
        // changes nothing about where the row links.
        studentId: m.customers.id,
        name: `${m.customers.first_name || ''} ${m.customers.last_name || ''}`.trim(),
        email,
        courseType: null, courseTitle: null, variantTitle: null, courseIdentifier: null,
        enrollmentStatus: 'member', enrollmentId: null,
        // A pending Clay Club membership has no start_date — the term only
        // begins on the member's first visit. Falling back to purchase_date
        // keeps them sorted by when they actually signed up; without it they
        // sort as epoch 0 and land at the very bottom of the Users list.
        enrollmentCreatedAt: m.start_date || m.purchase_date,
        isHB: false, isWT: false,
        membership: membershipByEmail[email],
        latestEnrollmentDate: m.start_date || m.purchase_date,
        customerType: m.customers.customer_type
      });
    }
  });

  // Continuation-pending package students: WT multi-course package students
  // who completed every course created so far but still have package courses
  // remaining (between cohorts — no active/paused/upcoming enrollment exists
  // yet for the next course). Without this they are invisible in the admin
  // list/search, which blocks the admin from opening their detail page to
  // click "Continue Package". Read-only.
  const { data: completedPkgAll } = await supabaseDb.supabase
    .from('course_enrollments')
    .select(`
      id, student_id, course_type, course_title, course_variant_title,
      course_identifier, schedule_pattern, class_time, status,
      number_of_weeks, weeks_completed, weeks_remaining,
      class_credits_allocated, class_credits_used, class_credits_remaining,
      course_start_date, course_end_date, created_at, package_total_courses,
      package_courses_remaining,
      customers!course_enrollments_student_id_fkey (
        id, email, first_name, last_name, customer_type,
        course_purchase_count, classes_allocated, created_at,
        last_login_at, login_count
      )
    `)
    .eq('status', 'completed')
    .gt('package_total_courses', 1)
    .order('created_at', { ascending: false });

  if (completedPkgAll && completedPkgAll.length) {
    const sids = [...new Set(completedPkgAll.map(e => e.student_id))];
    // Count consumed package courses (active + completed) per student in one
    // grouped query — avoids an N+1 across the candidate list.
    // Legacy fallback only — rows written before package_courses_remaining
    // existed. It counts every package the student has ever held, so it
    // overcounts once a student buys a SECOND package; the per-row column is
    // preferred below because it restarts at each new purchase.
    const { data: pkgRows } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('student_id, status, package_total_courses')
      .in('student_id', sids)
      .in('status', ['active', 'completed'])
      .gt('package_total_courses', 1);
    const usedByStudent = {};
    (pkgRows || []).forEach(r => {
      usedByStudent[r.student_id] = (usedByStudent[r.student_id] || 0) + 1;
    });

    const seenSid = new Set();
    for (const enr of completedPkgAll) {
      // completedPkgAll is ordered created_at desc → first row per student
      // is their latest completed package course.
      const sid = enr.student_id;
      if (seenSid.has(sid)) continue;
      seenSid.add(sid);
      const student = enr.customers;
      if (!student) continue;
      if (emailSet.has(student.email)) continue; // already listed (has active/paused/upcoming)
      const remaining = enr.package_courses_remaining != null
        ? enr.package_courses_remaining
        : (enr.package_total_courses || 0) - (usedByStudent[sid] || 0);
      if (remaining <= 0) continue; // package fully consumed — genuinely done
      students.push({
        name: `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown',
        email: student.email,
        courseType: enr.course_type,
        courseTitle: enr.course_title,
        variantTitle: enr.course_variant_title || null,
        courseIdentifier: enr.course_identifier,
        // Surfaces via the existing WT-active frontend filter (a between-
        // courses package customer is functionally an active customer).
        enrollmentStatus: 'active',
        continuationPending: true,
        packageCoursesRemaining: remaining,
        enrollmentId: enr.id,
        enrollmentCreatedAt: enr.created_at,
        schedulePattern: enr.schedule_pattern,
        classTime: enr.class_time,
        numberOfWeeks: enr.number_of_weeks,
        packageTotalCourses: enr.package_total_courses,
        creditsAllocated: null,
        creditsUsed: null,
        creditsRemaining: null,
        classesAllocated: enr.number_of_weeks || 6,
        classesAttended: attendedByEnrollment[enr.id] || 0,
        coursePurchaseCount: student.course_purchase_count || 1,
        customerType: student.customer_type,
        isHB: false,
        isWT: true,
        membership: membershipByEmail[student.email] || null,
        lastLoginAt: student.last_login_at || null,
        loginCount: student.login_count || 0,
        latestEnrollmentDate: enr.created_at,
      });
      emailSet.add(student.email);
    }
  }

  // Past students: every enrollment they have is finished.
  //
  // They fall out of all three queries above, which is why they disappeared
  // from the Users list entirely once a course ended — and with them, any way
  // to see who still has work sitting in the studio. Added last so the blocks
  // above keep first claim on a student: anyone already listed (active,
  // upcoming, member, continuation-pending, or a finished HB with credits
  // left) is skipped here rather than listed twice.
  const { data: pastAll } = await supabaseDb.supabase
    .from('course_enrollments')
    .select(`
      id, student_id, course_type, course_title, course_variant_title,
      course_identifier, schedule_pattern, class_time, status,
      number_of_weeks, class_credits_allocated, class_credits_used,
      class_credits_remaining, credits_closed_at,
      course_start_date, course_end_date, created_at, package_total_courses,
      customers!course_enrollments_student_id_fkey (
        id, email, first_name, last_name, customer_type,
        course_purchase_count, created_at, last_login_at, login_count
      )
    `)
    .eq('status', 'completed')
    // Nulls last: 18 rows have no end date, so a dated course wins as the
    // student's latest rather than losing to a row that simply has no date.
    .order('course_end_date', { ascending: false, nullsFirst: false });

  // Rebuilt from the assembled list rather than reusing `emailSet`, which the
  // members-only block above pushes rows without adding to. Reading the list
  // itself is self-correcting, and lowercasing catches the same person carrying
  // a different capitalisation on a second customer record. Without this, a
  // Clay Club member whose course has ended appears twice — once as a member,
  // once as an alumnus. They are a current member, so the member row wins; the
  // uncollected-work figures still reach them, since those attach by email to
  // every row regardless of type.
  const listedEmails = new Set(students.map(x => (x.email || '').toLowerCase()));

  const seenPast = new Set();
  for (const enr of (pastAll || [])) {
    const student = enr.customers;
    if (!student || !student.email) continue;
    const emailKey = student.email.toLowerCase();
    if (listedEmails.has(emailKey)) continue;  // already listed above
    if (seenPast.has(emailKey)) continue;      // keep only their latest course
    seenPast.add(emailKey);
    const isHB = (enr.course_type || '').toLowerCase().includes('handbuilding');
    students.push({
      studentId: student.id,
      name: `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown',
      email: student.email,
      courseType: enr.course_type,
      courseTitle: enr.course_title,
      variantTitle: enr.course_variant_title || null,
      courseIdentifier: enr.course_identifier,
      enrollmentStatus: 'completed',
      // Set only here. The frontend keys the Past students filter off this
      // rather than off status, so a finished HB that still has credits stays
      // in the HB list where its credit workflow lives.
      isPastStudent: true,
      enrollmentId: enr.id,
      enrollmentCreatedAt: enr.created_at,
      // Last class they actually sat, preferred over the planned end date:
      // it's never in the future, it's present for HB rows that carry no
      // course_end_date, and it's the thing you'd want to know before
      // getting in touch. Null when they never had a class at all — which is
      // itself worth seeing, since it means they enrolled and were never booked.
      lastClassDate: lastClassByEnrollment[enr.id]
        || (enr.course_end_date && enr.course_end_date <= todayStr ? enr.course_end_date : null),
      courseEndDate: enr.course_end_date,
      schedulePattern: enr.schedule_pattern,
      classTime: enr.class_time,
      numberOfWeeks: enr.number_of_weeks,
      packageTotalCourses: enr.package_total_courses,
      creditsAllocated: isHB ? enr.class_credits_allocated : null,
      creditsUsed: isHB ? enr.class_credits_used : null,
      creditsRemaining: null,
      classesAllocated: isHB ? null : (enr.number_of_weeks || 6),
      classesAttended: attendedByEnrollment[enr.id] || 0,
      coursePurchaseCount: student.course_purchase_count || 1,
      customerType: student.customer_type,
      isHB,
      isWT: !isHB,
      membership: membershipByEmail[student.email] || null,
      lastLoginAt: student.last_login_at || null,
      loginCount: student.login_count || 0,
      latestEnrollmentDate: enr.created_at,
    });
    listedEmails.add(emailKey);
    emailSet.add(student.email);
  }

  // Uncollected work — attached to every row, not just alumni.
  //
  // Three states, and the third is the one that matters: a student with no
  // batch record at all is UNKNOWN, not clear. The piece pipeline only started
  // partway through the studio's history, so most older students have no row.
  // Rendering those as "collected" would be a false all-clear on work that may
  // still be sitting on a shelf.
  const PIECE_DONE = ['collected', 'shipped', 'recycled'];
  // Furthest-along wins when a student has several open batches — the one
  // closest to the door is what you'd chase them about.
  const PIECE_PROGRESS = ['logged', 'bisque_fired', 'glaze_fired', 'ready', 'collecting', 'delivering', 'in_cabinet'];

  const { data: batchRows } = await supabaseDb.supabase
    .from('piece_batches')
    .select('customer_id, status, piece_count, ready_at, customers!piece_batches_customer_id_fkey(email)');

  // Keyed by email because not every row in `students` carries a studentId
  // (members-only and continuation-pending rows don't), but all of them have
  // an email.
  const piecesByEmail = {};
  (batchRows || []).forEach(b => {
    const email = (b.customers?.email || '').toLowerCase();
    if (!email) return;
    const rec = piecesByEmail[email] || (piecesByEmail[email] = {
      hasRecord: false, outstandingBatches: 0, outstandingPieces: 0,
      furthestStatus: null, readyAt: null
    });
    rec.hasRecord = true;
    if (PIECE_DONE.includes(b.status)) return;
    rec.outstandingBatches += 1;
    rec.outstandingPieces += (b.piece_count || 0);
    if (PIECE_PROGRESS.indexOf(b.status) > PIECE_PROGRESS.indexOf(rec.furthestStatus)) {
      rec.furthestStatus = b.status;
    }
    // Oldest ready date — how long the earliest finished batch has been waiting.
    if (b.ready_at && (!rec.readyAt || b.ready_at < rec.readyAt)) rec.readyAt = b.ready_at;
  });

  const NO_PIECES = {
    hasRecord: false, outstandingBatches: 0, outstandingPieces: 0,
    furthestStatus: null, readyAt: null
  };
  // VES $ credit balance.
  //
  // Deliberately mirrors getCreditBalance() in utils/creditManager.js rather
  // than reimplementing it: non-expired 'earn' minus all 'spend'. An earn row
  // only counts while expires_at is still ahead of now — matching the helper's
  // .gt('expires_at', now), which also means a null expiry does NOT count.
  // Nothing has expired yet (the first batch expires 31 Dec 2026), so the two
  // readings agree today; keeping them identical is what stops this column
  // drifting from the student's own Credits tab once they start lapsing.
  //
  // Fetched in one pass and grouped in memory — the per-customer helper costs
  // two queries each, which would be ~600 round trips across this list.
  const creditNow = new Date().toISOString();
  let creditTx = [], creditPage = 0, moreCredits = true;
  while (moreCredits) {
    const { data } = await supabaseDb.supabase
      .from('credit_transactions')
      .select('customer_id, type, amount, expires_at')
      .range(creditPage * 1000, (creditPage + 1) * 1000 - 1);
    creditTx = creditTx.concat(data || []);
    moreCredits = (data || []).length === 1000;
    creditPage++;
  }

  const creditByCustomer = {};
  creditTx.forEach(t => {
    if (!t.customer_id) return;
    if (t.type === 'earn') {
      if (!t.expires_at || t.expires_at <= creditNow) return;  // expired or no expiry — not spendable
      creditByCustomer[t.customer_id] = (creditByCustomer[t.customer_id] || 0) + Number(t.amount || 0);
    } else if (t.type === 'spend') {
      creditByCustomer[t.customer_id] = (creditByCustomer[t.customer_id] || 0) - Number(t.amount || 0);
    }
  });

  students = students.map(s => ({
    ...s,
    pieces: piecesByEmail[(s.email || '').toLowerCase()] || NO_PIECES,
    // Keyed on customer id, which is what credit_transactions references.
    // Member-only rows carry no studentId, so they simply report 0.
    creditBalance: s.studentId ? (creditByCustomer[s.studentId] || 0) : 0,
  }));

  // Apply filter
  if (filter !== 'all') {
    students = students.filter(s => {
      if (filter === 'past') return !!s.isPastStudent;
      if (filter === 'past-uncollected') return !!s.isPastStudent && s.pieces.outstandingBatches > 0;
      if (filter === 'past-credit') return !!s.isPastStudent && s.creditBalance > 0;
      // Every other filter describes a current student, so alumni stay out of
      // them — asking for "All WT" should not start returning finished courses.
      if (s.isPastStudent) return false;
      if (filter === 'wt-all') return s.isWT;
      if (filter === 'hb-all') return s.isHB;
      if (filter === 'members') return !!s.membership;
      if (filter === 'pkg-wt6') return s.isWT && (s.numberOfWeeks || 6) <= 6 && !s.packageTotalCourses;
      if (filter === 'pkg-wt7') return s.isWT && s.numberOfWeeks === 7;
      if (filter === 'pkg-wt10') return s.isWT && s.packageTotalCourses !== 3 && (s.numberOfWeeks || 0) >= 8;
      if (filter === 'pkg-wt18') return s.isWT && s.packageTotalCourses === 3;
      if (filter === 'pkg-hb4') return s.isHB && (s.creditsAllocated || 4) <= 4;
      if (filter === 'pkg-hb8') return s.isHB && (s.creditsAllocated || 0) > 4;
      return true;
    });
  }

  // Sort by most recent enrollment
  students.sort((a, b) => new Date(b.latestEnrollmentDate || 0) - new Date(a.latestEnrollmentDate || 0));

  const total = students.length;

  // Paginate
  if (limit) {
    const start = (page - 1) * limit;
    students = students.slice(start, start + limit);
  }

  res.json({
    students,
    membershipByEmail,
    pagination: { page, limit: limit || total, total, totalPages: limit ? Math.ceil(total / limit) : 1 }
  });
}));

// Get student statistics (heavy — used for full data export / detailed views)
app.get('/api/admin/students/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  console.log('📊 /api/admin/students/stats endpoint called');
    // Get all students in a single query (dataset is small, under 1000 customers)
    const { data: allStudents, error: studentsError } = await supabaseDb.supabase
      .from('customers')
      .select('id, email, first_name, last_name, customer_type, classes_allocated, classes_used, classes_forfeited, course_purchase_date, course_expiry_date, course_purchase_count, created_at, updated_at')
      .in('customer_type', ['student', 'member', 'student & member'])
      .order('created_at', { ascending: false });

    if (studentsError) throw studentsError;

    // Get all bookings for students with status 'booked' or 'completed'
    const { data: allBookings, error: bookingsError } = await supabaseDb.supabase
      .from('bookings')
      .select('id, student_id, course_enrollment_id, status, attended')
      .in('status', ['booked', 'completed']);

    if (bookingsError) throw bookingsError;

    // Get bookings with class instances to extract course identifiers AND calculate ended classes
    const { data: allBookingsWithClasses, error: bookingsClassError } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        student_id,
        class_instance_id,
        course_enrollment_id,
        status,
        booking_type,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time,
          end_time,
          instructor,
          room
        )
      `)
      .in('status', ['booked', 'completed', 'attended'])
      .order('class_instances(class_date)', { ascending: false });

    if (bookingsClassError) throw bookingsClassError;

    // Helper function to get course identifier from class_type field
    // The class_type field already contains the proper identifier (e.g., WT0410AM_DL6.1)
    // Format: WT1210AM_DL6.6 means:
    // - WT = Wheelthrowing, HB = Handbuilding
    // - 1210 = Started Oct 12 (month/day)
    // - AM = 9:30am, PM = 1:00pm, NT = 7:30pm
    // - DL = Dillon Lin (instructor initials)
    // - 6.6 = Week 6 of 6 classes
    const generateCourseIdentifier = (classInstance, allClassesForStudent) => {
      if (!classInstance) return null;

      const { class_type } = classInstance;

      // Simply return the class_type as it already contains the proper course identifier
      return class_type;
    };

    // Build a simple map of class_instance_id to course identifier
    // Since class_type already contains the full course identifier (e.g., WT0410AM_DL6.1),
    // we just need to map class IDs to their class_type values
    const { data: allClassInstances, error: classesError } = await supabaseDb.supabase
      .from('class_instances')
      .select('id, class_type')
      .order('class_date', { ascending: true });

    if (classesError) throw classesError;

    // Create a simple mapping from class_instance_id to course identifier (class_type)
    const classIdToCourseIdentifier = {};
    allClassInstances.forEach(cls => {
      classIdToCourseIdentifier[cls.id] = cls.class_type;
    });

    // Create map of student to their course identifiers (from bookings)
    // Use the SAME grouping logic as course history to handle makeup classes correctly
    const studentCourseMap = {};

    // Reuse allBookingsWithClasses (already fetched above) for course grouping

    // Helper function to extract base course identifier
    const extractCourseIdentifier = (classType) => {
      if (!classType) return null;
      const match = classType.match(/^(.+?)(?:\.\d+)?$/);
      return match ? match[1] : classType;
    };

    // Build a variant title from booking/class data when enrollment is missing it
    // e.g. "SATURDAYS • 28 Feb –4 Apr • 1:00pm-3:30pm"
    const buildVariantTitleFromBookings = (studentId, courseIdentifier) => {
      if (!courseIdentifier) return null;
      const baseCourse = courseIdentifier.split('.')[0];
      const studentBookings = allBookingsWithClasses.filter(b => {
        if (b.student_id !== studentId) return false;
        const ci = b.class_instances;
        return ci && ci.class_type && ci.class_type.startsWith(baseCourse);
      });
      if (studentBookings.length === 0) return null;

      studentBookings.sort((a, b) => new Date(a.class_instances.class_date) - new Date(b.class_instances.class_date));

      const firstClass = studentBookings[0].class_instances;
      const lastClass = studentBookings[studentBookings.length - 1].class_instances;
      const firstDate = new Date(firstClass.class_date);
      const lastDate = new Date(lastClass.class_date);

      const days = ['SUNDAYS', 'MONDAYS', 'TUESDAYS', 'WEDNESDAYS', 'THURSDAYS', 'FRIDAYS', 'SATURDAYS'];
      const dayName = days[firstDate.getUTCDay()];

      const fmtDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      const dateRange = `${fmtDate(firstDate)} –${fmtDate(lastDate)}`;

      const time = firstClass.start_time && firstClass.end_time
        ? `${firstClass.start_time}-${firstClass.end_time}`
        : firstClass.start_time || '';

      return `${dayName} • ${dateRange} • ${time}`;
    };

    // Group bookings by student, then by enrollment
    const studentEnrollmentBookings = {};
    allBookingsWithClasses?.forEach(booking => {
      const studentId = booking.student_id;
      const enrollmentId = booking.course_enrollment_id;

      if (!studentEnrollmentBookings[studentId]) {
        studentEnrollmentBookings[studentId] = {};
      }
      if (!studentEnrollmentBookings[studentId][enrollmentId]) {
        studentEnrollmentBookings[studentId][enrollmentId] = [];
      }

      studentEnrollmentBookings[studentId][enrollmentId].push(booking);
    });

    // Process each student's enrollments to extract courses
    Object.keys(studentEnrollmentBookings).forEach(studentId => {
      studentCourseMap[studentId] = [];

      Object.keys(studentEnrollmentBookings[studentId]).forEach(enrollmentId => {
        const bookings = studentEnrollmentBookings[studentId][enrollmentId];

        // Group bookings by course identifier within this enrollment
        // EXCLUDE makeup bookings - they don't count as separate courses
        const bookingsByCourse = {};
        bookings.forEach(booking => {
          // Skip makeup bookings when determining courses
          if (booking.booking_type === 'makeup') {
            return;
          }
          const courseId = extractCourseIdentifier(booking.class_instances?.class_type);
          if (courseId) {
            if (!bookingsByCourse[courseId]) {
              bookingsByCourse[courseId] = [];
            }
            bookingsByCourse[courseId].push(booking);
          }
        });

        // Apply makeup class detection logic
        const courseIds = Object.keys(bookingsByCourse);
        const hasFullCourse = courseIds.some(id => bookingsByCourse[id].length >= 4);

        // If no full courses (all < 4 bookings), keep together as one course with makeups
        if (!hasFullCourse && courseIds.length > 1) {
          const primaryCourseId = courseIds[0];
          const latestDate = bookings[0]?.class_instances?.class_date;
          studentCourseMap[studentId].push({
            courseIdentifier: primaryCourseId,
            classDate: latestDate
          });
        } else {
          // Split into separate courses
          courseIds.forEach(courseId => {
            const courseBookings = bookingsByCourse[courseId];
            const latestDate = courseBookings[0]?.class_instances?.class_date;
            studentCourseMap[studentId].push({
              courseIdentifier: courseId,
              classDate: latestDate
            });
          });
        }
      });

      // Sort courses by date (most recent first)
      studentCourseMap[studentId].sort((a, b) =>
        new Date(b.classDate) - new Date(a.classDate)
      );
    });

    // Process bookings to create aggregated data per student
    const bookingMap = {};

    allBookings.forEach(booking => {
      const studentId = booking.student_id;

      if (!bookingMap[studentId]) {
        bookingMap[studentId] = {
          bookingCount: 0,
          courseEnrollments: new Set(),
          attendedCount: 0
        };
      }

      // Count total bookings
      bookingMap[studentId].bookingCount++;

      // Count unique course enrollments (students who purchased multiple courses)
      if (booking.course_enrollment_id) {
        bookingMap[studentId].courseEnrollments.add(booking.course_enrollment_id);
      }

      // Count attended classes
      if (booking.status === 'completed' && booking.attended === true) {
        bookingMap[studentId].attendedCount++;
      }
    });

    // Convert courseEnrollments Sets to counts
    Object.keys(bookingMap).forEach(studentId => {
      bookingMap[studentId].courseCount = bookingMap[studentId].courseEnrollments.size;
      delete bookingMap[studentId].courseEnrollments;
    });

    // Calculate ended classes count for each student (classes where end time has passed)
    const now = new Date();
    const studentEndedClassesMap = {};

    allBookingsWithClasses.forEach(booking => {
      const studentId = booking.student_id;
      const classInstance = booking.class_instances;

      if (!classInstance || !classInstance.class_date || !classInstance.end_time) {
        return;
      }

      // Parse class date and end time to check if class has ended
      const classDate = classInstance.class_date.split(/[T ]/)[0];
      const endTime = classInstance.end_time;

      const timeParts = endTime.match(/(\d+):(\d+)(am|pm)/i);
      if (!timeParts) return;

      let hours = parseInt(timeParts[1]);
      const minutes = parseInt(timeParts[2]);
      const period = timeParts[3].toLowerCase();

      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;

      const [year, month, day] = classDate.split('-');
      const classEndDateTime = new Date(year, month - 1, day, hours, minutes);

      // Count this class as ended if end time has passed
      if (classEndDateTime < now) {
        if (!studentEndedClassesMap[studentId]) {
          studentEndedClassesMap[studentId] = 0;
        }
        studentEndedClassesMap[studentId]++;
      }
    });

    // All students are already filtered during sync (only course purchasers were synced)
    const totalStudents = allStudents.length;

    // Active students: students who have bookings for classes on or after today OR have paused enrollments
    const today = now.toISOString().split('T')[0];

    // Get unique student IDs who have bookings for future classes
    const activeStudentIds = new Set();
    allBookingsWithClasses.forEach(booking => {
      const classDate = booking.class_instances?.class_date;
      if (classDate && classDate >= today && booking.student_id) {
        activeStudentIds.add(booking.student_id);
      }
    });

    // Also include students with paused enrollments (they need to continue their course)
    const { data: pausedEnrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('student_id')
      .eq('status', 'paused');

    if (pausedEnrollments) {
      pausedEnrollments.forEach(enrollment => {
        activeStudentIds.add(enrollment.student_id);
      });
    }

    const activeStudents = activeStudentIds.size;

    console.log(`👥 Student Management Stats: ${allStudents.length} total students, ${activeStudents} active students (with future bookings or paused enrollments)`);

    // Inactive students: students whose course has expired or no dates available
    const inactiveStudents = totalStudents - activeStudents;

    // Returning students: students with multiple course purchases within the last year
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    const returningStudents = allStudents.filter(s => {
      // Must have purchased more than one course
      if ((s.course_purchase_count || 0) <= 1) return false;

      // Must have a recent course purchase (within last year)
      if (!s.course_purchase_date) return false;
      const purchaseDate = new Date(s.course_purchase_date);
      return purchaseDate >= oneYearAgo;
    }).length;

    // Students by number of courses purchased
    const courseStats = {};
    allStudents.forEach(s => {
      const courseCount = bookingMap[s.id]?.courseCount || 0;
      if (courseCount > 0) {
        courseStats[courseCount] = (courseStats[courseCount] || 0) + 1;
      }
    });

    // Top 3 returning students (most courses purchased within last year)
    const topReturning = allStudents
      .filter(s => {
        if ((s.course_purchase_count || 0) <= 1) return false;
        if (!s.course_purchase_date) return false;
        const purchaseDate = new Date(s.course_purchase_date);
        return purchaseDate >= oneYearAgo;
      })
      .sort((a, b) => (b.course_purchase_count || 0) - (a.course_purchase_count || 0))
      .slice(0, 3)
      .map(s => ({
        name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
        courseCount: s.course_purchase_count
      }));

    // Top 3 active students (most classes attended)
    const topActive = allStudents
      .filter(s => bookingMap[s.id]?.attendedCount > 0)
      .sort((a, b) => (bookingMap[b.id]?.attendedCount || 0) - (bookingMap[a.id]?.attendedCount || 0))
      .slice(0, 3)
      .map(s => ({
        name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
        classesAttended: bookingMap[s.id].attendedCount
      }));

    // Top 3 most booked students (most upcoming/completed bookings)
    const topBooked = allStudents
      .filter(s => bookingMap[s.id]?.bookingCount > 0)
      .sort((a, b) => (bookingMap[b.id]?.bookingCount || 0) - (bookingMap[a.id]?.bookingCount || 0))
      .slice(0, 3)
      .map(s => ({
        name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
        totalBookings: bookingMap[s.id].bookingCount
      }));

    // Get all active/paused enrollments to include status and weeks remaining
    const { data: allEnrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, student_id, status, weeks_remaining, number_of_weeks, course_variant_title, course_title, schedule_pattern, class_time, course_start_date, course_end_date, course_type, created_at, package_total_courses')
      .in('status', ['active', 'paused']);

    const enrollmentMap = {};
    const activeEnrollmentIds = new Set();
    const studentActiveEnrollmentIds = {}; // student_id -> Set of enrollment IDs
    const studentActiveEnrollmentsMap = {}; // student_id -> active/paused enrollment rows
    if (allEnrollments) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      allEnrollments.forEach(enrollment => {
        activeEnrollmentIds.add(enrollment.id);
        if (!studentActiveEnrollmentIds[enrollment.student_id]) {
          studentActiveEnrollmentIds[enrollment.student_id] = new Set();
        }
        studentActiveEnrollmentIds[enrollment.student_id].add(enrollment.id);
        if (!studentActiveEnrollmentsMap[enrollment.student_id]) {
          studentActiveEnrollmentsMap[enrollment.student_id] = [];
        }
        studentActiveEnrollmentsMap[enrollment.student_id].push(enrollment);

        // Pick the most relevant enrollment per student:
        // Prefer the one closest to today (already started or about to start)
        // over one far in the future
        const existing = enrollmentMap[enrollment.student_id];
        if (!existing) {
          enrollmentMap[enrollment.student_id] = enrollment;
        } else {
          const existingStart = existing.course_start_date ? new Date(existing.course_start_date) : null;
          const newStart = enrollment.course_start_date ? new Date(enrollment.course_start_date) : null;

          if (existingStart && newStart) {
            const existingDiff = Math.abs(existingStart - today);
            const newDiff = Math.abs(newStart - today);
            // Pick the enrollment whose start date is closest to today
            if (newDiff < existingDiff) {
              enrollmentMap[enrollment.student_id] = enrollment;
            }
          } else if (newStart && !existingStart) {
            enrollmentMap[enrollment.student_id] = enrollment;
          }
        }
      });
    }

    // Compute cohort sizes for WT courses (group by normalized schedule + time + start date)
    const normalizeTimeStr = (t) => (t || '').toLowerCase().replace(/\s+/g, '');
    const cohortSizeMap = {}; // key: "schedule|normTime|startDate" → count
    if (allEnrollments) {
      const wtEnrollments = allEnrollments.filter(e =>
        e.course_type && e.course_type.toLowerCase().includes('wheelthrowing') && e.status === 'active'
      );
      for (const e of wtEnrollments) {
        const key = `${(e.schedule_pattern || '').toUpperCase()}|${normalizeTimeStr(e.class_time)}|${e.course_start_date}`;
        cohortSizeMap[key] = (cohortSizeMap[key] || 0) + 1;
      }
    }

    // Helper to get cohort size for a student's enrollment
    const getCohortSize = (studentId) => {
      const enrollment = enrollmentMap[studentId];
      if (!enrollment || !enrollment.schedule_pattern) return null;
      const key = `${(enrollment.schedule_pattern || '').toUpperCase()}|${normalizeTimeStr(enrollment.class_time)}|${enrollment.course_start_date}`;
      return cohortSizeMap[key] || null;
    };

    // Helper function to determine if a course is current (has started) or upcoming (all future)
    const getCourseStatus = (courseIdentifier, studentId) => {
      const baseCourseCode = courseIdentifier.split('.')[0];
      const courseBookings = allBookingsWithClasses.filter(booking => {
        if (booking.student_id !== studentId) return false;
        const classInstance = booking.class_instances;
        if (!classInstance || !classInstance.class_type) return false;
        return classInstance.class_type.startsWith(baseCourseCode);
      });

      if (courseBookings.length === 0) return 'upcoming';

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if any class has started (date is today or in the past)
      const hasStarted = courseBookings.some(booking => {
        const classDate = new Date(booking.class_instances.class_date);
        classDate.setHours(0, 0, 0, 0);
        return classDate <= today;
      });

      // Check if any class is still in the future
      const hasFutureClasses = courseBookings.some(booking => {
        const classDate = new Date(booking.class_instances.class_date);
        classDate.setHours(0, 0, 0, 0);
        return classDate > today;
      });

      // If all classes are in the past, it's completed (not current)
      if (hasStarted && !hasFutureClasses) return 'completed';

      return hasStarted ? 'current' : 'upcoming';
    };

    const getPooledProgressForStudent = (student) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeEnrollmentsForStudent = (studentActiveEnrollmentsMap[student.id] || []).filter(e => {
        // Ignore stale "active" enrollments that have already ended
        if (e.status === 'active' && e.course_end_date) {
          const end = new Date(e.course_end_date);
          end.setHours(0, 0, 0, 0);
          if (end < today) return false;
        }
        return true;
      });
      const totalAllocatedFromEnrollments = activeEnrollmentsForStudent.reduce(
        (sum, e) => sum + (e.number_of_weeks || 0),
        0
      );

      const studentEnrollIds = new Set(activeEnrollmentsForStudent.map(e => e.id));
      const totalAttended = allBookingsWithClasses.filter(b => {
        if (b.student_id !== student.id) return false;
        if (!studentEnrollIds.has(b.course_enrollment_id)) return false;
        const ci = b.class_instances;
        if (!ci) return false;
        if (b.status === 'attended' || b.status === 'completed') return true;
        if (b.status === 'booked') {
          const d = new Date(ci.class_date); d.setHours(0,0,0,0);
          const t = new Date(); t.setHours(0,0,0,0);
          return d < t;
        }
        return false;
      }).length;

      // For Student Management progress, prefer allocation derived from ACTIVE/PAUSED enrollments.
      // Customer.classes_allocated can be lifetime/legacy and causes inflated values (e.g. 18).
      const inferredAllocated = totalAllocatedFromEnrollments || (student.classes_allocated || 0);

      const hasPooledAllocation =
        activeEnrollmentsForStudent.length > 1 || totalAllocatedFromEnrollments > 6;

      return {
        hasPooledAllocation,
        totalAttended,
        totalAllocated: inferredAllocated || 6
      };
    };

    const getStartedActiveEnrollment = (studentId) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const enrollments = (studentActiveEnrollmentsMap[studentId] || [])
        .filter(e => e.status === 'active');

      const started = enrollments.filter(e => {
        if (!e.course_start_date) return false;
        const start = new Date(e.course_start_date);
        start.setHours(0, 0, 0, 0);
        if (start > today) return false;

        // Exclude enrollments that have already ended
        if (e.course_end_date) {
          const end = new Date(e.course_end_date);
          end.setHours(0, 0, 0, 0);
          if (end < today) return false;
        }

        return true;
      });

      // A "current" enrollment should still have at least one future booked class.
      const startedWithFutureBookings = started.filter(e => {
        return allBookingsWithClasses.some(b => {
          if (b.student_id !== studentId) return false;
          if (b.course_enrollment_id !== e.id) return false;
          if (b.status !== 'booked') return false;
          const ci = b.class_instances;
          if (!ci?.class_date) return false;
          const d = new Date(ci.class_date);
          d.setHours(0, 0, 0, 0);
          return d >= today;
        });
      });

      // Prefer the most recently started active enrollment
      startedWithFutureBookings.sort((a, b) => {
        const aDate = a.course_start_date ? new Date(a.course_start_date) : new Date(0);
        const bDate = b.course_start_date ? new Date(b.course_start_date) : new Date(0);
        return bDate - aDate;
      });

      return startedWithFutureBookings[0] || null;
    };

    const getEnrollmentBaseCourseCode = (studentId, enrollmentId) => {
      if (!enrollmentId) return null;

      const enrollmentBookings = allBookingsWithClasses.filter(b =>
        b.student_id === studentId &&
        b.course_enrollment_id === enrollmentId &&
        b.booking_type !== 'makeup' &&
        b.class_instances?.class_type
      );

      if (enrollmentBookings.length === 0) return null;

      const latestRegularBooking = enrollmentBookings[0];
      return latestRegularBooking.class_instances?.class_type?.split('.')[0] || null;
    };

    const getCourseFromBaseCode = (courses, baseCourseCode) => {
      if (!baseCourseCode) return null;
      return courses.find(c => (c.courseIdentifier || '').split('.')[0] === baseCourseCode) || null;
    };

    // Paused Students List (students with paused enrollments)
    const pausedStudentsList = allStudents
      .filter(s => {
        const enrollment = enrollmentMap[s.id];
        return enrollment && enrollment.status === 'paused';
      })
      .map(s => {
        const courses = studentCourseMap[s.id] || [];
        const enrollment = enrollmentMap[s.id];
        const displayCourse = courses.length > 0 ? courses[0] : null;

        return {
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
          email: s.email,
          courseIdentifier: displayCourse?.courseIdentifier || null,
          variantTitle: enrollment?.course_variant_title || null,
          coursePurchaseCount: courses.length || 0,
          coursePurchaseDate: s.course_purchase_date,
          enrollmentStatus: 'paused',
          weeksRemaining: enrollment?.weeks_remaining || 0,
          cohortSize: getCohortSize(s.id)
        };
      })
      .sort((a, b) => {
        const dateA = a.coursePurchaseDate ? new Date(a.coursePurchaseDate) : new Date(0);
        const dateB = b.coursePurchaseDate ? new Date(b.coursePurchaseDate) : new Date(0);
        const dateCompare = dateB - dateA;
        if (dateCompare !== 0) return dateCompare;
        return a.name.localeCompare(b.name);
      });

    // Get HB student IDs early so we can exclude them from Active Students
    const { data: hbEnrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('student_id')
      .ilike('course_type', '%handbuilding%')
      .in('status', ['active', 'completed']);

    const hbStudentIds = new Set();
    if (hbEnrollments) {
      hbEnrollments.forEach(enrollment => hbStudentIds.add(enrollment.student_id));
    }

    // Active Students List (students who have bookings for classes on or after today)
    const activeStudentsList = allStudents
      .filter(s => {
        if (!activeStudentIds.has(s.id)) return false;

        // EXCLUDE students with paused enrollments (they're in their own section now)
        const enrollment = enrollmentMap[s.id];
        if (enrollment && enrollment.status === 'paused') return false;

        // EXCLUDE students who have HB enrollments (they go in HB Students section)
        if (hbStudentIds.has(s.id)) return false;

        const courses = studentCourseMap[s.id] || [];
        const startedActiveEnrollment = getStartedActiveEnrollment(s.id);
        if (startedActiveEnrollment) return true;
        // Fallback to booking-based status if enrollment dates are missing
        return courses.some(c => getCourseStatus(c.courseIdentifier, s.id) === 'current');
      })
      .map(s => {
        // Get all courses for this student
        const courses = studentCourseMap[s.id] || [];
        const startedActiveEnrollment = getStartedActiveEnrollment(s.id);
        const startedActiveBaseCourse = getEnrollmentBaseCourseCode(s.id, startedActiveEnrollment?.id);

        // Separate current and upcoming courses
        const currentCourse =
          getCourseFromBaseCode(courses, startedActiveBaseCourse) ||
          courses.find(c => getCourseStatus(c.courseIdentifier, s.id) === 'current');
        const upcomingCourses = courses.filter(c => getCourseStatus(c.courseIdentifier, s.id) === 'upcoming');

        // Use current course if available, otherwise use the most recent one
        const displayCourse = currentCourse || (courses.length > 0 ? courses[0] : null);
        const enrollment = startedActiveEnrollment || enrollmentMap[s.id];

        // For active students, calculate classes remaining from CURRENT COURSE ONLY
        // Get bookings for the current active course enrollment
        let currentCourseBookingsCount = 0;
        let endedClassesInCurrentCourse = 0;
        let futureBookingsCount = 0;

        // Get the current course identifier to filter bookings
        const currentCourseIdentifier = displayCourse?.courseIdentifier;
        const baseCourseCode = currentCourseIdentifier ? currentCourseIdentifier.split('.')[0] : null;

        // Filter bookings to ONLY the current course + makeup classes
        const getCurrentCourseBookings = (allBookings) => {
          return allBookings.filter(booking => {
            if (booking.student_id !== s.id) return false;

            // ALWAYS include makeup classes (admin rescheduled classes)
            if (booking.booking_type === 'makeup') return true;

            // If no base course code, include all non-makeup bookings
            if (!baseCourseCode) return true;

            const classInstance = booking.class_instances;
            if (!classInstance || !classInstance.class_type) return false;

            // Match bookings that belong to the current course
            return classInstance.class_type.startsWith(baseCourseCode);
          });
        };

        const currentCourseBookings = getCurrentCourseBookings(allBookingsWithClasses);

        // Count attended classes (EXACT SAME logic as Student Detail page)
        endedClassesInCurrentCourse = currentCourseBookings.filter(booking => {
          const classInstance = booking.class_instances;
          if (!classInstance) return false;

          // Count if status is 'attended' or 'completed'
          if (booking.status === 'attended' || booking.status === 'completed') {
            return true;
          }

          // Also count if status is 'booked' but class date is in the past
          if (booking.status === 'booked') {
            const classDate = new Date(classInstance.class_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            classDate.setHours(0, 0, 0, 0);
            return classDate < today;
          }

          return false;
        }).length;

        // Count future bookings for current course only
        futureBookingsCount = currentCourseBookings.filter(booking => {
          const classInstance = booking.class_instances;
          if (!classInstance) return false;
          if (booking.status !== 'booked') return false;

          const classDate = new Date(classInstance.class_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          classDate.setHours(0, 0, 0, 0);
          return classDate >= today;
        }).length;

        // Classes remaining = allocated - attended
        // For package / multi-enrollment students, use pooled math across active enrollments
        // Active Students table should show CURRENT COURSE progress only (not pooled purchases)
        const currentCourseAllocated = enrollment?.number_of_weeks || 6;
        const classesRemaining = Math.max(0, currentCourseAllocated - endedClassesInCurrentCourse);

        return {
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
          email: s.email,
          courseIdentifier: displayCourse?.courseIdentifier || null, // Show only current course
          variantTitle: enrollment?.course_variant_title || buildVariantTitleFromBookings(s.id, displayCourse?.courseIdentifier) || null,
          coursePurchaseCount: courses.length || 0,
          coursePurchaseDate: s.course_purchase_date,
          enrollmentCreatedAt: (() => {
            const allEnrollments = studentActiveEnrollmentsMap[s.id] || [];
            if (allEnrollments.length > 0) {
              return allEnrollments.reduce((latest, e) => !latest || new Date(e.created_at) > new Date(latest) ? e.created_at : latest, null);
            }
            return enrollment?.created_at || s.course_purchase_date || null;
          })(),
          enrollmentStatus: enrollment?.status || 'active',
          weeksRemaining: classesRemaining,
          classesAttended: endedClassesInCurrentCourse,
          classesAllocated: currentCourseAllocated,
          packageTotalCourses: enrollment?.package_total_courses || null,
          hasUpcomingCourse: upcomingCourses.length > 0,
          upcomingCourse: upcomingCourses.length > 0 ? {
            courseIdentifier: upcomingCourses[0].courseIdentifier,
            variantTitle: buildVariantTitleFromBookings(s.id, upcomingCourses[0].courseIdentifier) || null
          } : null,
          cohortSize: getCohortSize(s.id)
        };
      })
      .sort((a, b) => {
        // Sort: Active students first, then paused students
        if (a.enrollmentStatus !== b.enrollmentStatus) {
          return a.enrollmentStatus === 'active' ? -1 : 1;
        }
        // Within same status, sort by course purchase date (most recent first), then by name
        const dateA = a.coursePurchaseDate ? new Date(a.coursePurchaseDate) : new Date(0);
        const dateB = b.coursePurchaseDate ? new Date(b.coursePurchaseDate) : new Date(0);
        const dateCompare = dateB - dateA; // Most recent first
        if (dateCompare !== 0) return dateCompare;
        return a.name.localeCompare(b.name);
      });

    // Returning Students List (students with multiple purchases within last year)
    const returningStudentsList = allStudents
      .filter(s => {
        if ((s.course_purchase_count || 0) <= 1) return false;
        if (!s.course_purchase_date) return false;
        const purchaseDate = new Date(s.course_purchase_date);
        return purchaseDate >= oneYearAgo;
      })
      .map(s => {
        // Get the most recent course for this student
        const courses = studentCourseMap[s.id] || [];
        const latestCourse = courses.length > 0 ? courses[0] : null;

        return {
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
          email: s.email,
          courseIdentifier: latestCourse?.courseIdentifier || null,
          coursePurchaseCount: s.course_purchase_count
        };
      })
      .sort((a, b) => {
        // Sort by course purchase count (highest first), then by name
        const countCompare = (b.coursePurchaseCount || 0) - (a.coursePurchaseCount || 0);
        if (countCompare !== 0) return countCompare;
        return a.name.localeCompare(b.name);
      });

    // Build set of student IDs already in active list to avoid duplicates
    const activeListStudentIds = new Set(activeStudentsList.map(s => {
      // Find the customer by email to get the DB id
      const customer = allStudents.find(c => c.email === s.email);
      return customer?.id;
    }).filter(Boolean));

    const upcomingEnrollmentsList = allStudents
      .filter(s => {
        // EXCLUDE students already in the active list
        if (activeListStudentIds.has(s.id)) return false;

        // EXCLUDE HB students (they have their own section)
        if (hbStudentIds.has(s.id)) return false;

        // Must have an active/paused enrollment record to appear in Student Management upcoming list.
        // This prevents historical students with stale/future-coded course identifiers from leaking in.
        const enrollment = enrollmentMap[s.id];
        if (!enrollment || !['active', 'paused'].includes(enrollment.status)) return false;

        const courses = studentCourseMap[s.id] || [];
        // Only include students who have at least one upcoming course
        return courses.some(c => getCourseStatus(c.courseIdentifier, s.id) === 'upcoming');
      })
      .map(s => {
        const courses = studentCourseMap[s.id] || [];
        // Get all upcoming courses for this student
        const upcomingCourses = courses.filter(c => getCourseStatus(c.courseIdentifier, s.id) === 'upcoming');
        const enrollment = enrollmentMap[s.id];

        // Upcoming course hasn't started yet
        const pooledProgress = getPooledProgressForStudent(s);
        const isPackageStudent = pooledProgress.hasPooledAllocation;
        let classesRemaining;
        let classesAllocated;
        let classesAttended;

        if (isPackageStudent) {
          classesAllocated = pooledProgress.totalAllocated;
          classesAttended = pooledProgress.totalAttended;
          classesRemaining = Math.max(0, classesAllocated - classesAttended);
        } else {
          // Fresh course purchase → full course weeks remaining
          classesAllocated = enrollment?.number_of_weeks || 6;
          classesAttended = 0;
          classesRemaining = classesAllocated;
        }

        return {
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
          email: s.email,
          courseIdentifier: upcomingCourses[0]?.courseIdentifier || null,
          variantTitle: enrollment?.course_variant_title || buildVariantTitleFromBookings(s.id, upcomingCourses[0]?.courseIdentifier) || null,
          startDate: upcomingCourses[0]?.classDate || null,
          coursePurchaseCount: s.course_purchase_count || 0,
          coursePurchaseDate: s.course_purchase_date,
          enrollmentCreatedAt: enrollment?.created_at || s.course_purchase_date || null,
          weeksRemaining: classesRemaining,
          classesAllocated,
          classesAttended,
          packageTotalCourses: enrollment?.package_total_courses || null,
          cohortSize: getCohortSize(s.id)
        };
      })
      .sort((a, b) => {
        // Sort by start date (earliest first)
        const dateA = a.startDate ? new Date(a.startDate) : new Date(0);
        const dateB = b.startDate ? new Date(b.startDate) : new Date(0);
        const dateCompare = dateA - dateB;
        if (dateCompare !== 0) return dateCompare;
        return a.name.localeCompare(b.name);
      });

    // HB Students: Get full details for HB enrollments (we already have student IDs)
    const { data: hbEnrollmentsDetailed } = await supabaseDb.supabase
      .from('course_enrollments')
      .select(`
        id, student_id, course_title, course_variant_title, course_type, status,
        class_credits_allocated, class_credits_used, class_credits_remaining,
        schedule_pattern, class_time,
        bookings_created_at, course_start_date, course_end_date,
        number_of_weeks, created_at
      `)
      .ilike('course_type', '%handbuilding%')
      .in('status', ['active', 'completed']);

    const hbStudentsList = [];
    if (hbEnrollmentsDetailed) {
      for (const enrollment of hbEnrollmentsDetailed) {
        const student = allStudents.find(s => s.id === enrollment.student_id);
        if (!student) continue;
        enrollment._computedCredits = await supabaseDb.getEnrollmentCredits(enrollment.id);

        // Get bookings for this enrollment to determine schedule status
        const enrollmentBookings = allBookingsWithClasses.filter(
          b => b.course_enrollment_id === enrollment.id
        );

        // Find next upcoming class
        const futureBookings = enrollmentBookings.filter(b => {
          const classDate = new Date(b.class_instances?.class_date);
          return classDate >= now;
        }).sort((a, b) =>
          new Date(a.class_instances?.class_date) - new Date(b.class_instances?.class_date)
        );

        const nextClass = futureBookings.length > 0
          ? futureBookings[0].class_instances?.class_date
          : null;

        // Determine schedule status
        let scheduleStatus = 'unbooked';
        if (enrollmentBookings.length > 0 && futureBookings.length > 0) {
          scheduleStatus = 'scheduled';
        } else if (enrollmentBookings.length > 0 && futureBookings.length === 0) {
          scheduleStatus = 'completed';
        }

        hbStudentsList.push({
          name: `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown',
          email: student.email,
          courseTitle: enrollment.course_title || 'Handbuilding',
          variantTitle: enrollment.course_variant_title || null,
          scheduleDay: enrollment.schedule_pattern || null,
          classTime: enrollment.class_time || null,
          creditsAllocated: enrollment._computedCredits?.allocated || enrollment.class_credits_allocated || 0,
          creditsUsed: enrollment._computedCredits?.attended || enrollment.class_credits_used || 0,
          creditsRemaining: enrollment._computedCredits?.remaining || enrollment.class_credits_remaining || 0,
          scheduleStatus,
          nextClass,
          totalBookings: enrollmentBookings.length,
          enrollmentStatus: enrollment.status,
          enrollmentId: enrollment.id,
          createdAt: enrollment.created_at,
          purchaseCount: student.course_purchase_count || 1
        });
      }
    }

    // Sort: unbooked first (needs attention), then scheduled, then completed
    hbStudentsList.sort((a, b) => {
      const statusOrder = { unbooked: 0, scheduled: 1, completed: 2 };
      const orderDiff = (statusOrder[a.scheduleStatus] || 99) - (statusOrder[b.scheduleStatus] || 99);
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });

    console.log(`🎨 HB Students: ${hbStudentsList.length} (${hbStudentsList.filter(s => s.scheduleStatus === 'unbooked').length} unbooked, ${hbStudentsList.filter(s => s.scheduleStatus === 'scheduled').length} scheduled)`);

    // ── Membership data for unified Users page ──────────────────────────────
    const { data: allMemberships } = await supabaseDb.supabase
      .from('memberships')
      .select(`
        id, customer_id, membership_type, status, start_date, end_date, perks,
        customers!memberships_customer_id_fkey (
          id, email, first_name, last_name, customer_type
        )
      `);

    // Build set of emails already in student lists (active, upcoming, hb, paused)
    const studentEmails = new Set([
      ...activeStudentsList.map(s => s.email),
      ...upcomingEnrollmentsList.map(s => s.email),
      ...hbStudentsList.map(s => s.email),
      ...pausedStudentsList.map(s => s.email),
    ]);

    const membersList = [];
    const membershipByEmail = {}; // email -> membership data (for attaching to dual-role students)

    if (allMemberships) {
      for (const m of allMemberships) {
        if (!m.customers) continue;
        const email = m.customers.email;
        const name = `${m.customers.first_name || ''} ${m.customers.last_name || ''}`.trim() || 'Unknown';
        const daysLeft = Math.ceil((new Date(m.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        const totalDays = Math.ceil((new Date(m.end_date) - new Date(m.start_date)) / (1000 * 60 * 60 * 24));
        // Pending (reserved) memberships have no start/end date yet — the term
        // begins on first-visit activation. Never run them through the expiry
        // math (null end_date → epoch → false "expired"); keep them as pending.
        let derivedStatus = m.status;
        if (m.status !== 'cancelled' && m.status !== 'pending') {
          if (daysLeft < 0) derivedStatus = 'expired';
          else if (daysLeft <= 30) derivedStatus = 'expiring';
          else derivedStatus = 'active';
        }

        const membershipData = {
          membershipId: m.id,
          membershipType: m.membership_type,
          membershipStatus: derivedStatus,
          startDate: m.start_date,
          endDate: m.end_date,
          daysRemaining: Math.max(0, daysLeft),
          totalDays,
          perks: m.perks,
        };

        // Store by email for cross-referencing with students
        membershipByEmail[email] = membershipData;

        // If this person is NOT already in the student lists, add to members-only list
        if (!studentEmails.has(email)) {
          membersList.push({
            name,
            email,
            customerType: m.customers.customer_type || 'member',
            ...membershipData,
          });
        }
      }
    }

    // Sort members: active first, then by expiry date
    membersList.sort((a, b) => {
      const order = { pending: 0, active: 1, expiring: 2, expired: 3, cancelled: 4 };
      const sa = order[a.membershipStatus] ?? 5;
      const sb = order[b.membershipStatus] ?? 5;
      if (sa !== sb) return sa - sb;
      return (a.daysRemaining || 0) - (b.daysRemaining || 0);
    });

    console.log(`🎫 Members: ${membersList.length} members-only, ${Object.keys(membershipByEmail).length} total memberships`);

    // ── Pagination support ─────────────────────────────────────────────────
    // Build a unified list in the same order the frontend expects:
    //   activeStudentsList → hbStudentsList → pausedStudentsList → membersList
    const unifiedList = [
      ...activeStudentsList.map(s => ({ ...s, _listType: 'active' })),
      ...hbStudentsList.map(s => ({ ...s, _listType: 'hb' })),
      ...pausedStudentsList.map(s => ({ ...s, _listType: 'paused' })),
      ...membersList.map(s => ({ ...s, _listType: 'member' })),
    ];
    const totalUnified = unifiedList.length;

    const limitParam = req.query.limit;
    const pageParam  = parseInt(req.query.page) || 1;
    const returnAll  = !limitParam || limitParam === 'all';
    const limit      = returnAll ? totalUnified : Math.max(1, parseInt(limitParam) || 20);
    const statsPage  = Math.max(1, pageParam);
    const totalPages = returnAll ? 1 : Math.ceil(totalUnified / limit);
    const startIdx   = (statsPage - 1) * limit;
    const paginatedSlice = returnAll ? unifiedList : unifiedList.slice(startIdx, startIdx + limit);

    // Split the paginated slice back into the individual lists
    const paginatedActive = paginatedSlice.filter(s => s._listType === 'active').map(({ _listType, ...rest }) => rest);
    const paginatedHb     = paginatedSlice.filter(s => s._listType === 'hb').map(({ _listType, ...rest }) => rest);
    const paginatedPaused = paginatedSlice.filter(s => s._listType === 'paused').map(({ _listType, ...rest }) => rest);
    const paginatedMembers = paginatedSlice.filter(s => s._listType === 'member').map(({ _listType, ...rest }) => rest);

    res.json({
      stats: {
        totalStudents,
        activeStudents,
        returningStudents,
        inactiveStudents
      },
      courseStats,
      topPerformers: {
        topReturning,
        topActive,
        topBooked
      },
      activeStudentsList: paginatedActive,
      pausedStudentsList: paginatedPaused,
      returningStudentsList,
      upcomingEnrollmentsList,
      hbStudentsList: paginatedHb,
      membersList: paginatedMembers,
      membershipByEmail,
      pagination: {
        page: statsPage,
        limit: returnAll ? totalUnified : limit,
        total: totalUnified,
        totalPages
      },
      message: 'Student statistics calculated successfully'
    });

}));

// Resume a paused student
app.post('/api/admin/students/:id/resume', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const studentId = parseInt(req.params.id);

  // Get the student's paused enrollment
  const { data: enrollment, error: fetchError } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', studentId)
    .eq('status', 'paused')
    .single();

  if (fetchError || !enrollment) {
    return res.status(404).json({ error: 'No paused enrollment found for this student' });
  }

  // Update enrollment status to active
  const { error: updateError } = await supabaseDb.supabase
    .from('course_enrollments')
    .update({
      status: 'active',
      updated_at: new Date().toISOString()
    })
    .eq('id', enrollment.id);

  if (updateError) {
    console.error('Error resuming enrollment:', updateError);
    return res.status(500).json({ error: 'Failed to resume enrollment' });
  }

  res.json({
    success: true,
    message: 'Student enrollment resumed successfully',
    enrollment: {
      id: enrollment.id,
      studentId: enrollment.student_id,
      courseTitle: enrollment.course_title,
      weeksCompleted: enrollment.weeks_completed,
      weeksRemaining: enrollment.weeks_remaining
    }
  });
}));

// Get single student details
app.get('/api/admin/students/:email', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { email } = req.params;
  const decodedEmail = decodeURIComponent(email);

  const { data: student, error } = await supabaseDb.supabase
    .from('customers')
    .select('*')
    .eq('email', decodedEmail)
    .single();

  if (error || !student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  // Calculate classes_allocated from active enrollments only (not lifetime cumulative)
  const { data: activeEnrollments } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id, number_of_weeks')
    .eq('student_id', student.id)
    .eq('status', 'active');

  if (activeEnrollments && activeEnrollments.length > 0) {
    const enrollmentIds = activeEnrollments.map(e => e.id);

    // Sum allocation from active enrollments only
    student.classes_allocated = activeEnrollments.reduce((sum, e) => sum + (e.number_of_weeks || 0), 0);

    // Get attended bookings from active enrollments only
    const { data: attendedBookings } = await supabaseDb.supabase
      .from('bookings')
      .select('id')
      .eq('student_id', student.id)
      .in('course_enrollment_id', enrollmentIds)
      .eq('status', 'attended');

    student.classes_used = attendedBookings ? attendedBookings.length : 0;
  } else {
    student.classes_used = 0;
  }

  // Fetch membership data from memberships table
  const { data: memberships } = await supabaseDb.supabase
    .from('memberships')
    .select('id, membership_type, start_date, end_date, status, perks')
    .eq('customer_id', student.id)
    .order('end_date', { ascending: false });

  if (memberships && memberships.length > 0) {
    // Find active membership first, else most recent
    const activeMembership = memberships.find(m => m.status === 'active') || memberships[0];
    student.membership = {
      id: activeMembership.id,
      type: activeMembership.membership_type,
      startDate: activeMembership.start_date,
      endDate: activeMembership.end_date,
      status: activeMembership.status,
      perks: activeMembership.perks,
    };
    student.membershipHistory = memberships.map(m => ({
      id: m.id,
      type: m.membership_type,
      startDate: m.start_date,
      endDate: m.end_date,
      status: m.status,
    }));
  }

  res.json(student);
}));

// Get student enrollment
app.get('/api/admin/students/:id/enrollment', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const studentId = parseInt(req.params.id);

  // Get all enrollments for the student (including completed for history)
  const { data: enrollments, error } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', studentId)
    .order('course_start_date', { ascending: false });

  if (error) {
    throw error;
  }

  if (!enrollments || enrollments.length === 0) {
    return res.json(null);
  }

  // Read-only predicate: is an 'active' enrollment actually ENDED?
  // Mirrors autoCompleteFinishedEnrollments() in routes/shopify.js exactly,
  // but performs NO database writes. Returns true only when the course has
  // genuinely finished and the auto-complete routine would mark it completed.
  const todayStr = new Date().toISOString().split('T')[0];
  const isActiveEnrollmentEnded = async (enrollment) => {
    // Get all bookings for this enrollment
    const { data: bookings } = await supabaseDb.supabase
      .from('bookings')
      .select('id, class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('course_enrollment_id', enrollment.id)
      .in('status', ['booked', 'completed', 'attended']);

    if (!bookings || bookings.length === 0) return false;

    // Check if ALL booking dates are strictly in the past
    const allPast = bookings.every(b => {
      const d = b.class_instances?.class_date?.split(/[T ]/)[0];
      return d && d < todayStr;
    });

    if (!allPast) return false;

    // Compute credits from actual bookings (never trust stale DB columns)
    const credits = await supabaseDb.getEnrollmentCredits(enrollment.id);

    // Skip HB credit-based enrollments that still have remaining credits
    const isHB = enrollment.course_type && enrollment.course_type.toLowerCase().includes('handbuilding');
    if (isHB && credits.remaining > 0) {
      return false; // Student still has credits to use — still active
    }

    // 10-class packages (number_of_weeks=10, total_weeks=6) holding/owed flex
    // credits: auto-complete allocates flex credits instead of completing.
    const is10ClassPackage = enrollment.number_of_weeks === 10 && (enrollment.total_weeks === 6 || bookings.length === 6);
    if (is10ClassPackage && !enrollment.class_credits_allocated) {
      return false; // Flex credits still owed — still active
    }

    // Skip if enrollment still has flex/credit remaining
    if (credits.remaining > 0) {
      return false;
    }

    return true; // All classes past, no remaining credits — ended
  };

  // Read-only package-progress enrichment. Computes course counts for
  // multi-course package enrollments. Applied to BOTH active enrollments and
  // completed-history entries, so a package student *between courses* (every
  // course so far completed, none currently active) still shows accurate
  // "Course X of N", "X completed", and "Y more courses remaining". Position is
  // scoped to THIS package, so a repeat purchase restarts at course 1. No writes.
  const enrichPackageProgress = async (enrollment) => {
    const progress = await getPackageProgress(supabaseDb.supabase, studentId, enrollment);
    if (!progress) return enrollment;
    return {
      ...enrollment,
      package_courses_completed: progress.completed,
      package_current_course: progress.current,
      package_courses_remaining: progress.remaining,
    };
  };

  // Split into active/paused vs completed.
  // An 'active' enrollment whose course has actually ended (per the predicate
  // above) is reclassified into completed history without any DB write.
  const completedEnrollments = enrollments.filter(e => e.status === 'completed');
  const activeEnrollments = [];
  const endedActiveEnrollments = [];
  for (const e of enrollments) {
    if (e.status === 'paused') {
      // Paused enrollments are left completely unchanged.
      activeEnrollments.push(e);
    } else if (e.status === 'active') {
      if (await isActiveEnrollmentEnded(e)) {
        endedActiveEnrollments.push(e);
      } else {
        activeEnrollments.push(e);
      }
    }
  }

  // Enrich all active enrollments
  const enrichedEnrollments = [];
  for (let enrollment of activeEnrollments) {
    // If course_identifier is missing, derive it from bookings
    if (!enrollment.course_identifier) {
      const { data: bookings } = await supabaseDb.supabase
        .from('bookings')
        .select('class_instance_id')
        .eq('student_id', studentId)
        .eq('course_enrollment_id', enrollment.id)
        .in('status', ['booked', 'attended', 'completed'])
        .limit(1);

      if (bookings && bookings.length > 0) {
        const { data: cls } = await supabaseDb.supabase
          .from('class_instances')
          .select('class_type')
          .eq('id', bookings[0].class_instance_id)
          .single();

        if (cls?.class_type) {
          const derived = cls.class_type.split('.')[0];
          enrollment = { ...enrollment, course_identifier: derived };
          await supabaseDb.supabase
            .from('course_enrollments')
            .update({ course_identifier: derived })
            .eq('id', enrollment.id);
        }
      }
    }

    // If package enrollment, count completed courses
    enrollment = await enrichPackageProgress(enrollment);

    // Determine if upcoming (start_date in future) vs active
    const today = new Date().toISOString().split('T')[0];
    const isUpcoming = enrollment.course_start_date && enrollment.course_start_date > today;
    enrollment = { ...enrollment, display_status: isUpcoming ? 'upcoming' : enrollment.status };

    // Compute credits from bookings for any enrollment that tracks them — HB blocks,
    // 10-class packages, and WT courses whose weeks were converted to credits (the
    // columns go stale, and the UI hides a course it believes has nothing left).
    if (enrollment.class_credits_allocated > 0) {
      const credits = await supabaseDb.getEnrollmentCredits(enrollment.id);
      enrollment = {
        ...enrollment,
        // creditsAttended is what the admin screens actually want to show —
        // classes the student turned up for. It is NOT class_credits_used,
        // which means committed (attended + booked + forfeited) so that
        // allocated = used + remaining holds. Overloading one name with both
        // meanings is what this split avoids.
        creditsAttended: credits.attended,
        class_credits_used: credits.committed,
        class_credits_remaining: credits.remaining,
      };
    }

    enrichedEnrollments.push(enrollment);
  }

  // Sort: active/paused first, then upcoming, by start date
  enrichedEnrollments.sort((a, b) => {
    if (a.display_status === 'upcoming' && b.display_status !== 'upcoming') return 1;
    if (a.display_status !== 'upcoming' && b.display_status === 'upcoming') return -1;
    return 0;
  });

  // 'active' enrollments whose course has ended are treated as completed
  // history (display_status 'completed'), alongside truly-completed ones.
  const completedHistorySorted = [
    ...endedActiveEnrollments.map(e => ({ ...e, display_status: 'completed' })),
    ...completedEnrollments.map(e => ({ ...e, display_status: 'completed' })),
  ].sort((a, b) => String(b.course_start_date || '').localeCompare(String(a.course_start_date || '')));
  // Enrich package-progress so a package student who has completed every course
  // so far (no active enrollment between courses) still shows accurate counts.
  // Promise.all preserves order. Read-only — no DB writes.
  const completedHistoryAll = await Promise.all(
    completedHistorySorted.map(e => enrichPackageProgress(e))
  );

  // Fall back to most recent completed if no active enrollments
  if (enrichedEnrollments.length === 0 && completedHistoryAll.length > 0) {
    enrichedEnrollments.push(completedHistoryAll[0]);
  }

  // Return all enrollments + backward-compat single enrollment (first one)
  const currentEnrollment = enrichedEnrollments[0] || null;
  console.log(`[enrollment] student=${studentId} active=${activeEnrollments.length} endedActive=${endedActiveEnrollments.length} completed=${completedEnrollments.length} returning=${enrichedEnrollments.length}`);
  if (currentEnrollment) {
    const history = completedHistoryAll.filter(e => e.id !== currentEnrollment.id);
    res.json({ ...currentEnrollment, completed_history: history, all_enrollments: enrichedEnrollments });
  } else {
    res.json(null);
  }
}));

// Get instructor notes for a student
app.get('/api/admin/students/:id/notes', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const studentId = parseInt(req.params.id);
  const { data } = await supabaseDb.supabase
    .from('instructor_notes')
    .select('id, content, note_type, created_at, instructor_id, class_instance_id, customers!instructor_notes_instructor_id_fkey(first_name, last_name)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  res.json({ notes: data || [] });
}));

// Add a note for a student (admin)
app.post('/api/admin/students/:id/notes', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const studentId = parseInt(req.params.id);
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });

  // Use admin's customer ID as instructor_id
  const { data, error } = await supabaseDb.supabase
    .from('instructor_notes')
    .insert({
      instructor_id: req.user.dbCustomerId,
      student_id: studentId,
      note_type: 'student',
      content: content.trim()
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to save note' });
  res.json({ note: data });
}));

// Check next available course for package continuation
// Helper: derive schedule info from course identifier when enrollment fields are null
// e.g., WT2802PM_DL6 → { schedulePattern: 'SATURDAY', classTime: '1:00 PM - 3:30 PM' }
function deriveScheduleFromIdentifier(courseIdentifier) {
  if (!courseIdentifier) return {};
  const timeMatch = courseIdentifier.match(/(AM|PM|NT)_/);
  if (!timeMatch) return {};
  const timeCode = timeMatch[1];
  const timeMap = { AM: '9:30 AM - 12:00 PM', PM: '1:00 PM - 3:30 PM', NT: '7:00 PM - 9:30 PM' };
  const classTime = timeMap[timeCode] || null;

  // Derive day from the date in the identifier (DDMM format after type prefix)
  const dateMatch = courseIdentifier.match(/^[A-Z]{2}(\d{2})(\d{2})/);
  if (!dateMatch) return { classTime };
  const day = parseInt(dateMatch[1]);
  const month = parseInt(dateMatch[2]) - 1;
  const year = new Date().getFullYear();
  const date = new Date(year, month, day);
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return { schedulePattern: days[date.getDay()], classTime };
}

app.get('/api/admin/students/:studentId/next-package-course', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const studentId = parseInt(req.params.studentId);
  const enrollmentId = parseInt(req.query.enrollmentId);

  const { data: enrollment } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', enrollmentId)
    .eq('student_id', studentId)
    .single();

  if (!enrollment || !enrollment.package_total_courses || enrollment.package_total_courses < 2) {
    return res.json({ available: false });
  }

  // Count package progress (scoped to this package, not the student's lifetime)
  const progress = await getPackageProgress(supabaseDb.supabase, studentId, enrollment);
  const remaining = progress ? progress.remaining : 0;

  if (remaining <= 0) {
    return res.json({ available: false, reason: 'no_remaining' });
  }

  // Derive schedule from identifier if missing
  const derived = deriveScheduleFromIdentifier(enrollment.course_identifier);
  const schedulePattern = enrollment.schedule_pattern || derived.schedulePattern;
  const classTime = enrollment.class_time || derived.classTime;

  // Derive end date from bookings if missing
  let currentEndDate = enrollment.course_end_date;
  if (!currentEndDate) {
    const { data: lastBooking } = await supabaseDb.supabase
      .from('bookings')
      .select('class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('course_enrollment_id', enrollment.id)
      .order('class_instances(class_date)', { ascending: false })
      .limit(1);
    currentEndDate = lastBooking?.[0]?.class_instances?.class_date?.split(/[T ]/)[0] || new Date().toISOString().split('T')[0];
  }

  if (!schedulePattern || !classTime) {
    return res.json({ available: false, reason: 'missing_schedule' });
  }

  // Backfill missing schedule data on the enrollment
  if (!enrollment.schedule_pattern || !enrollment.class_time) {
    await supabaseDb.supabase
      .from('course_enrollments')
      .update({ schedule_pattern: schedulePattern, class_time: classTime, updated_at: new Date().toISOString() })
      .eq('id', enrollmentId);
  }

  const { data: futureCourses } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('course_start_date, course_end_date, course_identifier, instructor, course_variant_title')
    .eq('schedule_pattern', schedulePattern)
    .eq('class_time', classTime)
    .gt('course_start_date', currentEndDate)
    .not('course_start_date', 'is', null)
    .order('course_start_date', { ascending: true });

  const seenDates = new Set();
  const uniqueCourses = (futureCourses || []).filter(c => {
    if (seenDates.has(c.course_start_date)) return false;
    seenDates.add(c.course_start_date);
    return true;
  });

  if (uniqueCourses.length === 0) {
    return res.json({ available: false, reason: 'no_matching_course' });
  }

  // Check not already enrolled
  const nextCourse = uniqueCourses[0];
  const { data: existing } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('course_start_date', nextCourse.course_start_date)
    .eq('schedule_pattern', schedulePattern)
    .eq('class_time', classTime)
    .maybeSingle();

  if (existing) {
    return res.json({ available: false, reason: 'already_enrolled' });
  }

  res.json({
    available: true,
    nextCourse: {
      startDate: nextCourse.course_start_date,
      endDate: nextCourse.course_end_date,
      identifier: nextCourse.course_identifier,
      instructor: nextCourse.instructor,
      variantTitle: nextCourse.course_variant_title,
    },
    remaining,
  });
}));

// Continue package — enroll student in next course of their 3x6 package
app.post('/api/admin/students/:studentId/continue-package', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const studentId = parseInt(req.params.studentId);
  const { currentEnrollmentId } = req.body;

  // 1. Get current enrollment and validate it's a package
  const { data: currentEnrollment, error: enrErr } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', currentEnrollmentId)
    .eq('student_id', studentId)
    .single();

  if (enrErr || !currentEnrollment) {
    return res.status(404).json({ error: 'Enrollment not found' });
  }

  if (!currentEnrollment.package_total_courses || currentEnrollment.package_total_courses < 2) {
    return res.status(400).json({ error: 'Not a multi-course package enrollment' });
  }

  // 2. Position inside THIS package (a repeat purchase restarts at course 1)
  const progress = await getPackageProgress(supabaseDb.supabase, studentId, currentEnrollment);
  const remaining = progress ? progress.remaining : 0;
  const currentCourseNumber = progress ? progress.current : 0;

  if (remaining <= 0) {
    return res.status(400).json({ error: 'No remaining courses in this package' });
  }

  // 3. Find the next launched course matching same day/time
  const derived = deriveScheduleFromIdentifier(currentEnrollment.course_identifier);
  const schedulePattern = currentEnrollment.schedule_pattern || derived.schedulePattern;
  const classTime = currentEnrollment.class_time || derived.classTime;
  const courseType = currentEnrollment.course_type || 'Wheelthrowing Beginner';

  // Derive end date from bookings if missing
  let currentEndDate = currentEnrollment.course_end_date;
  if (!currentEndDate) {
    const { data: lastBooking } = await supabaseDb.supabase
      .from('bookings')
      .select('class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('course_enrollment_id', currentEnrollment.id)
      .order('class_instances(class_date)', { ascending: false })
      .limit(1);
    currentEndDate = lastBooking?.[0]?.class_instances?.class_date?.split(/[T ]/)[0] || new Date().toISOString().split('T')[0];
  }

  if (!schedulePattern || !classTime) {
    return res.status(400).json({ error: 'Current enrollment missing schedule pattern or class time' });
  }

  // Find future enrollments with same pattern (these represent launched courses)
  const { data: futureCourses } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('course_start_date, course_end_date, course_identifier, schedule_pattern, class_time, instructor, course_title, course_variant_title')
    .eq('schedule_pattern', schedulePattern)
    .eq('class_time', classTime)
    .gt('course_start_date', currentEndDate)
    .not('course_start_date', 'is', null)
    .order('course_start_date', { ascending: true });

  // Deduplicate by course_start_date (multiple students may be enrolled)
  const seenDates = new Set();
  const uniqueCourses = (futureCourses || []).filter(c => {
    if (seenDates.has(c.course_start_date)) return false;
    seenDates.add(c.course_start_date);
    return true;
  });

  if (uniqueCourses.length === 0) {
    return res.status(404).json({ error: 'No upcoming course found matching this schedule' });
  }

  const nextCourse = uniqueCourses[0];

  // 4. Check student isn't already enrolled in this course
  const { data: existingEnrollment } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('course_start_date', nextCourse.course_start_date)
    .eq('schedule_pattern', schedulePattern)
    .eq('class_time', classTime)
    .maybeSingle();

  if (existingEnrollment) {
    return res.status(400).json({ error: 'Student already enrolled in this course' });
  }

  // 5. Create new enrollment for next course
  const { createCourseEnrollment } = supabaseDb;
  const newEnrollment = await createCourseEnrollment({
    studentId: studentId,
    shopifyOrderId: currentEnrollment.shopify_order_id,
    shopifyLineItemId: `${currentEnrollment.shopify_line_item_id || 'PKG'}-C${currentCourseNumber + 1}`,
    courseTitle: currentEnrollment.course_title,
    courseVariantTitle: nextCourse.course_variant_title || currentEnrollment.course_variant_title,
    courseType: courseType,
    schedulePattern: schedulePattern,
    numberOfWeeks: 6,
    courseStartDate: nextCourse.course_start_date,
    courseEndDate: nextCourse.course_end_date,
    classTime: classTime,
    instructor: nextCourse.instructor || currentEnrollment.instructor,
    room: currentEnrollment.room,
    status: 'active',
    packageTotalCourses: currentEnrollment.package_total_courses,
    packageTotalClasses: currentEnrollment.package_total_classes,
    packageCoursesRemaining: remaining - 1,
  });

  // 6. Run threshold check (this will create classes/bookings if 4+ students)
  const { checkAndProcessThreshold } = require('../utils/courseEnrollmentManager');
  try {
    await checkAndProcessThreshold(newEnrollment);
    console.log(`✅ Threshold check completed for package continuation enrollment ${newEnrollment.id}`);
  } catch (thresholdErr) {
    console.error('⚠️ Threshold check failed (enrollment still created):', thresholdErr);
  }

  console.log(`📦 Package continuation: student ${studentId} enrolled in course ${nextCourse.course_start_date} (${remaining - 1} remaining)`);

  res.json({
    success: true,
    enrollment: newEnrollment,
    nextCourse: {
      startDate: nextCourse.course_start_date,
      endDate: nextCourse.course_end_date,
      identifier: nextCourse.course_identifier,
    },
    packageCoursesRemaining: remaining - 1,
  });
}));

// Pause an enrollment
app.post('/api/admin/enrollments/:id/pause', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const enrollmentId = parseInt(req.params.id);
  const { weeksCompleted, weeksRemaining, reason } = req.body;

  // Get the enrollment first
  const { data: enrollment, error: fetchError } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*, customers(first_name, last_name, email)')
    .eq('id', enrollmentId)
    .single();

  if (fetchError || !enrollment) {
    return res.status(404).json({ error: 'Enrollment not found' });
  }

  if (enrollment.status !== 'active') {
    return res.status(400).json({ error: 'Enrollment is not active' });
  }

  // Update enrollment to paused
  const { error: updateError } = await supabaseDb.supabase
    .from('course_enrollments')
    .update({
      status: 'paused',
      weeks_completed: weeksCompleted,
      weeks_remaining: weeksRemaining,
      updated_at: new Date().toISOString()
    })
    .eq('id', enrollmentId);

  if (updateError) {
    console.error('Error pausing enrollment:', updateError);
    return res.status(500).json({ error: 'Failed to pause enrollment' });
  }

  // Get all bookings for this student and mark attended/cancelled based on weeks completed
  const { data: bookings } = await supabaseDb.supabase
    .from('bookings')
    .select('id, status, class_instances!bookings_class_instance_id_fkey(class_date)')
    .eq('student_id', enrollment.student_id)
    .order('class_instances(class_date)', { ascending: true });

  if (bookings && bookings.length > 0) {
    // Mark first N bookings as attended
    if (weeksCompleted > 0) {
      const completedBookingIds = bookings.slice(0, weeksCompleted).map(b => b.id);
      await supabaseDb.supabase
        .from('bookings')
        .update({ attended: true })
        .in('id', completedBookingIds);
    }

    // Cancel remaining bookings and sync their class instances to Google Calendar
    const remainingBookingIds = bookings.slice(weeksCompleted).map(b => b.id);
    const remainingClassIds = bookings.slice(weeksCompleted).map(b => b.class_instance_id).filter(Boolean);
    if (remainingBookingIds.length > 0) {
      await supabaseDb.supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .in('id', remainingBookingIds);

      // Update Google Calendar for affected classes
      try {
        const calendarSync = require('../utils/calendarSync');
        for (const classId of remainingClassIds) {
          calendarSync.syncClassInstance(classId).catch(() => {});
        }
      } catch (e) { /* ignore */ }
    }
  }

  console.log(`✅ Paused enrollment ${enrollmentId} for student ${enrollment.student_id} - ${weeksCompleted}/${enrollment.number_of_weeks} weeks`);

  res.json({
    success: true,
    message: 'Enrollment paused successfully',
    enrollment: {
      id: enrollmentId,
      weeksCompleted,
      weeksRemaining,
      status: 'paused'
    }
  });
}));

// Mark enrollment as completed — marks all past bookings as attended
app.post('/api/admin/enrollments/:id/complete', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const enrollmentId = parseInt(req.params.id);

  const { data: enrollment, error: fetchError } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', enrollmentId)
    .single();

  if (fetchError || !enrollment) {
    return res.status(404).json({ error: 'Enrollment not found' });
  }

  // Mark all past bookings as attended
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: bookings } = await supabaseDb.supabase
    .from('bookings')
    .select('id, status, class_instances!bookings_class_instance_id_fkey(class_date)')
    .eq('course_enrollment_id', enrollmentId)
    .in('status', ['booked']);

  const pastBookingIds = (bookings || [])
    .filter(b => b.class_instances?.class_date?.split(/[T ]/)[0] <= todayStr)
    .map(b => b.id);

  if (pastBookingIds.length > 0) {
    await supabaseDb.supabase
      .from('bookings')
      .update({ status: 'attended', updated_at: new Date().toISOString() })
      .in('id', pastBookingIds);
  }

  // Count total attended
  const { count: attendedCount } = await supabaseDb.supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('course_enrollment_id', enrollmentId)
    .in('status', ['attended', 'completed']);

  // Update enrollment to completed — credits are computed on read
  await supabaseDb.supabase
    .from('course_enrollments')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString()
    })
    .eq('id', enrollmentId);

  res.json({ success: true, attendedCount, message: 'Enrollment marked as completed' });
}));

// Get dashboard stats summary (lightweight, count-only)
app.get('/api/admin/dashboard/stats/summary', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const todayStr = new Date().toISOString().split('T')[0];

  // Get month boundaries for "this month" counts
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const [
    { count: totalStudents, error: e1 },
    { count: totalClasses, error: e2 },
    { count: totalBookings, error: e3 },
    { count: activeMemberships, error: e4 },
    { count: galleryPieces, error: e5 },
    { count: pendingStudioAccess, error: e6 },
    { count: totalInstructors, error: e7 },
    { count: loggedPieces, error: e8 },
    { data: monthClasses, error: e9 },
    { data: activeEnrollments, error: e10 }
  ] = await Promise.all([
    supabaseDb.supabase
      .from('customers')
      .select('*', { count: 'exact', head: true }),
    supabaseDb.supabase
      .from('class_instances')
      .select('*', { count: 'exact', head: true })
      .gte('class_date', todayStr),
    supabaseDb.supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .in('status', ['booked', 'attended']),
    supabaseDb.supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'expiring']),
    supabaseDb.supabase
      .from('pottery_pieces')
      .select('*', { count: 'exact', head: true }),
    supabaseDb.supabase
      .from('studio_access_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabaseDb.supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'instructor'),
    supabaseDb.supabase
      .from('piece_batches')
      .select('*', { count: 'exact', head: true })
      .not('status', 'in', '("collected","shipped","recycled")'),
    // Classes this month with type
    supabaseDb.supabase
      .from('class_instances')
      .select('class_type')
      .gte('class_date', monthStart)
      .lte('class_date', monthEnd + 'T23:59:59'),
    // Active enrollments with course type for WT/HB student breakdown
    supabaseDb.supabase
      .from('course_enrollments')
      .select('student_id, course_type')
      .eq('status', 'active')
  ]);

  const err = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8 || e9 || e10;
  if (err) throw err;

  // Count WT/HB classes this month
  const wtClassesThisMonth = (monthClasses || []).filter(c => (c.class_type || '').startsWith('WT')).length;
  const hbClassesThisMonth = (monthClasses || []).filter(c => (c.class_type || '').startsWith('HB')).length;

  // Count unique WT/HB students
  const wtStudentIds = new Set();
  const hbStudentIds = new Set();
  (activeEnrollments || []).forEach(e => {
    const ct = (e.course_type || '').toLowerCase();
    if (ct.includes('wheelthrowing') || ct.startsWith('wt')) wtStudentIds.add(e.student_id);
    else if (ct.includes('handbuilding') || ct.startsWith('hb')) hbStudentIds.add(e.student_id);
  });

  res.json({
    totalStudents: totalStudents || 0,
    totalClasses: totalClasses || 0,
    totalBookings: totalBookings || 0,
    activeMemberships: activeMemberships || 0,
    galleryPieces: galleryPieces || 0,
    loggedPieces: loggedPieces || 0,
    pendingStudioAccess: pendingStudioAccess || 0,
    totalInstructors: totalInstructors || 0,
    classesThisMonth: (monthClasses || []).length,
    wtClassesThisMonth,
    hbClassesThisMonth,
    wtStudents: wtStudentIds.size,
    hbStudents: hbStudentIds.size,
  });
}));

// Get dashboard stats
app.get('/api/admin/dashboard/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  // Get period filter from query params
  const { startDate: periodStart, endDate: periodEnd } = req.query;

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayOfWeek = new Date(now);
  firstDayOfWeek.setDate(now.getDate() - now.getDay());

  // Use period dates if provided, otherwise use current date
  const filterStartDate = periodStart || null;
  const filterEndDate = periodEnd || null;

  console.log(`📊 Dashboard Stats Request: Period ${filterStartDate || 'All'} to ${filterEndDate || 'All'}`);

  // Fetch all customers with pagination (Supabase default limit is 1000)
  let allStudents = [];
  let page = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseDb.supabase
      .from('customers')
      .select('id, created_at, course_purchase_count, course_purchase_date, course_expiry_date')
      .in('customer_type', ['student', 'member', 'student & member'])
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (error) throw error;
    allStudents = allStudents.concat(data || []);
    hasMore = (data?.length || 0) === 1000;
    page++;
  }

  // Fetch all bookings with pagination (including class_instance_id for future bookings check)
  let allBookings = [];
  page = 0;
  hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseDb.supabase
      .from('bookings')
      .select('id, student_id, created_at, status, attended, class_instance_id')
      .in('status', ['booked', 'completed'])
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (error) throw error;
    allBookings = allBookings.concat(data || []);
    hasMore = (data?.length || 0) === 1000;
    page++;
  }

  // Get other data in parallel (these are unlikely to exceed 1000 rows)
  // Apply period filter if provided
  let classQuery = supabaseDb.supabase
    .from('class_instances')
    .select('id, class_date, max_capacity');

  if (filterStartDate && filterEndDate) {
    classQuery = classQuery.gte('class_date', filterStartDate).lte('class_date', filterEndDate);
  }

  const results = await Promise.allSettled([
    classQuery,
    supabaseDb.supabase
      .from('memberships')
      .select('id, status, end_date, created_at')
      .eq('status', 'active'),
    supabaseDb.getAllPotteryPieces()
  ]);

  // Extract data with fallbacks (students and bookings are already populated above)
  const allClasses = results[0].status === 'fulfilled' ? (results[0].value.data || []) : [];
  const allMemberships = results[1].status === 'fulfilled' ? (results[1].value.data || []) : [];
  const allGalleryPieces = results[2].status === 'fulfilled' ? (results[2].value || []) : [];

  // Separate future classes for availability calculation
  const today = now.toISOString().split('T')[0];
  const futureClasses = allClasses.filter(cls => cls.class_date >= today);

  // Create a map of class_instance_id -> class_date for quick lookup
  const classDateMap = {};
  allClasses.forEach(cls => {
    classDateMap[cls.id] = cls.class_date;
  });

  // Calculate student stats
  // Active students: students who have bookings for classes on or after today OR have paused enrollments
  const activeStudentIds = new Set();
  allBookings.forEach(booking => {
    const classDate = classDateMap[booking.class_instance_id];
    if (classDate && classDate >= today && booking.student_id) {
      activeStudentIds.add(booking.student_id);
    }
  });

  // Also include students with paused enrollments
  const { data: pausedEnrollments } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('student_id')
    .eq('status', 'paused');

  if (pausedEnrollments) {
    pausedEnrollments.forEach(enrollment => {
      activeStudentIds.add(enrollment.student_id);
    });
  }

  console.log(`📊 Dashboard Stats: ${allStudents.length} total students, ${activeStudentIds.size} active students (with future bookings or paused enrollments), ${allBookings.length} bookings, ${allClasses.length} total classes (${futureClasses.length} future), ${allMemberships.length} memberships, ${allGalleryPieces.length} gallery pieces`);

  // Get full student objects for active students
  const activeStudents = allStudents.filter(s => activeStudentIds.has(s.id));

  const newStudentsThisMonth = activeStudents.filter(s =>
    new Date(s.created_at) >= firstDayOfMonth
  ).length;

  // Returning students: students with multiple course purchases within the last year
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  const returningStudents = allStudents.filter(s => {
    // Must have purchased more than one course
    if ((s.course_purchase_count || 0) <= 1) return false;

    // Must have a recent course purchase (within last year)
    if (!s.course_purchase_date) return false;
    const purchaseDate = new Date(s.course_purchase_date);
    return purchaseDate >= oneYearAgo;
  }).length;

  // Get paused students count (reuse pausedEnrollments from active students calculation above)
  const pausedStudentsCount = pausedEnrollments ? new Set(pausedEnrollments.map(e => e.student_id)).size : 0;

  // Calculate class stats
  // Total enrolled = unique students with bookings
  const totalEnrolled = new Set(allBookings.map(b => b.student_id)).size;

  // Use future classes for capacity calculation
  const totalCapacity = futureClasses.reduce((sum, cls) => sum + (cls.max_capacity || 8), 0);
  const futureClassIdSet = new Set(futureClasses.map(c => c.id));
  const futureBookings = allBookings.filter(b => futureClassIdSet.has(b.class_instance_id));
  const availableSpots = Math.max(0, totalCapacity - futureBookings.length);

  // Calculate booking stats
  const bookingsThisWeek = allBookings.filter(b =>
    new Date(b.created_at) >= firstDayOfWeek
  ).length;

  const attendedBookings = allBookings.filter(b => b.attended === true).length;
  const attendanceRate = allBookings.length > 0
    ? Math.round((attendedBookings / allBookings.length) * 100)
    : 0;

  // Calculate membership stats
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(now.getDate() + 30);

  const expiringSoon = allMemberships.filter(m =>
    new Date(m.end_date) <= thirtyDaysFromNow && new Date(m.end_date) >= now
  ).length;

  const renewedThisMonth = allMemberships.filter(m =>
    new Date(m.created_at) >= firstDayOfMonth
  ).length;

  // Calculate gallery stats
  const addedThisMonth = allGalleryPieces.filter(p =>
    new Date(p.date_completed || p.created_at) >= firstDayOfMonth
  ).length;

  const awaitingApproval = 0; // Gallery doesn't have approval system yet

  // Studio access stats
  const { data: studioBookings } = await supabaseDb.supabase
    .from('studio_access_bookings')
    .select('id, status, booking_date')
    .neq('status', 'cancelled');
  const todayStr2 = now.toISOString().split('T')[0];
  const studioUpcoming = (studioBookings || []).filter(b => b.booking_date >= todayStr2).length;
  const studioPending = (studioBookings || []).filter(b => b.status === 'pending').length;
  const studioConfirmed = (studioBookings || []).filter(b => b.status === 'booked' && b.booking_date >= todayStr2).length;

  res.json({
    students: {
      total: activeStudentIds.size, // Count students with future bookings (matches Student Management)
      newThisMonth: newStudentsThisMonth,
      returning: returningStudents,
      paused: pausedStudentsCount
    },
    classes: {
      total: futureClasses.length,
      enrolled: totalEnrolled,
      availableSpots: Math.max(0, availableSpots)
    },
    bookings: {
      total: allBookings.length,
      thisWeek: bookingsThisWeek,
      attendanceRate: attendanceRate
    },
    memberships: {
      total: allMemberships.length,
      expiringSoon: expiringSoon,
      renewedThisMonth: renewedThisMonth
    },
    gallery: {
      total: allGalleryPieces.length,
      addedThisMonth: addedThisMonth,
      awaitingApproval: awaitingApproval
    },
    studioAccess: {
      upcoming: studioUpcoming,
      pending: studioPending,
      confirmed: studioConfirmed
    }
  });
}));

// Dashboard alerts + recent activity
app.get('/api/admin/dashboard/activity', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const fourteenDaysFromNow = new Date(now);
  fourteenDaysFromNow.setDate(now.getDate() + 14);
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(now.getDate() + 7);
  const sevenDaysStr = sevenDaysFromNow.toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

  const [alertMembershipsRes, recentBookingsRes, recentMembershipsRes, upcomingClassesRes, recentEnrollmentsRes, recentPiecesRes, todayClassesRes, pendingStudioAccessRes, cancelledClassesRes, recentStudioAccessRes] = await Promise.all([
    // Memberships expiring within 14 days
    supabaseDb.supabase
      .from('memberships')
      .select('id, membership_type, end_date, customer:customers!memberships_customer_id_fkey(first_name, last_name)')
      .eq('status', 'active')
      .lte('end_date', fourteenDaysFromNow.toISOString().split('T')[0])
      .gte('end_date', today)
      .order('end_date', { ascending: true })
      .limit(6),

    // Recent bookings + cancellations (last 7 days only)
    supabaseDb.supabase
      .from('bookings')
      .select('id, status, created_at, student:customers!bookings_student_id_fkey(first_name, last_name), class_instance:class_instances!bookings_class_instance_id_fkey(class_date, class_type, start_time)')
      .in('status', ['booked', 'cancelled'])
      .gte('created_at', thirtyDaysAgoStr)
      .order('created_at', { ascending: false })
      .limit(20),

    // Recent memberships created (last 30 days only)
    supabaseDb.supabase
      .from('memberships')
      .select('id, membership_type, created_at, customer:customers!memberships_customer_id_fkey(first_name, last_name)')
      .gte('created_at', thirtyDaysAgoStr)
      .order('created_at', { ascending: false })
      .limit(5),

    // Upcoming classes this week (for near-full alerts) — exclude cancelled
    supabaseDb.supabase
      .from('class_instances')
      .select('id, class_date, class_type, start_time, max_capacity, status')
      .gte('class_date', today)
      .lte('class_date', sevenDaysStr)
      .neq('status', 'cancelled')
      .order('class_date', { ascending: true })
      .limit(30),

    // Recent enrollments
    supabaseDb.supabase
      .from('course_enrollments')
      .select('id, course_name, status, created_at, student:customers!course_enrollments_student_id_fkey(first_name, last_name)')
      .gte('created_at', thirtyDaysAgoStr)
      .order('created_at', { ascending: false })
      .limit(10),

    // Recent gallery pieces
    supabaseDb.supabase
      .from('pottery_pieces')
      .select('id, title, created_at, student:customers!pottery_pieces_student_id_fkey(first_name, last_name)')
      .gte('created_at', thirtyDaysAgoStr)
      .order('created_at', { ascending: false })
      .limit(5),

    // Today's classes (for "classes today" alert) — exclude cancelled
    supabaseDb.supabase
      .from('class_instances')
      .select('id, class_date, class_type, start_time, status')
      .eq('class_date', today)
      .neq('status', 'cancelled'),

    // Pending studio access bookings
    supabaseDb.supabase
      .from('studio_access_bookings')
      .select('id', { count: 'exact' })
      .eq('status', 'pending'),

    // Recently cancelled classes (for activity feed)
    supabaseDb.supabase
      .from('class_instances')
      .select('id, class_type, class_date, status, cancellation_reason, updated_at, instructor')
      .eq('status', 'cancelled')
      .gte('updated_at', thirtyDaysAgoStr)
      .order('updated_at', { ascending: false })
      .limit(5),

    // Recent studio access bookings (for activity feed, last 30 days)
    supabaseDb.supabase
      .from('studio_access_bookings')
      .select('id, booking_date, start_time, hours, amount_sgd, credit_applied, status, created_at, updated_at, customer:customers(first_name, last_name)')
      .gte('created_at', thirtyDaysAgoStr)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  // ── Alerts ──────────────────────────────────────────────────────────────
  const alerts = [];
  const alertKeys = new Set();

  function addAlert(type, icon, text, priority) {
    if (alertKeys.has(text)) return;
    alertKeys.add(text);
    alerts.push({ type, icon, text, priority });
  }

  // Today's classes summary
  const todayClasses = todayClassesRes.data || [];
  if (todayClasses.length > 0) {
    const wtCount = todayClasses.filter(c => (c.class_type || '').startsWith('WT')).length;
    const hbCount = todayClasses.filter(c => (c.class_type || '').startsWith('HB')).length;
    const parts = [];
    if (wtCount) parts.push(`${wtCount} WT`);
    if (hbCount) parts.push(`${hbCount} HB`);
    addAlert('info', 'today', `${todayClasses.length} class${todayClasses.length !== 1 ? 'es' : ''} today — ${parts.join(', ')}`, 0);
  }

  // Near-full / full class alerts
  const upcomingClasses = upcomingClassesRes.data || [];
  if (upcomingClasses.length > 0) {
    const classIds = upcomingClasses.map(c => c.id);
    const { data: classBookings } = await supabaseDb.supabase
      .from('bookings')
      .select('class_instance_id')
      .in('class_instance_id', classIds)
      .in('status', ['booked', 'attended']);

    const bookingCounts = {};
    (classBookings || []).forEach(b => {
      bookingCounts[b.class_instance_id] = (bookingCounts[b.class_instance_id] || 0) + 1;
    });

    upcomingClasses.forEach(c => {
      const booked = bookingCounts[c.id] || 0;
      const capacity = c.max_capacity || 8;
      const spotsLeft = capacity - booked;
      if (spotsLeft <= 2 && booked > 0) {
        const rawDate = (c.class_date || '').split(/[T ]/)[0];
        const dateStr = rawDate ? new Date(rawDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
        const typeLabel = (c.class_type || '').startsWith('WT') ? 'Wheelthrowing' : (c.class_type || '').startsWith('HB') ? 'Handbuilding' : (c.class_type || '').substring(0, 10);
        if (spotsLeft === 0) {
          addAlert('class', 'event_busy', `${typeLabel} ${dateStr} — fully booked`, 1);
        } else {
          addAlert('class', 'event_available', `${typeLabel} ${dateStr} — ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`, 2);
        }
      }
    });
  }

  // Membership expiry alerts
  (alertMembershipsRes.data || []).forEach(m => {
    const endDate = new Date(m.end_date + 'T12:00:00');
    const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    const name = m.customer ? `${m.customer.first_name} ${m.customer.last_name}`.trim() : 'Unknown';
    const urgency = daysLeft <= 3 ? 'expires in ' + daysLeft + 'd' : 'expires ' + endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    addAlert('membership', 'card_membership', `${name} — ${m.membership_type} ${urgency}`, daysLeft <= 3 ? 1 : 3);
  });

  // New enrollments needing attention (paused)
  const pausedEnrollments = (recentEnrollmentsRes.data || []).filter(e => e.status === 'paused');
  pausedEnrollments.forEach(e => {
    const name = e.student ? `${e.student.first_name} ${e.student.last_name}`.trim() : 'Unknown';
    addAlert('enrollment', 'pause_circle', `${name} — ${e.course_name || 'course'} paused`, 2);
  });

  // Pending studio access bookings
  const pendingStudioAccess = pendingStudioAccessRes?.data || [];
  if (pendingStudioAccess.length > 0) {
    addAlert('studio_pending', 'chair', `${pendingStudioAccess.length} studio access booking${pendingStudioAccess.length !== 1 ? 's' : ''} awaiting confirmation`, 1);
  }

  // Sort alerts by priority (lower = more urgent), then deduplicate and limit
  alerts.sort((a, b) => a.priority - b.priority);
  const topAlerts = alerts.slice(0, 5).map(({ priority, ...rest }) => rest);

  // ── Recent Activity ──────────────────────────────────────────────────────
  function timeAgo(dateStr) {
    const diffMs = now - new Date(dateStr);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  const activity = [];
  const activityKeys = new Set();

  function addActivity(action, who, detail, when, createdAt, highlight) {
    const key = `${action}|${who}|${detail}`;
    if (activityKeys.has(key)) return;
    activityKeys.add(key);
    activity.push({ action, who, detail, when, createdAt, ...(highlight ? { highlight } : {}) });
  }

  // Bookings/cancellations — group batch bookings (e.g. 6-week WT enrollment creates 6 at once)
  const bookingGroups = {};
  (recentBookingsRes.data || []).forEach(b => {
    const name = b.student ? `${b.student.first_name} ${b.student.last_name}`.trim() : 'Unknown';
    const action = b.status === 'cancelled' ? 'Cancelled' : 'Booked';
    const ci = b.class_instance;
    const typeShort = ci ? ((ci.class_type || '').startsWith('WT') ? 'WT' : (ci.class_type || '').startsWith('HB') ? 'HB' : (ci.class_type || '').substring(0, 6)) : '';
    // Group by student + action + class type + created_at (within 60s = batch)
    const createdMin = Math.floor(new Date(b.created_at).getTime() / 60000);
    const groupKey = `${action}|${name}|${typeShort}|${createdMin}`;
    if (!bookingGroups[groupKey]) {
      bookingGroups[groupKey] = { action, name, typeShort, createdAt: b.created_at, count: 0, firstDate: null };
    }
    bookingGroups[groupKey].count++;
    if (ci && ci.class_date) {
      const d = (ci.class_date || '').split(/[T ]/)[0];
      if (!bookingGroups[groupKey].firstDate || d < bookingGroups[groupKey].firstDate) {
        bookingGroups[groupKey].firstDate = d;
      }
    }
  });
  Object.values(bookingGroups).forEach(g => {
    let detail = '';
    if (g.count > 1) {
      detail = `${g.typeShort} — ${g.count} classes`;
    } else if (g.firstDate) {
      const dateStr = new Date(g.firstDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      detail = `${g.typeShort} ${dateStr}`;
    } else {
      detail = g.typeShort;
    }
    addActivity(g.action, g.name, detail, timeAgo(g.createdAt), g.createdAt);
  });

  // New enrollments
  (recentEnrollmentsRes.data || []).filter(e => e.status === 'active').forEach(e => {
    const name = e.student ? `${e.student.first_name} ${e.student.last_name}`.trim() : 'Unknown';
    addActivity('Enrolled', name, e.course_name || 'New course', timeAgo(e.created_at), e.created_at);
  });

  // New memberships
  (recentMembershipsRes.data || []).forEach(m => {
    const name = m.customer ? `${m.customer.first_name} ${m.customer.last_name}`.trim() : 'Unknown';
    addActivity('Membership', name, m.membership_type, timeAgo(m.created_at), m.created_at);
  });

  // Gallery uploads
  (recentPiecesRes.data || []).forEach(p => {
    const name = p.student ? `${p.student.first_name} ${p.student.last_name}`.trim() : 'Unknown';
    addActivity('Gallery', name, p.title || 'New piece added', timeAgo(p.created_at), p.created_at);
  });

  // Cancelled classes
  (cancelledClassesRes.data || []).forEach(ci => {
    const dateStr = ci.class_date ? new Date((ci.class_date || '').split(/[T ]/)[0] + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
    const reason = ci.cancellation_reason && ci.cancellation_reason !== '-' ? ` — ${ci.cancellation_reason}` : '';
    addActivity('Cancelled', ci.instructor || 'Instructor', `${ci.class_type} ${dateStr}${reason}`, timeAgo(ci.updated_at), ci.updated_at, 'highlight');
  });

  // Studio access bookings
  (recentStudioAccessRes.data || []).forEach(sa => {
    const name = sa.customer ? `${sa.customer.first_name} ${sa.customer.last_name}`.trim() : 'Unknown';
    const dateStr = sa.booking_date ? new Date(sa.booking_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
    const statusLabel = sa.status === 'pending' ? ' (pending)' : sa.status === 'cancelled' ? ' (cancelled)' : '';
    const creditApplied = sa.credit_applied || 0;
    const totalAmount = sa.amount_sgd || 0;
    const remaining = totalAmount - creditApplied;
    const creditNote = creditApplied > 0 ? ` · $${creditApplied} credit used` + (remaining > 0 ? ` · $${remaining} outstanding` : '') : '';
    const activityDate = sa.status === 'attended' ? (sa.updated_at || sa.created_at) : sa.created_at;
    addActivity('Studio', name, `Studio access ${dateStr}${statusLabel}${creditNote}`, timeAgo(activityDate), activityDate, creditApplied > 0 && remaining > 0 ? 'highlight' : null);
  });

  // New signups (customers created in last 7 days with course_purchase_count = 0 or 1)
  {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: newCustomers } = await supabaseDb.supabase
      .from('customers')
      .select('id, first_name, last_name, created_at')
      .gte('created_at', sevenDaysAgo.toISOString())
      .lte('course_purchase_count', 1)
      .not('first_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);
    (newCustomers || []).forEach(c => {
      const name = `${c.first_name} ${c.last_name}`.trim();
      addActivity('Signup', name, 'New student', timeAgo(c.created_at), c.created_at);
    });
  }

  // Sort by date, preserve highlight flag
  activity.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const topActivity = activity.slice(0, 8).map(({ createdAt, highlight, ...rest }) => ({ ...rest, ...(highlight ? { highlight } : {}) }));

  res.json({ alerts: topAlerts, activity: topActivity });
}));

// Dashboard engagement metrics (active users 1d/7d/30d, never logged in, recent logins)
app.get('/api/admin/dashboard/engagement', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Exclude admin account (info@ves.sg) from all engagement metrics
  const ADMIN_EMAIL = 'info@ves.sg';

  const [
    { count: totalStudents },
    { count: activeToday },
    { count: activeLastWeek },
    { count: activeLastMonth },
    { count: neverLoggedIn },
    { data: loginData },
    { data: recentLogins }
  ] = await Promise.all([
    supabaseDb.supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .neq('email', ADMIN_EMAIL),
    supabaseDb.supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .neq('email', ADMIN_EMAIL)
      .gte('last_login_at', todayStart),
    supabaseDb.supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .neq('email', ADMIN_EMAIL)
      .gte('last_login_at', sevenDaysAgo),
    supabaseDb.supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .neq('email', ADMIN_EMAIL)
      .gte('last_login_at', thirtyDaysAgo),
    supabaseDb.supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .neq('email', ADMIN_EMAIL)
      .is('last_login_at', null),
    supabaseDb.supabase
      .from('customers')
      .select('login_count')
      .neq('email', ADMIN_EMAIL)
      .gt('login_count', 0),
    supabaseDb.supabase
      .from('customers')
      .select('first_name, last_name, last_login_at')
      .neq('email', ADMIN_EMAIL)
      .not('last_login_at', 'is', null)
      .order('last_login_at', { ascending: false })
      .limit(10)
  ]);

  const studentsWhoLoggedIn = (loginData || []).length;
  const totalLogins = (loginData || []).reduce((sum, c) => sum + (c.login_count || 0), 0);

  res.json({
    totalStudents: totalStudents || 0,
    activeToday: activeToday || 0,
    activeLastWeek: activeLastWeek || 0,
    activeLastMonth: activeLastMonth || 0,
    neverLoggedIn: neverLoggedIn || 0,
    studentsWhoLoggedIn,
    totalLogins,
    recentLogins: (recentLogins || []).map(r => ({
      name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown',
      lastLoginAt: r.last_login_at,
    })),
  });
}));

// Platform stats — general platform numbers
app.get('/api/admin/platform-stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const [
    { count: totalCustomers },
    { count: totalEnrollments },
    { count: totalBookings },
    { count: totalPotteryPieces },
    { count: totalMemberships },
    { count: totalClassInstances },
    { data: loginData }
  ] = await Promise.all([
    supabaseDb.supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabaseDb.supabase.from('course_enrollments').select('*', { count: 'exact', head: true }),
    supabaseDb.supabase.from('bookings').select('*', { count: 'exact', head: true }),
    supabaseDb.supabase.from('pottery_pieces').select('*', { count: 'exact', head: true }),
    supabaseDb.supabase.from('memberships').select('*', { count: 'exact', head: true }).in('status', ['active', 'expiring']),
    supabaseDb.supabase.from('class_instances').select('*', { count: 'exact', head: true }),
    supabaseDb.supabase.from('customers').select('login_count').gt('login_count', 0)
  ]);

  const studentsWhoLoggedIn = (loginData || []).length;
  const totalLogins = (loginData || []).reduce((sum, c) => sum + (c.login_count || 0), 0);

  res.json({
    totalCustomers: totalCustomers || 0,
    totalEnrollments: totalEnrollments || 0,
    totalBookings: totalBookings || 0,
    totalPotteryPieces: totalPotteryPieces || 0,
    totalMemberships: totalMemberships || 0,
    totalClassInstances: totalClassInstances || 0,
    studentsWhoLoggedIn,
    totalLogins,
  });
}));

// Get student bookings (accepts email or numeric ID)
app.get('/api/admin/students/:emailOrId/bookings', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { emailOrId } = req.params;
  const decodedParam = decodeURIComponent(emailOrId);

  let student;

  // Check if parameter is a numeric ID or email
  if (/^\d+$/.test(decodedParam)) {
    // It's a numeric ID
    const { data } = await supabaseDb.supabase
      .from('customers')
      .select('id')
      .eq('id', parseInt(decodedParam))
      .single();
    student = data;
  } else {
    // It's an email
    const { data } = await supabaseDb.supabase
      .from('customers')
      .select('id')
      .eq('email', decodedParam)
      .single();
    student = data;
  }

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  // Get their ACTIVE bookings with class details (exclude rescheduled/cancelled)
  // Filter to show bookings from ONLY active or paused enrollments
  // This ensures admin page only shows current course, not completed past courses
  const { data: allBookings, error } = await supabaseDb.supabase
    .from('bookings')
    .select(`
      *,
      class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        start_time,
        end_time,
        class_type,
        instructor
      ),
      course_enrollment:course_enrollments!bookings_course_enrollment_id_fkey (
        status
      )
    `)
    .eq('student_id', student.id)
    .in('status', ['booked', 'completed', 'attended', 'forfeited', 'absent'])
    .order('class_instances(class_date)', { ascending: false });

  // Filter bookings: keep those from active/paused enrollments, or without enrollment link
  // Only exclude bookings explicitly tied to completed/cancelled enrollments
  const enrollmentHasFutureBookings = {};
  const todayStr = new Date().toISOString().split('T')[0];
  (allBookings || []).forEach(b => {
    if (b.course_enrollment_id) {
      const classDate = b.class_instances?.class_date?.split(/[T ]/)[0];
      if (classDate && classDate >= todayStr) {
        enrollmentHasFutureBookings[b.course_enrollment_id] = true;
      }
    }
  });

  const bookings = (allBookings || []).filter(booking => {
    // Always exclude bookings whose class date is more than 6 months in the past
    const classDate = booking.class_instances?.class_date?.split(/[T ]/)[0];
    if (classDate && classDate < new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0]) return false;

    // Keep bookings with no enrollment link (standalone/legacy)
    if (!booking.course_enrollment) return true;

    // Keep bookings from active, paused, or upcoming enrollments
    if (['active', 'paused', 'upcoming'].includes(booking.course_enrollment.status)) return true;

    // For completed enrollments: only keep if they have future bookings
    if (booking.course_enrollment.status === 'completed' && enrollmentHasFutureBookings[booking.course_enrollment_id]) return true;

    // For cancelled enrollments: keep if there are still future bookings
    if (enrollmentHasFutureBookings[booking.course_enrollment_id]) return true;

    // Exclude completed/cancelled enrollment bookings with all dates past
    return false;
  });

  if (error) throw error;

  // Get all class instances to generate course identifiers
  const { data: allClassInstances } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, instructor')
    .order('class_date', { ascending: true });

  // Generate course identifiers (same logic as stats endpoint)
  const classIdToCourseIdentifier = {};
  const courseGroups = {};

  allClassInstances.forEach(cls => {
    const clsDate = new Date(cls.class_date);
    const dayOfWeek = clsDate.getDay();
    const signature = `${cls.class_type}_${cls.start_time}_${cls.instructor}_${dayOfWeek}`;
    if (!courseGroups[signature]) {
      courseGroups[signature] = [];
    }
    courseGroups[signature].push(cls);
  });

  // Helper function to generate course identifier
  const generateCourseIdentifier = (classInstance) => {
    const { class_type, class_date, start_time, instructor } = classInstance;
    const typeAbbrev = class_type?.toLowerCase().includes('wheelthrowing') ? 'WT' :
                      class_type?.toLowerCase().includes('handbuilding') ? 'HB' : 'CL';
    const timeCode = start_time === '9:30 AM' ? 'AM' :
                    start_time === '1:00 PM' ? 'PM' :
                    start_time === '7:00 PM' || start_time === '7:30 PM' ? 'NT' : 'XX';
    const instructorCode = instructor === 'Dillon Lin' ? 'DL' :
                          instructor === 'Joyce Lim' ? 'JL' :
                          instructor === 'Lynette Ting' ? 'LT' : 'XX';

    const dateStr = class_date.split(/[T ]/)[0];
    const [year, month, day] = dateStr.split('-').map(n => parseInt(n));
    const startDate = `${day.toString().padStart(2, '0')}${month.toString().padStart(2, '0')}`;

    return `${typeAbbrev}${startDate}${timeCode}_${instructorCode}`;
  };

  Object.values(courseGroups).forEach(classes => {
    if (classes.length === 0) return;
    classes.sort((a, b) => new Date(a.class_date) - new Date(b.class_date));

    const firstClass = classes[0];
    const isWheelthrowing = firstClass.class_type?.toLowerCase().includes('wheelthrowing');

    if (isWheelthrowing) {
      let currentCourse = [];
      let lastDate = null;

      for (let i = 0; i < classes.length; i++) {
        const cls = classes[i];
        const clsDate = new Date(cls.class_date);

        if (!lastDate || (clsDate - lastDate) / (1000 * 60 * 60 * 24) <= 14) {
          currentCourse.push(cls);
          lastDate = clsDate;

          if (currentCourse.length === 6) {
            const courseStartClass = currentCourse[0];
            currentCourse.forEach((c, weekIndex) => {
              const baseIdentifier = generateCourseIdentifier(courseStartClass);
              const weekNumber = weekIndex + 1;
              const fullIdentifier = `${baseIdentifier}6.${weekNumber}`;
              classIdToCourseIdentifier[c.id] = fullIdentifier;
            });
            currentCourse = [];
            lastDate = null;
          }
        } else {
          if (currentCourse.length > 0) {
            const courseStartClass = currentCourse[0];
            const totalWeeks = currentCourse.length;
            currentCourse.forEach((c, weekIndex) => {
              const baseIdentifier = generateCourseIdentifier(courseStartClass);
              const weekNumber = weekIndex + 1;
              const fullIdentifier = `${baseIdentifier}${totalWeeks}.${weekNumber}`;
              classIdToCourseIdentifier[c.id] = fullIdentifier;
            });
          }
          currentCourse = [cls];
          lastDate = clsDate;
        }
      }

      if (currentCourse.length > 0) {
        const courseStartClass = currentCourse[0];
        const totalWeeks = currentCourse.length;
        currentCourse.forEach((c, weekIndex) => {
          const baseIdentifier = generateCourseIdentifier(courseStartClass);
          const weekNumber = weekIndex + 1;
          const fullIdentifier = `${baseIdentifier}${totalWeeks}.${weekNumber}`;
          classIdToCourseIdentifier[c.id] = fullIdentifier;
        });
      }
    }
  });

  // Flatten the data for easier use. Normalize "forfeited" and "absent"
  // to "missed" so the admin UI's Missed filter + BOOKING_STYLE.missed work
  // out of the box. The raw status on the bookings row is unchanged — this
  // is display-only.
  const STATUS_DISPLAY = { forfeited: 'missed', absent: 'missed' };
  const formattedBookings = bookings.map(booking => ({
    id: booking.id,
    status: STATUS_DISPLAY[booking.status] || booking.status,
    // The un-forfeit action has to key on the real status, not the normalised
    // display one — 'missed' covers both forfeited and absent, and neither the
    // filter nor the badge should start distinguishing them.
    raw_status: booking.status,
    attended: booking.attended,
    class_instance_id: booking.class_instance_id,  // Include for double-booking prevention
    course_enrollment_id: booking.course_enrollment_id,
    class_date: booking.class_instances.class_date,
    start_time: booking.class_instances.start_time,
    end_time: booking.class_instances.end_time,
    class_type: booking.class_instances.class_type,
    instructor: booking.class_instances.instructor,
    course_identifier: classIdToCourseIdentifier[booking.class_instances.id] || 'N/A'
  }));

  res.json({ bookings: formattedBookings });
}));

// Update student
app.put('/api/admin/students/:email', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { email } = req.params;
  const decodedEmail = decodeURIComponent(email);
  const { first_name, last_name, email: newEmail, customer_type, course_purchase_count, classes_allocated, phone, wheel_preference } = req.body;

  const updateData = {
    updated_at: new Date().toISOString()
  };

  // Only update fields if they're provided in the request
  const nameChanged = first_name !== undefined || last_name !== undefined;
  if (first_name !== undefined)          updateData.first_name = first_name;
  if (last_name !== undefined)           updateData.last_name = last_name;
  if (newEmail !== undefined)            updateData.email = newEmail;
  if (customer_type !== undefined)       updateData.customer_type = customer_type;
  if (course_purchase_count !== undefined) updateData.course_purchase_count = course_purchase_count;
  if (classes_allocated !== undefined)   updateData.classes_allocated = classes_allocated;
  if (phone !== undefined)               updateData.phone = phone;
  if (wheel_preference !== undefined)    updateData.wheel_preference = wheel_preference;

  // If name changed, set name_locked so sync won't revert the admin's value
  if (nameChanged) updateData.name_locked = true;
  // If email changed, set email_locked so sync won't revert the admin's value
  const emailChanged = newEmail !== undefined;
  if (emailChanged) updateData.email_locked = true;

  const runUpdate = () => supabaseDb.supabase
    .from('customers')
    .update(updateData)
    .eq('email', decodedEmail)
    .select()
    .single();

  let { data, error } = await runUpdate();

  // Defensive: if a *_locked column doesn't exist yet, drop it and retry.
  // Retry up to twice so a missing name_locked AND email_locked both degrade gracefully.
  for (let attempt = 0; attempt < 2 && error; attempt++) {
    if (nameChanged && error.message?.includes('name_locked')) {
      delete updateData.name_locked;
    } else if (emailChanged && error.message?.includes('email_locked')) {
      delete updateData.email_locked;
    } else {
      break;
    }
    ({ data, error } = await runUpdate());
  }

  if (error) throw error;

  res.json(data);
}));

// Audit: flag students where course_purchase_count != enrollments count
app.get('/api/admin/enrollment-audit', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  // Get all students with course purchases
  const { data: students } = await supabaseDb.supabase
    .from('customers')
    .select('id, first_name, last_name, email, course_purchase_count')
    .gt('course_purchase_count', 0);

  // Get all enrollments grouped by student
  const { data: enrollments } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id, student_id, status, course_identifier, course_type, course_title, number_of_weeks')
    .not('status', 'eq', 'cancelled');

  const enrollmentsByStudent = {};
  (enrollments || []).forEach(e => {
    if (!enrollmentsByStudent[e.student_id]) enrollmentsByStudent[e.student_id] = [];
    enrollmentsByStudent[e.student_id].push(e);
  });

  const flagged = [];
  (students || []).forEach(s => {
    const studentEnrollments = enrollmentsByStudent[s.id] || [];
    const completed = studentEnrollments.filter(e => e.status === 'completed').length;
    const active = studentEnrollments.filter(e => e.status === 'active' || e.status === 'paused').length;
    const totalEnrollments = studentEnrollments.length;
    const purchaseCount = s.course_purchase_count || 0;

    if (purchaseCount !== totalEnrollments) {
      flagged.push({
        id: s.id,
        name: `${s.first_name} ${s.last_name}`,
        email: s.email,
        purchaseCount,
        enrollmentCount: totalEnrollments,
        completed,
        active,
        difference: purchaseCount - totalEnrollments,
        enrollments: studentEnrollments.map(e => ({
          id: e.id,
          identifier: e.course_identifier,
          status: e.status,
          type: e.course_type,
          title: e.course_title
        }))
      });
    }
  });

  // Also flag students with enrollments but no purchase count
  const studentIdsWithPurchases = new Set((students || []).map(s => s.id));
  const orphanedEnrollments = [];
  Object.entries(enrollmentsByStudent).forEach(([studentId, enrolls]) => {
    if (!studentIdsWithPurchases.has(parseInt(studentId))) {
      orphanedEnrollments.push({
        studentId: parseInt(studentId),
        enrollmentCount: enrolls.length,
        enrollments: enrolls.map(e => ({ id: e.id, identifier: e.course_identifier, status: e.status }))
      });
    }
  });

  res.json({
    totalStudents: (students || []).length,
    flaggedCount: flagged.length,
    flagged: flagged.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)),
    orphanedEnrollments
  });
}));

// Get classes summary (lightweight, count-only)
app.get('/api/admin/classes/summary', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [
    { count: totalClasses, error: e1 },
    { count: wtCourses, error: e2 },
    { count: hbClasses, error: e3 }
  ] = await Promise.all([
    supabaseDb.supabase
      .from('class_instances')
      .select('*', { count: 'exact', head: true })
      .gte('class_date', todayStr),
    supabaseDb.supabase
      .from('class_instances')
      .select('*', { count: 'exact', head: true })
      .ilike('class_type', 'WT%')
      .gte('class_date', todayStr),
    supabaseDb.supabase
      .from('class_instances')
      .select('*', { count: 'exact', head: true })
      .ilike('class_type', 'HB%')
      .gte('class_date', todayStr)
  ]);

  const err = e1 || e2 || e3;
  if (err) throw err;

  res.json({
    totalClasses: totalClasses || 0,
    wtCourses: wtCourses || 0,
    hbClasses: hbClasses || 0
  });
}));

// Get all classes with course identifiers for admin
app.get('/api/admin/classes', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  console.log('🔍 Fetching admin classes...');

  // Get all 2026 class instances for accurate enrollment counts
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: allClassInstances, error: classesError } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, end_time, instructor, room, max_capacity, current_enrollment, class_title, class_description, status, cancellation_reason')
    .gte('class_date', '2026-01-01')
    .order('class_date', { ascending: true });

  if (classesError) {
    console.error('❌ Error fetching classes:', classesError);
    throw classesError;
  }

  console.log(`✅ Fetched ${allClassInstances.length} class instances from database`);

  // NEW LOGIC: Classes now have identifiers stored in class_type field
  // Format: WT1801AM_DL6.1 (Type + DDMM + Time + Instructor + Weeks.Week#)
  // We need to extract the base identifier (without week number) and group accordingly

  const courseMap = new Map(); // Key: base identifier (e.g., "WT1801AM_DL6"), Value: array of classes

  allClassInstances.forEach(cls => {
    // class_type contains the full identifier like "WT1801AM_DL6.1"
    const fullIdentifier = cls.class_type;

    // Extract base identifier by removing the week number (e.g., "WT1801AM_DL6")
    // Pattern: Everything before the last period
    const lastDotIndex = fullIdentifier.lastIndexOf('.');
    const baseIdentifier = lastDotIndex > 0 ? fullIdentifier.substring(0, lastDotIndex) : fullIdentifier;

    if (!courseMap.has(baseIdentifier)) {
      courseMap.set(baseIdentifier, []);
    }

    courseMap.get(baseIdentifier).push({
      ...cls,
      courseIdentifier: fullIdentifier, // Full identifier with week number
      baseCourseIdentifier: baseIdentifier // Base identifier without week number
    });
  });

  // Convert map to courses array
  const courses = Array.from(courseMap.entries()).map(([identifier, classes]) => {
    // Sort classes by date within each course
    classes.sort((a, b) => new Date(a.class_date) - new Date(b.class_date));

    return {
      identifier: identifier, // Base identifier (e.g., "WT1801AM_DL6")
      classes: classes
    };
  });

  console.log(`📊 Grouped into ${courses.length} courses`);

  // Get booking counts for each class AND unique students per course
  // IMPORTANT: Fetch ALL bookings using pagination (default limit is 1000)
  let bookingCounts = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabaseDb.supabase
      .from('bookings')
      .select('class_instance_id, student_id, status, booking_type, is_makeup_class, course_enrollment_id')
      .in('status', ['booked', 'attended', 'completed', 'rescheduled'])
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('❌ Error fetching bookings:', error);
      throw error;
    }

    bookingCounts = bookingCounts.concat(data);
    hasMore = data.length === pageSize;
    page++;
  }

  console.log(`✅ Fetched ${bookingCounts.length} bookings`);

  // Build enrollment map to determine each booking's actual enrolled course base
  const enrollmentIds = [...new Set(bookingCounts.filter(b => b.course_enrollment_id).map(b => b.course_enrollment_id))];
  let enrollmentCourseMap = {};
  if (enrollmentIds.length > 0) {
    const { data: enrs } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, course_identifier')
      .in('id', enrollmentIds);
    (enrs || []).forEach(e => { enrollmentCourseMap[e.id] = e.course_identifier; });
  }

  // Count every student physically in the class — regular + makeup — so admins
  // can ensure there are enough wheels/seats. Rescheduled bookings still excluded.
  const bookingCountsByClass = {};
  bookingCounts.forEach(b => {
    if (b.status !== 'rescheduled') {
      if (!bookingCountsByClass[b.class_instance_id]) {
        bookingCountsByClass[b.class_instance_id] = 0;
      }
      bookingCountsByClass[b.class_instance_id]++;
    }
  });

  // Live capacity overrides, so a roster reading 11/10 arrives at the calendar
  // already explained instead of looking like a counting bug.
  const overridesByClass = {};
  const { data: liveOverrides } = await supabaseDb.supabase
    .from('capacity_overrides')
    .select('id, class_instance_id, student_id, reason, created_by, created_at, consumed_at, customers!capacity_overrides_student_id_fkey(first_name, last_name)')
    .is('revoked_at', null);
  (liveOverrides || []).forEach(o => {
    if (!overridesByClass[o.class_instance_id]) overridesByClass[o.class_instance_id] = [];
    overridesByClass[o.class_instance_id].push({
      id: o.id,
      studentId: o.student_id,
      studentName: o.customers ? `${o.customers.first_name || ''} ${o.customers.last_name || ''}`.trim() : null,
      reason: o.reason,
      grantedBy: o.created_by,
      grantedAt: o.created_at,
      used: !!o.consumed_at,
    });
  });

  // Add booking counts to classes and calculate UNIQUE students per course
  // Only count students whose enrollment matches this course's identifier (excludes makeups from other courses)
  courses.forEach(course => {
    const courseIdentifier = course.identifier;
    const uniqueStudents = new Set();
    course.classes.forEach(cls => {
      cls.bookingCount = bookingCountsByClass[cls.id] || 0;
      cls.capacityOverrides = overridesByClass[cls.id] || [];
      bookingCounts
        .filter(b => b.class_instance_id === cls.id)
        .filter(b => b.booking_type !== 'makeup' && !b.is_makeup_class)
        .filter(b => {
          const enrCourse = enrollmentCourseMap[b.course_enrollment_id];
          return !enrCourse || enrCourse === courseIdentifier;
        })
        .forEach(b => uniqueStudents.add(b.student_id));
    });
    course.totalEnrollment = uniqueStudents.size;
  });

  // Return all courses (client handles active/past filtering)
  const filteredCourses = courses;

  // Fetch all instructor unavailability dates
  const { data: unavailData } = await supabaseDb.supabase
    .from('instructor_unavailability')
    .select('instructor_id, unavailable_date, customers:instructor_id(first_name, last_name)');

  // Build a map of instructor name -> set of unavailable dates
  const instructorUnavailability = {};
  (unavailData || []).forEach(u => {
    const name = u.customers ? `${u.customers.first_name} ${u.customers.last_name}` : null;
    if (name) {
      if (!instructorUnavailability[name]) instructorUnavailability[name] = new Set();
      instructorUnavailability[name].add(u.unavailable_date?.split('T')[0]);
    }
  });

  // Mark classes that fall on instructor unavailable dates
  filteredCourses.forEach(course => {
    course.classes.forEach(cls => {
      const unavailDates = instructorUnavailability[cls.instructor];
      if (unavailDates && unavailDates.has(cls.class_date?.split(/[T ]/)[0])) {
        cls.instructorUnavailable = true;
      }
    });
  });

  console.log(`✅ Successfully fetched and processed ${allClassInstances.length} classes in ${filteredCourses.length} courses`);

  res.json({ courses: filteredCourses });
}));

app.get('/api/admin/classes/:classId/members', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { classId } = req.params;

  // Get all bookings for this class (active + rescheduled/cancelled to track absences)
  const { data: allBookings, error: bookingsError } = await supabaseDb.supabase
    .from('bookings')
    .select(`
      id,
      student_id,
      status,
      attended,
      booking_type,
      original_class_instance_id,
      course_enrollment_id,
      customers (
        id,
        first_name,
        last_name,
        email,
        course_purchase_count
      )
    `)
    .eq('class_instance_id', classId)
    .order('created_at', { ascending: true });

  if (bookingsError) {
    console.error('Error fetching bookings:', bookingsError);
    return res.status(500).json({ error: 'Failed to fetch bookings' });
  }

  // Get original class identifiers for makeup students
  // Find all unique original_class_instance_ids
  const originalClassIds = [...new Set(
    allBookings
      .filter(b => b.original_class_instance_id)
      .map(b => b.original_class_instance_id)
  )];

  // Fetch class details for original classes
  const originalClassIdentifiers = {};
  if (originalClassIds.length > 0) {
    const { data: originalClasses } = await supabaseDb.supabase
      .from('class_instances')
      .select('id, class_type, class_date')
      .in('id', originalClassIds);

    if (originalClasses) {
      originalClasses.forEach(cls => {
        originalClassIdentifiers[cls.id] = cls.class_type;
      });
    }
  }

  // For rescheduled bookings, find where they rescheduled TO
  // Get all bookings where original_class_instance_id matches current class
  const { data: rescheduledToBookings, error: rescheduledError } = await supabaseDb.supabase
    .from('bookings')
    .select(`
      id,
      student_id,
      class_instance_id,
      class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        start_time,
        end_time,
        class_type
      )
    `)
    .eq('original_class_instance_id', classId)
    .in('status', ['booked', 'completed']);

  if (rescheduledError) {
    console.error('Error fetching rescheduled bookings:', rescheduledError);
  }

  // Create a map of student_id -> rescheduled class info
  const rescheduledToMap = {};
  if (rescheduledToBookings) {
    rescheduledToBookings.forEach(booking => {
      rescheduledToMap[booking.student_id] = {
        classDate: booking.class_instances?.class_date,
        startTime: booking.class_instances?.start_time,
        endTime: booking.class_instances?.end_time,
        classType: booking.class_instances?.class_type
      };
    });
  }

  // Get current class identifier to distinguish same-course reschedules from true makeups
  const { data: currentClassInfo } = await supabaseDb.supabase
    .from('class_instances')
    .select('class_type')
    .eq('id', classId)
    .single();
  const getBase = (id) => { const i = (id || '').lastIndexOf('.'); return i > 0 ? id.substring(0, i) : id; };
  const currentCourseBase = currentClassInfo ? getBase(currentClassInfo.class_type) : '';

  // Fetch enrollment course identifiers for bookings that have enrollment IDs
  const enrollmentIds = [...new Set(allBookings.filter(b => b.course_enrollment_id).map(b => b.course_enrollment_id))];
  const enrollmentCourseMap = {};
  if (enrollmentIds.length > 0) {
    const { data: enrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, course_identifier, course_type, class_credits_allocated, class_credits_used, class_credits_remaining')
      .in('id', enrollmentIds);
    (enrollments || []).forEach(e => { enrollmentCourseMap[e.id] = e; });
  }

  // For makeup students, find which class they rescheduled from in their home course
  // Collect student IDs that are from different courses
  const makeupStudentIds = allBookings
    .filter(b => {
      const enrData = b.course_enrollment_id ? enrollmentCourseMap[b.course_enrollment_id] : null;
      const enrBase = enrData ? getBase(enrData.course_identifier) : null;
      return enrBase && enrBase !== currentCourseBase;
    })
    .map(b => b.student_id);

  // Find their rescheduled bookings to determine original class
  const rescheduledFromMap = {}; // studentId -> class_type they rescheduled from
  if (makeupStudentIds.length > 0) {
    // Get all rescheduled bookings for these students
    const { data: rescheduledBookings } = await supabaseDb.supabase
      .from('bookings')
      .select('student_id, class_instance_id, status, class_instances!bookings_class_instance_id_fkey(class_type)')
      .in('student_id', makeupStudentIds)
      .eq('status', 'rescheduled');

    if (rescheduledBookings) {
      rescheduledBookings.forEach(rb => {
        const classType = rb.class_instances?.class_type || '';
        // Find the rescheduled booking that belongs to their enrolled course
        const studentBooking = allBookings.find(b => b.student_id === rb.student_id);
        const enrData = studentBooking?.course_enrollment_id ? enrollmentCourseMap[studentBooking.course_enrollment_id] : null;
        const enrBase = enrData ? getBase(enrData.course_identifier) : null;
        if (enrBase && getBase(classType) === enrBase) {
          rescheduledFromMap[rb.student_id] = classType;
        }
      });
    }
  }

  // Separate active members from absent members
  const activeMembers = [];
  const absentMembers = [];

  allBookings.forEach(booking => {
    const member = {
      id: booking.id,
      bookingId: booking.id,
      studentId: booking.student_id,
      firstName: booking.customers?.first_name,
      lastName: booking.customers?.last_name,
      email: booking.customers?.email,
      returningCount: booking.customers?.course_purchase_count || 0,
      status: booking.status,
      attended: booking.attended,
      courseEnrollmentId: booking.course_enrollment_id,
    };

    // Determine if this is a makeup student
    // If the student's enrollment is for the SAME course as this class, they're enrolled (not makeup)
    // even if they rescheduled away and back
    const enrollmentData = booking.course_enrollment_id ? enrollmentCourseMap[booking.course_enrollment_id] : null;
    const enrollmentCourse = enrollmentData?.course_identifier || null;
    const enrollmentBase = enrollmentCourse ? getBase(enrollmentCourse) : null;

    // Add HB credit info if this is a handbuilding enrollment
    if (enrollmentData && (enrollmentData.course_type || '').toLowerCase().includes('handbuilding')) {
      member.creditsAllocated = enrollmentData.class_credits_allocated || 0;
      member.creditsUsed = enrollmentData.class_credits_used || 0;
    }
    const isOwnCourse = enrollmentBase && enrollmentBase === currentCourseBase;

    if (!isOwnCourse && enrollmentBase) {
      // Student's enrollment is for a different course — they're a makeup
      // Show the specific class they rescheduled from (e.g. WT2104NT_JL6.1)
      member.isMakeup = true;
      // Priority: 1) original_class_instance_id if it's from their enrolled course
      //           2) rescheduled booking found in their home course
      //           3) enrollment course base
      const origFullId = booking.original_class_instance_id ? (originalClassIdentifiers[booking.original_class_instance_id] || '') : '';
      const origBase = getBase(origFullId);
      if (origBase === enrollmentBase) {
        member.originalClassIdentifier = origFullId; // e.g. WT2104NT_JL6.1
      } else {
        member.originalClassIdentifier = rescheduledFromMap[booking.student_id] || enrollmentBase;
      }
    } else if (!enrollmentBase && !isOwnCourse && (booking.booking_type === 'makeup' || booking.is_makeup_class)) {
      // No enrollment linked but booking is explicitly marked as makeup (e.g. 10-class package flex bookings)
      member.isMakeup = true;
      member.originalClassIdentifier = booking.original_class_instance_id ? (originalClassIdentifiers[booking.original_class_instance_id] || '') : '';
    }

    // Active members: status is 'booked', 'attended', or 'completed'
    if (booking.status === 'booked' || booking.status === 'attended' || booking.status === 'completed') {
      activeMembers.push(member);
    }
    // Absent members: rescheduled, absent (cross-course WT reschedule), or marked as not attended
    // Skip cancelled bookings from students not enrolled in this course (e.g. cancelled makeups)
    else if (booking.status === 'rescheduled' || booking.status === 'absent' || booking.attended === false) {
      // If rescheduled, add the new class info
      if (booking.status === 'rescheduled' && rescheduledToMap[booking.student_id]) {
        member.rescheduledTo = rescheduledToMap[booking.student_id];
      }
      absentMembers.push(member);
    }
    else if (booking.status === 'cancelled') {
      // Only show cancelled bookings if the student has other active bookings in this course
      const hasActiveBookingInCourse = allBookings.some(
        b => b.student_id === booking.student_id && b.id !== booking.id &&
             (b.status === 'booked' || b.status === 'attended' || b.status === 'completed')
      );
      if (hasActiveBookingInCourse) {
        absentMembers.push(member);
      }
    }
  });

  // Sort active members by returning count (descending), then alphabetically
  activeMembers.sort((a, b) => {
    if (b.returningCount !== a.returningCount) {
      return b.returningCount - a.returningCount;
    }
    const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
    const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Sort absent members alphabetically
  absentMembers.sort((a, b) => {
    const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
    const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Fetch waitlist entries for this class
  const { data: waitlistData } = await supabaseDb.supabase
    .from('waitlist')
    .select(`
      id,
      student_id,
      position,
      joined_at,
      customers!waitlist_student_id_fkey (
        id, first_name, last_name, email, course_purchase_count
      )
    `)
    .eq('class_instance_id', classId)
    .eq('claimed', false)
    .order('position', { ascending: true });

  const waitlistMembers = (waitlistData || []).map(w => ({
    id: `wl-${w.id}`,
    waitlistId: w.id,
    studentId: w.student_id,
    firstName: w.customers?.first_name,
    lastName: w.customers?.last_name,
    email: w.customers?.email,
    returningCount: w.customers?.course_purchase_count || 0,
    status: 'waitlisted',
    position: w.position,
  }));

  res.json({
    members: activeMembers,
    count: activeMembers.length,
    absentMembers: absentMembers,
    absentCount: absentMembers.length,
    waitlistMembers,
    waitlistCount: waitlistMembers.length
  });
}));

// Add student to class
app.post('/api/admin/classes/:classId/add-student', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { studentId } = req.body;

  if (!studentId) {
    return res.status(400).json({ error: 'Missing required field: studentId' });
  }

  // Check if class exists and get capacity info
  const { data: classInstance, error: classError } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, max_capacity')
    .eq('id', classId)
    .single();

  if (classError || !classInstance) {
    return res.status(404).json({ error: 'Class not found' });
  }

  // Check if student exists
  const { data: student, error: studentError } = await supabaseDb.supabase
    .from('customers')
    .select('id')
    .eq('id', studentId)
    .single();

  if (studentError || !student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  // Check if student is already enrolled in this class
  const { data: existingBooking, error: checkError } = await supabaseDb.supabase
    .from('bookings')
    .select('id')
    .eq('class_instance_id', classId)
    .eq('student_id', studentId)
    .eq('status', 'booked')
    .maybeSingle();

  if (checkError) {
    console.error('Error checking existing booking:', checkError);
    return res.status(500).json({ error: 'Failed to check enrollment status' });
  }

  if (existingBooking) {
    return res.status(400).json({ error: 'Student is already enrolled in this class' });
  }

  // Get class details to find the course and all its weeks
  const { data: thisClass } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, end_time, instructor, max_capacity')
    .eq('id', classId)
    .single();

  // Both gates: the instance's own cap, and the studio-wide wheel count across
  // every cohort sharing this timeslot. An admin-granted capacity override for
  // this exact student is the only way past either.
  const seat = await supabaseDb.checkSeatAvailability(thisClass || classInstance, parseInt(studentId), { checkWheels: true });
  if (!seat.allowed) {
    return res.status(400).json({
      error: seat.reason === 'STUDIO_FULL'
        ? `Studio is full — all ${supabaseDb.STUDIO_WHEELS} wheels are booked for this timeslot`
        : 'Class is full'
    });
  }

  // Extract base course identifier (e.g. "WT2802AM_DL6" from "WT2802AM_DL6.2")
  const fullId = thisClass?.class_type || '';
  const lastDot = fullId.lastIndexOf('.');
  const baseCourseId = lastDot > 0 ? fullId.substring(0, lastDot) : fullId;

  // Check if student already has a course_enrollment for this course
  const { data: existingEnrollment } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('course_identifier', baseCourseId)
    .eq('status', 'active')
    .maybeSingle();

  let enrollmentId = existingEnrollment?.id || null;

  // If no enrollment exists, create one (marked as manual) so sync won't overwrite
  if (!enrollmentId) {
    // Copy details from an existing enrollment in the same course, or build from class data
    const { data: refEnrollment } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('course_title, course_variant_title, course_type, schedule_pattern, number_of_weeks, course_start_date, course_end_date, class_time, instructor')
      .eq('course_identifier', baseCourseId)
      .limit(1)
      .maybeSingle();

    const now = new Date().toISOString();
    const { data: newEnrollment, error: enrollError } = await supabaseDb.supabase
      .from('course_enrollments')
      .insert({
        student_id: studentId,
        shopify_order_id: 'MANUAL',
        shopify_line_item_id: `MANUAL-${Date.now()}`,
        course_title: refEnrollment?.course_title || 'Manual Enrollment',
        course_variant_title: refEnrollment?.course_variant_title || '',
        course_type: refEnrollment?.course_type || 'Wheelthrowing Beginner',
        schedule_pattern: refEnrollment?.schedule_pattern || '',
        number_of_weeks: refEnrollment?.number_of_weeks || 6,
        course_start_date: refEnrollment?.course_start_date || thisClass?.class_date,
        course_end_date: refEnrollment?.course_end_date || null,
        class_time: refEnrollment?.class_time || thisClass?.start_time,
        instructor: refEnrollment?.instructor || thisClass?.instructor,
        status: 'active',
        course_identifier: baseCourseId,
        bookings_created_at: now,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    if (enrollError) {
      console.error('Error creating enrollment:', enrollError);
      // Continue anyway — booking without enrollment is still useful
    } else {
      enrollmentId = newEnrollment.id;
      console.log(`✅ Created manual course_enrollment ${enrollmentId} for student ${studentId} in ${baseCourseId}`);
    }
  }

  // Find all class instances for this course and create bookings for unbooked weeks
  const { data: courseClasses } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, class_type, class_date')
    .like('class_type', `${baseCourseId}.%`)
    .order('class_date', { ascending: true });

  const classIds = (courseClasses || []).map(c => c.id);

  // Get existing bookings for this student in this course
  const { data: existingBookings } = await supabaseDb.supabase
    .from('bookings')
    .select('class_instance_id')
    .eq('student_id', studentId)
    .in('class_instance_id', classIds.length > 0 ? classIds : [0])
    .in('status', ['booked', 'attended', 'completed']);

  const alreadyBookedIds = new Set((existingBookings || []).map(b => b.class_instance_id));

  // Create bookings for all unbooked weeks
  const newBookings = [];
  for (const cls of (courseClasses || [])) {
    if (alreadyBookedIds.has(cls.id)) continue;
    const { data: booking, error: bookErr } = await supabaseDb.supabase
      .from('bookings')
      .insert({
        student_id: studentId,
        class_instance_id: cls.id,
        status: 'booked',
        course_enrollment_id: enrollmentId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    if (!bookErr && booking) {
      newBookings.push(booking);
      await supabaseDb.updateClassEnrollment(cls.id, 1);
    }
  }

  // Also link the enrollment to any pre-existing bookings that had null course_enrollment_id
  if (enrollmentId && alreadyBookedIds.size > 0) {
    await supabaseDb.supabase
      .from('bookings')
      .update({ course_enrollment_id: enrollmentId, updated_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .in('class_instance_id', [...alreadyBookedIds])
      .is('course_enrollment_id', null);
  }

  // Spend the grant if the seat in the requested class only existed because of one.
  if (seat.override) {
    const seatedBooking = newBookings.find(b => b.class_instance_id === parseInt(classId));
    await supabaseDb.consumeCapacityOverride(seat.override.id, seatedBooking?.id);
    console.log(`⚠️  Capacity override ${seat.override.id} used: student ${studentId} added over cap to class ${classId} — ${seat.override.reason}`);
  }

  console.log(`✅ Added student ${studentId} to ${baseCourseId}: ${newBookings.length} new bookings, ${alreadyBookedIds.size} existing`);

  // Sync all affected class instances to Google Calendar
  try {
    const calendarSync = require('../utils/calendarSync');
    const classIds = [...new Set(newBookings.map(b => b.class_instance_id))];
    classIds.forEach(id => calendarSync.syncClassInstance(id).catch(() => {}));
  } catch (e) { /* ignore */ }

  res.json({ message: `Student added to all ${newBookings.length + alreadyBookedIds.size} weeks of ${baseCourseId}`, bookings: newBookings });
}));

// ── Capacity overrides ───────────────────────────────────────────────────────
// A grant lets ONE named student take ONE seat beyond both the class cap and
// the studio wheel cap, in ONE class instance. Deliberately not a raised limit:
// nobody else can claim the seat, it does not carry to next week's instance, and
// the reason survives in the table so a roster reading 11/10 stays explained.

// Grant an override
app.post('/api/admin/classes/:classId/capacity-override', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { studentId, reason } = req.body;

  if (!studentId) return res.status(400).json({ error: 'studentId is required' });
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: 'A reason is required — an unexplained override is the thing this table exists to prevent' });
  }

  const { data: classInstance } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, max_capacity')
    .eq('id', classId)
    .single();
  if (!classInstance) return res.status(404).json({ error: 'Class not found' });

  const { data: student } = await supabaseDb.supabase
    .from('customers')
    .select('id, first_name, last_name')
    .eq('id', studentId)
    .single();
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const { data, error } = await supabaseDb.supabase
    .from('capacity_overrides')
    .insert({
      class_instance_id: parseInt(classId),
      student_id: parseInt(studentId),
      reason: String(reason).trim(),
      created_by: req.user.email || 'admin',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'This student already has a live override for this class' });
    }
    throw error;
  }

  console.log(`⚠️  Capacity override ${data.id} granted by ${req.user.email}: ${student.first_name} ${student.last_name} may exceed cap in ${classInstance.class_type} (${classInstance.class_date}) — ${data.reason}`);
  res.json({ message: 'Override granted', override: data });
}));

// List overrides on a class
app.get('/api/admin/classes/:classId/capacity-overrides', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const overrides = await supabaseDb.getInstanceCapacityOverrides(parseInt(req.params.classId));
  res.json({ overrides });
}));

// Withdraw an unused override. Consumed ones stay — they are the audit trail.
app.delete('/api/admin/capacity-overrides/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { data: existing } = await supabaseDb.supabase
    .from('capacity_overrides')
    .select('id, consumed_at')
    .eq('id', req.params.id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Override not found' });
  if (existing.consumed_at) {
    return res.status(400).json({ error: 'This override has already been used — remove the booking instead' });
  }

  const { error } = await supabaseDb.supabase
    .from('capacity_overrides')
    .update({ revoked_at: new Date().toISOString(), revoked_by: req.user.email || 'admin' })
    .eq('id', req.params.id);
  if (error) throw error;

  res.json({ message: 'Override withdrawn' });
}));

// Remove student from class (cancel booking)
app.delete('/api/admin/bookings/:bookingId', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  // Check if booking exists
  const { data: booking, error: fetchError } = await supabaseDb.supabase
    .from('bookings')
    .select('id, status, course_enrollment_id, class_instance_id')
    .eq('id', bookingId)
    .single();

  if (fetchError || !booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const affectedClassId = booking.class_instance_id;
  const syncCalendar = () => {
    try {
      const calendarSync = require('../utils/calendarSync');
      calendarSync.syncClassInstance(affectedClassId).catch(() => {});
    } catch (e) { /* ignore */ }
  };

  // If booking is already cancelled or rescheduled, delete it entirely from the database
  // This allows admins to clean up the absent/rescheduled list
  if (booking.status === 'cancelled' || booking.status === 'rescheduled') {
    const { error: deleteError } = await supabaseDb.supabase
      .from('bookings')
      .delete()
      .eq('id', bookingId);

    if (deleteError) {
      console.error('Error deleting booking:', deleteError);
      return res.status(500).json({ error: 'Failed to delete booking' });
    }

    syncCalendar();
    return res.json({ message: 'Booking deleted successfully' });
  }

  // For active bookings (booked/completed), just set status to cancelled
  const { error: updateError } = await supabaseDb.supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId);

  if (updateError) {
    console.error('Error cancelling booking:', updateError);
    return res.status(500).json({ error: 'Failed to cancel booking' });
  }

  // Credits are computed on read — cancelling a booking automatically frees the credit
  // No counter updates needed.

  // Auto-promote from waitlist if someone is waiting
  let promotedStudent = null;
  try {
    const { data: nextWaitlist } = await supabaseDb.supabase
      .from('waitlist')
      .select('id, student_id, position, customers!waitlist_student_id_fkey(id, first_name, last_name, email)')
      .eq('class_instance_id', affectedClassId)
      .eq('claimed', false)
      .is('spot_offered_at', null)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextWaitlist) {
      // Get class details for the email
      const { data: classInfo } = await supabaseDb.supabase
        .from('class_instances')
        .select('id, class_type, class_date, start_time, end_time, instructor')
        .eq('id', affectedClassId)
        .single();

      // Create a booking for the waitlisted student
      const { error: bookErr } = await supabaseDb.supabase
        .from('bookings')
        .insert({
          student_id: nextWaitlist.student_id,
          class_instance_id: affectedClassId,
          status: 'booked',
          booking_type: 'makeup',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (!bookErr) {
        // Mark waitlist entry as claimed
        await supabaseDb.supabase
          .from('waitlist')
          .update({
            claimed: true,
            claimed_at: new Date().toISOString(),
            spot_offered_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', nextWaitlist.id);

        promotedStudent = nextWaitlist.customers;

        // Send confirmation email
        if (promotedStudent?.email && classInfo) {
          const { sendEmail } = require('../utils/emailService');
          const { wrapEmailTemplate } = require('../email-templates/base');
          const classDate = new Date(classInfo.class_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          const ct = classInfo.class_type || '';
          const weekMatch = ct.match(/_\w+(\d)\./);
          const courseTitle = ct.startsWith('HB') ? 'Handbuilding'
            : (weekMatch && weekMatch[1] === '7') ? 'Wheelthrowing Intermediate 7 Weeks'
            : 'Wheelthrowing Beginners/Ext 6 Weeks';

          const body = `
            <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
              You're in! Class confirmed
            </h1>
            <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
              Hi ${promotedStudent.first_name}, great news — a spot has opened up and you've been confirmed for your class!
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
              <tr>
                <td style="padding: 16px 20px;">
                  <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Class Details</p>
                  <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: #282828;">${courseTitle}</p>
                  <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${classDate}</p>
                  <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${classInfo.start_time} – ${classInfo.end_time}</p>
                  <p style="margin: 0; font-size: 15px; color: #282828;">Instructor: ${classInfo.instructor}</p>
                </td>
              </tr>
            </table>
            <p style="margin: 0 0 4px; font-size: 14px; line-height: 1.5; color: #282828;">
              <strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268
              (<a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Map</a>)
            </p>
            <p style="margin: 0 0 20px; font-size: 13px; line-height: 1.5; color: #888888;">
              Nearest MRT: Holland Village &middot; No on-site parking
            </p>
            <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #282828;">
              We look forward to seeing you at the studio!
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 0;">
              <tr>
                <td align="center">
                  <a href="https://club.ves.sg/classes" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                    View My Classes
                  </a>
                </td>
              </tr>
            </table>`;

          await sendEmail({
            to: promotedStudent.email,
            subject: `VES — You're in! Class confirmed — ${classDate}`,
            html: wrapEmailTemplate(body),
          });
          console.log(`[Waitlist] Auto-promoted ${promotedStudent.first_name} ${promotedStudent.last_name} into class ${classInfo.class_type}`);
        }
      }
    }
  } catch (waitlistErr) {
    console.error('[Waitlist] Auto-promote error:', waitlistErr);
    // Don't fail the cancellation if waitlist promotion fails
  }

  syncCalendar();
  res.json({
    message: promotedStudent
      ? `Student removed. ${promotedStudent.first_name} ${promotedStudent.last_name} promoted from waitlist and emailed.`
      : 'Student removed successfully',
    promotedFromWaitlist: promotedStudent ? `${promotedStudent.first_name} ${promotedStudent.last_name}` : null
  });
}));

// Convert a booking to a class credit (cancel booking, restore credit to enrollment)
app.post('/api/admin/bookings/:bookingId/convert-to-credit', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { supabase } = supabaseDb;

  // Get the booking
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, student_id, class_instance_id, status, course_enrollment_id')
    .eq('id', bookingId)
    .single();

  if (bookingErr || !booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  if (booking.status !== 'booked') {
    return res.status(400).json({ error: `Cannot convert a ${booking.status} booking` });
  }
  if (!booking.course_enrollment_id) {
    return res.status(400).json({ error: 'Booking has no associated enrollment' });
  }

  // Get the enrollment
  const { data: enrollment } = await supabase
    .from('course_enrollments')
    .select('id, class_credits_allocated, class_credits_used, class_credits_remaining, number_of_weeks')
    .eq('id', booking.course_enrollment_id)
    .single();

  if (!enrollment) {
    return res.status(400).json({ error: 'Enrollment not found' });
  }

  // Count what the enrollment is committed to BEFORE the conversion — this is the floor for
  // the total allocation, so turning a booking into a credit can never shrink the course.
  const { count: committedBefore } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('course_enrollment_id', enrollment.id)
    .in('status', ['attended', 'completed', 'booked']);

  // Cancel the booking
  await supabase
    .from('bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', bookingId);

  // Decrement class enrollment count
  await supabaseDb.updateClassEnrollment(booking.class_instance_id, -1);

  // Allocation is the one figure the ledger cannot derive, so it is still set
  // explicitly — and only ever upward, so converting a booking to a credit can
  // never shrink the course.
  const newAllocated = supabaseDb.resolveCreditAllocation({
    allocated: enrollment.class_credits_allocated,
    numberOfWeeks: enrollment.number_of_weeks,
    committedBefore: committedBefore || 0
  });
  await supabase
    .from('course_enrollments')
    .update({
      class_credits_allocated: newAllocated,
      updated_at: new Date().toISOString()
    })
    .eq('id', enrollment.id);

  // Used/remaining follow from the ledger — the booking is 'cancelled' above,
  // which returns its credit.
  const credits = await supabaseDb.syncStoredCredits(enrollment.id);

  console.log(`🔄 Converted booking ${bookingId} to class credit for enrollment ${enrollment.id}`);

  res.json({
    success: true,
    message: 'Booking converted to class credit',
    creditsRemaining: credits ? credits.remaining : null
  });
}));

// Return a forfeited (no-show) class credit on appeal.
//
// Policy, confirmed by Justin 09/08/26: a no-show burns the class, but an admin
// may return it if the student writes in with a proper explanation.
//
// Deliberately NOT folded into convert-to-credit above. That endpoint writes
// class_credits_allocated (a destructive override — a small value there clobbers
// the number_of_weeks fallback and shrinks the whole course) and decrements the
// class instance's enrolment count. Both are wrong here: the class is in the
// past, the seat was genuinely occupied, and un-forfeiting only ever REMOVES a
// consuming booking, so the allocation floor can never be breached.
app.post('/api/admin/bookings/:bookingId/unforfeit', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { reason } = req.body || {};
  const { supabase } = supabaseDb;

  const trimmedReason = (reason || '').trim();
  if (!trimmedReason) {
    return res.status(400).json({ error: 'A reason is required to return a forfeited credit' });
  }
  if (trimmedReason.length > 500) {
    return res.status(400).json({ error: 'Reason must be 500 characters or fewer' });
  }

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, student_id, class_instance_id, status, course_enrollment_id')
    .eq('id', bookingId)
    .single();

  if (bookingErr || !booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  if (!['forfeited', 'absent'].includes(booking.status)) {
    return res.status(400).json({ error: `Only a forfeited or absent booking can be un-forfeited (this one is ${booking.status})` });
  }

  // 'cancelled' is the existing convention for "this booking returns its credit"
  // — see CREDIT_CONSUMING_STATUSES in bookingDb.js, which excludes it. No new
  // status is invented. attended is cleared because the reversal withdraws the
  // no-show finding; the class was never attended either way.
  const { error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      attended: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId);

  if (updateErr) {
    console.error('Error un-forfeiting booking:', updateErr);
    return res.status(500).json({ error: 'Failed to un-forfeit booking' });
  }

  // The counter of record for the student's no-shows.
  await supabaseDb.decrementClassesForfeited(booking.student_id);

  // Bring the stored cache along with the ledger. The ledger is authoritative
  // for the number, but the stored columns are read directly in plenty of
  // display paths, so leaving them behind would show the student a stale total.
  // class_credits_allocated is left alone on purpose — inflating it is exactly
  // what tangled Ryan Ling's record.
  //
  // A closed block is also re-opened. Returning a credit to a block still
  // marked closed would be a no-op: the eligibility gate skips closed
  // enrollments before consulting the ledger, so the credit would be visible
  // and unbookable — the very failure this action exists to fix.
  let credits = null;
  if (booking.course_enrollment_id) {
    const { data: enrollment } = await supabase
      .from('course_enrollments')
      .select('id, class_credits_used, class_credits_remaining, credits_closed_at, credits_closed_reason')
      .eq('id', booking.course_enrollment_id)
      .single();

    // Re-open first: syncStoredCredits writes 0 for a closed block, so lifting
    // the closure has to happen before the cache is recomputed or the returned
    // credit would be zeroed straight back out.
    if (enrollment && enrollment.credits_closed_at) {
      await supabase
        .from('course_enrollments')
        .update({
          credits_closed_at: null,
          credits_closed_reason: `Re-opened ${new Date().toISOString().split('T')[0]} by ${req.user.email || 'admin'}: a forfeited class was returned on appeal (booking ${booking.id}). Previously: ${enrollment.credits_closed_reason || 'no reason recorded'}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', enrollment.id);
    }

    credits = await supabaseDb.syncStoredCredits(booking.course_enrollment_id);
  }

  // Audit trail. A hand-moved class credit is never silent — the 09/08/26 review
  // found three such adjustments whose only record was a Gmail thread.
  const { error: auditErr } = await supabase
    .from('booking_credit_adjustments')
    .insert({
      booking_id: booking.id,
      student_id: booking.student_id,
      course_enrollment_id: booking.course_enrollment_id,
      action: 'unforfeit',
      previous_status: booking.status,
      new_status: 'cancelled',
      reason: trimmedReason,
      admin_id: req.user.dbCustomerId || null,
      admin_email: req.user.email || null,
    });

  if (auditErr) console.error('Error writing credit adjustment audit row:', auditErr);

  console.log(`↩️  Un-forfeited booking ${booking.id} for student ${booking.student_id} — ${trimmedReason}`);

  res.json({
    success: true,
    message: 'Credit returned. The booking is now cancelled and the class is available again.',
    creditsRemaining: credits ? credits.remaining : null,
  });
}));

// Close an enrollment's credit block — "this student is done, stop offering the
// remaining classes".
//
// Replaces the old way of expressing that, which was to force
// class_credits_used = class_credits_allocated through set-credits. That worked
// only because a stored zero used to mean "closed", it recorded no reason, and
// it left the counter permanently disagreeing with the bookings ledger. Closure
// is a fact now, so it gets stored as one.
app.post('/api/admin/enrollments/:enrollmentId/close-credits', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;
  const { reason } = req.body || {};
  const { supabase } = supabaseDb;

  const trimmedReason = (reason || '').trim();
  if (!trimmedReason) {
    return res.status(400).json({ error: 'A reason is required to close a credit block' });
  }
  if (trimmedReason.length > 500) {
    return res.status(400).json({ error: 'Reason must be 500 characters or fewer' });
  }

  const { data: enrollment, error: fetchErr } = await supabase
    .from('course_enrollments')
    .select('id, student_id, credits_closed_at')
    .eq('id', enrollmentId)
    .single();

  if (fetchErr || !enrollment) {
    return res.status(404).json({ error: 'Enrollment not found' });
  }
  if (enrollment.credits_closed_at) {
    return res.status(400).json({ error: 'This credit block is already closed' });
  }

  const credits = await supabaseDb.getEnrollmentCredits(enrollment.id);

  await supabase
    .from('course_enrollments')
    .update({
      credits_closed_at: new Date().toISOString(),
      credits_closed_reason: `${trimmedReason} — closed by ${req.user.email || 'admin'}, ${credits.remaining} class(es) written off`,
      class_credits_remaining: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollment.id);

  console.log(`🔒 Closed credit block for enrollment ${enrollment.id} (${credits.remaining} written off) — ${trimmedReason}`);

  res.json({
    success: true,
    message: `Credit block closed. ${credits.remaining} class(es) written off.`,
    writtenOff: credits.remaining,
  });
}));

// Credit adjustments made by hand on this student's bookings (audit trail).
app.get('/api/admin/students/:studentId/credit-adjustments', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const { data, error } = await supabaseDb.supabase
    .from('booking_credit_adjustments')
    .select('id, booking_id, course_enrollment_id, action, previous_status, new_status, reason, admin_email, created_at')
    .eq('student_id', parseInt(studentId))
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  res.json({ adjustments: data || [] });
}));

// Toggle booking type between regular and makeup
app.patch('/api/admin/bookings/:bookingId/makeup', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  // Check if booking exists
  const { data: booking, error: fetchError } = await supabaseDb.supabase
    .from('bookings')
    .select('id, booking_type')
    .eq('id', bookingId)
    .single();

  if (fetchError || !booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  // Toggle booking type
  const newBookingType = booking.booking_type === 'makeup' ? 'regular' : 'makeup';

  const { error: updateError } = await supabaseDb.supabase
    .from('bookings')
    .update({
      booking_type: newBookingType,
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId);

  if (updateError) {
    console.error('Error toggling booking type:', updateError);
    return res.status(500).json({ error: 'Failed to toggle booking type' });
  }

  res.json({
    message: `Booking marked as ${newBookingType}`,
    bookingType: newBookingType
  });
}));

// Set booking type (enrolled/makeup) explicitly, with optional original course identifier
app.put('/api/admin/bookings/:bookingId/type', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { bookingType, originalCourseIdentifier } = req.body; // 'enrolled' or 'makeup'

  const dbType = bookingType === 'makeup' ? 'makeup' : 'regular';

  // If makeup with a course identifier, look up the class_instance_id for that identifier
  let originalClassInstanceId = null;
  if (dbType === 'makeup' && originalCourseIdentifier) {
    const { data: matchingClass } = await supabaseDb.supabase
      .from('class_instances')
      .select('id')
      .like('class_type', `${originalCourseIdentifier}%`)
      .limit(1);
    if (matchingClass && matchingClass.length > 0) {
      originalClassInstanceId = matchingClass[0].id;
    }
  }

  const updateData = {
    booking_type: dbType,
    updated_at: new Date().toISOString()
  };
  if (dbType === 'regular') {
    updateData.original_class_instance_id = null;
  } else if (originalClassInstanceId) {
    updateData.original_class_instance_id = originalClassInstanceId;
  }

  const { error } = await supabaseDb.supabase
    .from('bookings')
    .update(updateData)
    .eq('id', bookingId);

  if (error) {
    console.error('Error updating booking type:', error);
    return res.status(500).json({ error: 'Failed to update booking type' });
  }

  res.json({ message: `Booking set to ${bookingType}`, bookingType: dbType });
}));

// Toggle booking attended status (admin only)
app.put('/api/admin/bookings/:bookingId/attended', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { status } = req.body; // 'attended' or 'booked'

  const updateData = {
    status: status,
    attended: status === 'attended' ? true : null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabaseDb.supabase
    .from('bookings')
    .update(updateData)
    .eq('id', bookingId);

  if (error) {
    console.error('Error updating attended status:', error);
    return res.status(500).json({ error: 'Failed to update attended status' });
  }

  res.json({ message: `Booking marked as ${status}`, status });
}));

// Create a booking for a student (admin only)
app.post('/api/admin/bookings', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { studentId, classInstanceId, bookingType, status, courseEnrollmentId } = req.body;

  if (!studentId || !classInstanceId) {
    return res.status(400).json({ error: 'Student ID and class instance ID are required' });
  }

  // Get class instance details
  const { data: classInstance, error: classError } = await supabaseDb.supabase
    .from('class_instances')
    .select('*')
    .eq('id', classInstanceId)
    .single();

  if (classError || !classInstance) {
    return res.status(404).json({ error: 'Class instance not found' });
  }

  // Charge the booking to an enrollment. Resolved centrally so this agrees with
  // the student-facing path — an unlinked booking is invisible to the ledger and
  // silently consumes no credit. The old lookup here keyed on the stored
  // class_credits_remaining column, which drifts, and could not recognise the
  // student's own cohort.
  let enrollmentId = courseEnrollmentId || null;
  if (!enrollmentId) {
    enrollmentId = await supabaseDb.resolveBookingEnrollment(studentId, classInstance);
  }

  // Check if class is full. This previously read classInstance.current_capacity,
  // a column that does not exist — so the gate never fired and this path could
  // seat an 11th student silently. Now it counts booked rows like every other
  // path, and an admin-granted capacity override is the only way past.
  const seat = await supabaseDb.checkSeatAvailability(classInstance, parseInt(studentId), { checkWheels: true });
  if (!seat.allowed) {
    return res.status(400).json({
      error: seat.reason === 'STUDIO_FULL'
        ? `Studio is full — all ${supabaseDb.STUDIO_WHEELS} wheels are booked for this timeslot`
        : 'Class is full'
    });
  }

  // Check for existing cancelled booking — reactivate instead of creating duplicate
  const { data: existingBooking } = await supabaseDb.supabase
    .from('bookings')
    .select('id, status')
    .eq('student_id', studentId)
    .eq('class_instance_id', classInstanceId)
    .single();

  let booking;
  if (existingBooking && existingBooking.status === 'cancelled') {
    // Reactivate the cancelled booking
    const { data: reactivated, error: reactError } = await supabaseDb.supabase
      .from('bookings')
      .update({ status: status || 'booked', booking_type: bookingType || 'regular', course_enrollment_id: enrollmentId, updated_at: new Date().toISOString() })
      .eq('id', existingBooking.id)
      .select()
      .single();
    if (reactError) {
      console.error('Error reactivating booking:', reactError);
      return res.status(500).json({ error: reactError.message || 'Failed to reactivate booking' });
    }
    booking = reactivated;
  } else if (existingBooking) {
    return res.status(409).json({ error: 'Student is already booked for this class.' });
  } else {
    // Create new booking
    const { data: newBooking, error: bookingError } = await supabaseDb.supabase
      .from('bookings')
      .insert([{
        student_id: studentId,
        class_instance_id: classInstanceId,
        booking_type: bookingType || 'regular',
        status: status || 'booked',
        course_enrollment_id: enrollmentId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (bookingError) {
      console.error('Error creating booking:', bookingError);
      return res.status(500).json({ error: bookingError.message || 'Failed to create booking' });
    }
    booking = newBooking;
  }

  // Update class enrollment count
  await supabaseDb.updateClassEnrollment(parseInt(classInstanceId), 1);

  // Spend the grant if this seat only existed because of one.
  if (seat.override) {
    await supabaseDb.consumeCapacityOverride(seat.override.id, booking?.id);
    console.log(`⚠️  Capacity override ${seat.override.id} used: student ${studentId} booked over cap into class ${classInstanceId} — ${seat.override.reason}`);
  }

  // Decrement flex credits if the enrollment is tracking them. This covers
  // both HB credit enrollments and 10-class WT packages (both set
  // class_credits_allocated once credits are live).
  if (enrollmentId) {
    const { data: enr } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('course_type, class_credits_allocated')
      .eq('id', enrollmentId)
      .single();

    // The booking exists now, so the cache is derived rather than adjusted.
    if (enr && (enr.class_credits_allocated || 0) > 0) {
      await supabaseDb.syncStoredCredits(enrollmentId);
    }
  }

  res.json({
    message: 'Booking created successfully',
    booking
  });
}));

// Update class instance (date, time, instructor)
app.patch('/api/admin/classes/:classId', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { classDate, startTime, endTime, instructor, maxCapacity, classTitle, classDescription } = req.body;

  // Get the current class instance
  const { data: classInstance, error: fetchError } = await supabaseDb.supabase
    .from('class_instances')
    .select('*')
    .eq('id', classId)
    .single();

  if (fetchError || !classInstance) {
    return res.status(404).json({ error: 'Class not found' });
  }

  // Prepare update object
  const updates = {
    updated_at: new Date().toISOString()
  };

  if (classDate) updates.class_date = classDate;
  if (startTime) updates.start_time = startTime;
  if (endTime) updates.end_time = endTime;
  if (instructor) updates.instructor = instructor;
  if (maxCapacity !== undefined) updates.max_capacity = maxCapacity;
  if (classTitle !== undefined) updates.class_title = classTitle;
  if (classDescription !== undefined) updates.class_description = classDescription;
  if (req.body.status) updates.status = req.body.status;
  if (req.body.cancellation_reason !== undefined) updates.cancellation_reason = req.body.cancellation_reason;

  // WARNING: If date/time changes, the class_type identifier will be out of sync
  // The identifier format is: WT[DDMM][TIME]_[INSTRUCTOR][WEEKS].[WEEK#]
  // For now, we'll just update the fields and accept the identifier mismatch
  // TODO: Consider updating class_type identifier when date/time/instructor changes

  // Update the class instance
  const { error: updateError } = await supabaseDb.supabase
    .from('class_instances')
    .update(updates)
    .eq('id', classId);

  if (updateError) {
    console.error('Error updating class:', updateError);
    return res.status(500).json({ error: 'Failed to update class' });
  }

  // Sync to Google Calendar
  try {
    const calendarSync = require('../utils/calendarSync');
    calendarSync.syncClassInstance(parseInt(classId)).catch(() => {});
  } catch (e) { /* ignore */ }

  res.json({ message: 'Class updated successfully' });
}));

// Postpone course classes from a given class onwards
app.post('/api/admin/courses/:courseIdentifier/postpone', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { courseIdentifier } = req.params;
  const { fromClassId, weeks = 1 } = req.body;

  if (!fromClassId) {
    return res.status(400).json({ error: 'fromClassId is required' });
  }

  // 1. Find ALL class_instances for this course
  const { data: allClasses, error: fetchError } = await supabaseDb.supabase
    .from('class_instances')
    .select('*')
    .like('class_type', `${courseIdentifier}.%`);

  if (fetchError) {
    console.error('Error fetching class instances:', fetchError);
    return res.status(500).json({ error: 'Failed to fetch class instances' });
  }

  if (!allClasses || allClasses.length === 0) {
    return res.status(404).json({ error: 'No class instances found for this course' });
  }

  // 2. Get the class_date of the fromClassId class instance
  const fromClass = allClasses.find(c => c.id === fromClassId);
  if (!fromClass) {
    return res.status(404).json({ error: 'fromClassId not found in this course' });
  }

  const fromDate = fromClass.class_date;

  // 3. Filter to only class instances with class_date >= fromDate
  const classesToPostpone = allClasses.filter(c => c.class_date >= fromDate);

  // 4. Sort by class_date DESCENDING (move latest first to avoid unique constraint conflicts)
  classesToPostpone.sort((a, b) => b.class_date.localeCompare(a.class_date));

  // 5. Update each class_date by adding weeks * 7 days
  const daysToAdd = weeks * 7;
  const updatedDates = [];

  for (const cls of classesToPostpone) {
    const oldDate = new Date(cls.class_date);
    oldDate.setDate(oldDate.getDate() + daysToAdd);
    const newDate = oldDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const { error: updateError } = await supabaseDb.supabase
      .from('class_instances')
      .update({ class_date: newDate })
      .eq('id', cls.id);

    if (updateError) {
      console.error(`Error updating class ${cls.id}:`, updateError);
      return res.status(500).json({ error: `Failed to update class ${cls.id}` });
    }

    updatedDates.push({ id: cls.id, class_type: cls.class_type, old_date: cls.class_date, new_date: newDate });
  }

  // 6. Update course_enrollments: set course_end_date and expected_end_date to the new latest class date
  // The new latest date is the last entry when sorted ascending
  const newLatestDate = updatedDates
    .map(d => d.new_date)
    .sort()
    .pop();

  if (newLatestDate) {
    const { error: enrollError } = await supabaseDb.supabase
      .from('course_enrollments')
      .update({
        course_end_date: newLatestDate,
        expected_end_date: newLatestDate
      })
      .eq('course_identifier', courseIdentifier);

    if (enrollError) {
      console.error('Error updating course enrollments:', enrollError);
      return res.status(500).json({ error: 'Classes updated but failed to update enrollment dates' });
    }
  }

  // 7. Push new dates to Google Calendar (fire-and-forget; syncClassInstance
  //    re-reads class_instances by id so it picks up the new class_date).
  try {
    const calendarSync = require('../utils/calendarSync');
    for (const cls of classesToPostpone) {
      calendarSync.syncClassInstance(cls.id).catch(() => {});
    }
  } catch (e) { /* ignore */ }

  // 8. Return success
  res.json({
    message: `Successfully postponed ${classesToPostpone.length} class(es) by ${weeks} week(s)`,
    updatedClasses: updatedDates,
    newCourseEndDate: newLatestDate
  });
}));

// Send unconfirmed/postponement email for a course
app.post('/api/admin/courses/:courseIdentifier/send-unconfirmed', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { courseIdentifier } = req.params;
  const { subject, body } = req.body;

  if (!subject || !body) {
    return res.status(400).json({ error: 'Subject and body are required' });
  }

  // Get enrolled students for this course
  const { data: enrollments } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('student_id, customers:student_id(email, first_name)')
    .eq('course_identifier', courseIdentifier)
    .eq('status', 'active');

  if (!enrollments || enrollments.length === 0) {
    return res.status(400).json({ error: 'No active enrollments found for this course' });
  }

  const recipientEmails = enrollments
    .map(e => e.customers?.email)
    .filter(Boolean);

  if (recipientEmails.length === 0) {
    return res.status(400).json({ error: 'No valid email addresses found' });
  }

  const { wrapEmailTemplate } = require('../email-templates/base');
  const html = wrapEmailTemplate(body);

  const { sendAndLogEmail } = require('../utils/emailService');
  const result = await sendAndLogEmail({
    emailType: 'course_unconfirmed',
    courseIdentifier,
    subject,
    html,
    recipientEmails,
    sentBy: req.user.email || 'admin',
  });

  if (!result.success) {
    return res.status(500).json({ error: result.error || 'Failed to send email' });
  }

  res.json({
    success: true,
    recipientCount: recipientEmails.length,
    messageId: result.messageId,
  });
}));

// Get last sent unconfirmed email dates per course
app.get('/api/admin/courses/unconfirmed-email-dates', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { data } = await supabaseDb.supabase
    .from('sent_emails')
    .select('course_identifier, sent_at')
    .eq('email_type', 'course_unconfirmed')
    .order('sent_at', { ascending: false });

  // Group by course, take most recent
  const lastSent = {};
  (data || []).forEach(row => {
    if (!lastSent[row.course_identifier]) {
      lastSent[row.course_identifier] = row.sent_at;
    }
  });

  res.json(lastSent);
}));

// List all fees with student info
app.get('/api/admin/fees', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { data, error } = await supabaseDb.supabase
    .from('reschedule_fees')
    .select('*, customers:student_id(id, first_name, last_name, email)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  res.json({ fees: data || [] });
}));

// Update fee status
app.put('/api/admin/fees/:feeId', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { feeId } = req.params;
  const { payment_status, notes } = req.body;

  const update = { updated_at: new Date().toISOString() };
  if (payment_status) {
    update.payment_status = payment_status;
    if (payment_status === 'paid') update.payment_date = new Date().toISOString();
  }
  if (notes !== undefined) update.notes = notes;

  const { data, error } = await supabaseDb.supabase
    .from('reschedule_fees')
    .update(update)
    .eq('id', parseInt(feeId))
    .select()
    .single();

  if (error) throw error;
  res.json(data);
}));

// Create a new class
app.post('/api/admin/classes', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { startTime, endTime, classType, instructor, room, teachingCapacity, makeUpCapacity, glazingCapacity, numberOfClasses, classDates } = req.body;

  // Validate required fields
  if (!startTime || !endTime || !classType || !instructor || !room || !numberOfClasses || !classDates) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate that we have the correct number of dates
  if (classDates.length !== numberOfClasses) {
    return res.status(400).json({ error: 'Number of dates must match number of classes' });
  }

  // Validate all dates are provided
  const emptyDates = classDates.filter(d => !d);
  if (emptyDates.length > 0) {
    return res.status(400).json({ error: 'All class dates must be provided' });
  }

  const now = new Date().toISOString();
  const createdClasses = [];

  // Calculate total capacity (teaching + make up for regular classes, glazing capacity for last class)
  const regularCapacity = (teachingCapacity || 10) + (makeUpCapacity || 2);
  const finalGlazingCapacity = glazingCapacity || 14;

  // Create each class instance with the appropriate week number
  for (let i = 0; i < numberOfClasses; i++) {
    const weekNumber = i + 1;
    const isLastClass = weekNumber === numberOfClasses;

    // Generate the class type with week number (e.g., WT1210AM_DL6.1, WT1210AM_DL6.2, etc.)
    const classTypeWithWeek = `${classType}.${weekNumber}`;

    // Use glazing capacity for the last class, regular capacity for others
    const classCapacity = isLastClass ? finalGlazingCapacity : regularCapacity;

    const { data, error} = await supabaseDb.supabase
      .from('class_instances')
      .insert({
        class_date: classDates[i],
        start_time: startTime,
        end_time: endTime,
        class_type: classTypeWithWeek,
        instructor: instructor,
        room: room,
        max_capacity: classCapacity,
        current_enrollment: 0,
        status: 'active',
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error(`Error creating class ${weekNumber}:`, error);
      // If we fail partway through, return an error but note what was created
      return res.status(500).json({
        error: `Failed to create class ${weekNumber}. ${createdClasses.length} classes were created before this error.`,
        createdClasses: createdClasses
      });
    }

    createdClasses.push(data);
    if (isLastClass) {
      console.log(`✅ Created GLAZING class ${weekNumber}/${numberOfClasses}: ${classTypeWithWeek} on ${classDates[i]} (Capacity: ${classCapacity})`);
    } else {
      console.log(`✅ Created class ${weekNumber}/${numberOfClasses}: ${classTypeWithWeek} on ${classDates[i]} (Teaching: ${teachingCapacity}, Make-up: ${makeUpCapacity}, Total: ${classCapacity})`);
    }
  }

  console.log(`✅ Successfully created ${numberOfClasses} classes for course: ${classType}`);

  // Sync new classes to Google Calendar
  try {
    const calendarSync = require('../utils/calendarSync');
    createdClasses.forEach(c => calendarSync.syncClassInstance(c.id).catch(() => {}));
  } catch (e) { /* ignore */ }

  res.json({
    message: `${numberOfClasses} class${numberOfClasses > 1 ? 'es' : ''} created successfully`,
    classes: createdClasses
  });
}));

// Admin: Bulk delete phantom classes after a cutoff date (no active bookings)
app.delete('/api/admin/classes/bulk-after', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { afterDate } = req.body || {};
  if (!afterDate) return res.status(400).json({ error: 'afterDate required (YYYY-MM-DD)' });

  const { data: classes, error: fetchErr } = await supabaseDb.supabase
    .from('class_instances')
    .select('id')
    .gt('class_date', afterDate);

  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!classes || classes.length === 0) return res.json({ message: 'No classes found after ' + afterDate, deleted: 0 });

  const classIds = classes.map(c => c.id);

  // Delete any bookings referencing these classes first
  const { error: bookingErr } = await supabaseDb.supabase
    .from('bookings')
    .delete()
    .in('class_instance_id', classIds);

  if (bookingErr) console.error('Warning: error deleting bookings:', bookingErr);

  // Now delete the class instances
  const { data: deleted, error: deleteErr } = await supabaseDb.supabase
    .from('class_instances')
    .delete()
    .in('id', classIds)
    .select('id');

  if (deleteErr) return res.status(500).json({ error: deleteErr.message });

  console.log(`🗑️ Bulk cleanup: deleted ${deleted.length} classes after ${afterDate}`);
  res.json({ message: `Deleted ${deleted.length} classes after ${afterDate}`, deleted: deleted.length });
}));

// Delete a class
app.delete('/api/admin/classes/:classId', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { classId } = req.params;

  // Check if class has any bookings
  const { data: bookings, error: bookingsError } = await supabaseDb.supabase
    .from('bookings')
    .select('id')
    .eq('class_instance_id', classId)
    .in('status', ['booked', 'completed']);

  if (bookingsError) {
    console.error('Error checking bookings:', bookingsError);
    return res.status(500).json({ error: 'Failed to check class bookings' });
  }

  if (bookings && bookings.length > 0) {
    return res.status(400).json({ error: 'Cannot delete class with enrolled students. Please remove all students first.' });
  }

  // Remove from Google Calendar before deleting
  try {
    const calendarSync = require('../utils/calendarSync');
    await calendarSync.deleteClassInstance(parseInt(classId));
  } catch (e) { /* ignore */ }

  // Delete the class
  const { error: deleteError } = await supabaseDb.supabase
    .from('class_instances')
    .delete()
    .eq('id', classId);

  if (deleteError) {
    console.error('Error deleting class:', deleteError);
    return res.status(500).json({ error: 'Failed to delete class' });
  }

  console.log(`✅ Deleted class: ${classId}`);
  res.json({ message: 'Class deleted successfully' });
}));

// Delete entire course (all class instances matching a course identifier)
app.delete('/api/admin/courses/:courseId', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  // Get all class instances for this course
  const { data: classes } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, class_type')
    .like('class_type', `${courseId}%`);

  if (!classes || classes.length === 0) {
    return res.status(404).json({ error: 'No class instances found for this course' });
  }

  const classIds = classes.map(c => c.id);

  // Check if any class has active bookings
  const { data: bookings } = await supabaseDb.supabase
    .from('bookings')
    .select('id, class_instance_id')
    .in('class_instance_id', classIds)
    .in('status', ['booked', 'attended']);

  if (bookings && bookings.length > 0) {
    return res.status(400).json({ error: `Cannot delete course with ${bookings.length} active bookings. Remove all students first.` });
  }

  // Delete all class instances
  const { error: deleteError } = await supabaseDb.supabase
    .from('class_instances')
    .delete()
    .in('id', classIds);

  if (deleteError) throw deleteError;

  console.log(`🗑️ Deleted course ${courseId}: ${classes.length} class instances`);
  res.json({ message: `Deleted ${classes.length} classes for ${courseId}` });
}));

app.get('/api/admin/customers', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const customers = await supabaseDb.getAllCustomers();

  const formattedCustomers = customers.map(customer => ({
    id: customer.shopify_customer_id,
    dbId: customer.id,
    email: customer.email,
    firstName: customer.first_name,
    lastName: customer.last_name,
    role: customer.role || 'student',
    bio: customer.bio || null,
    profile_image: customer.profile_image || null,
  }));

  res.json({ customers: formattedCustomers });
}));

// ==========================================
// PAUSE & RESCHEDULE ENDPOINTS
// ==========================================

// Get all paused students
app.get('/api/admin/paused-students', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { data: pausedStudents, error } = await supabaseDb.supabase
    .from('customers')
    .select('id, first_name, last_name, email, course_paused, pause_start_date, pause_reason, paused_at_week, resume_course_identifier, course_purchase_count')
    .eq('course_paused', true)
    .order('pause_start_date', { ascending: false });

  if (error) throw error;

  res.json({ pausedStudents: pausedStudents || [] });
}));

// Pause a student's course
app.post('/api/admin/students/:studentId/pause', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { pauseReason, pausedAtWeek, resumeCourseIdentifier } = req.body;

  if (!pauseReason || !pausedAtWeek) {
    return res.status(400).json({ error: 'Missing required fields: pauseReason, pausedAtWeek' });
  }

  const { data: student, error } = await supabaseDb.supabase
    .from('customers')
    .update({
      course_paused: true,
      pause_start_date: new Date().toISOString().split('T')[0],
      pause_reason: pauseReason,
      paused_at_week: pausedAtWeek,
      resume_course_identifier: resumeCourseIdentifier || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', studentId)
    .select()
    .single();

  if (error) throw error;

  res.json({ message: 'Student paused successfully', student });
}));

// Resume a paused student
app.post('/api/admin/students/:studentId/resume', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const { data: student, error } = await supabaseDb.supabase
    .from('customers')
    .update({
      course_paused: false,
      pause_start_date: null,
      pause_reason: null,
      paused_at_week: null,
      resume_course_identifier: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', studentId)
    .select()
    .single();

  if (error) throw error;

  res.json({ message: 'Student resumed successfully', student });
}));

// GET /api/admin/reschedules — list all reschedule movements
app.get('/api/admin/reschedules', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  // Get all bookings that were rescheduled (have original_class_instance_id set)
  const { data: rescheduledFrom, error: fromError } = await supabaseDb.supabase
    .from('bookings')
    .select(`
      id,
      student_id,
      status,
      booking_type,
      created_at,
      updated_at,
      class_instance_id,
      original_class_instance_id,
      rescheduled_from_date,
      reschedule_reason,
      reschedule_fee_paid,
      is_glazing_reschedule,
      reschedule_source,
      course_enrollment_id,
      customers!bookings_student_id_fkey(id, first_name, last_name, email),
      class_instances!bookings_class_instance_id_fkey(id, class_date, start_time, end_time, class_type)
    `)
    .not('original_class_instance_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (fromError) throw fromError;

  // For each rescheduled-to booking, get the original class info
  const originalClassIds = [...new Set(rescheduledFrom.map(b => b.original_class_instance_id).filter(Boolean))];

  let originalClassMap = {};
  if (originalClassIds.length > 0) {
    const { data: originalClasses } = await supabaseDb.supabase
      .from('class_instances')
      .select('id, class_date, start_time, end_time, class_type')
      .in('id', originalClassIds);

    if (originalClasses) {
      originalClasses.forEach(c => { originalClassMap[c.id] = c; });
    }
  }

  // Also get reschedule fees
  const bookingIds = rescheduledFrom.map(b => b.id);
  let feeMap = {};
  if (bookingIds.length > 0) {
    const { data: fees } = await supabaseDb.supabase
      .from('reschedule_fees')
      .select('*')
      .in('booking_id', bookingIds);

    if (fees) {
      fees.forEach(f => { feeMap[f.booking_id] = f; });
    }
  }

  const reschedules = rescheduledFrom.map(booking => {
    const originalClass = originalClassMap[booking.original_class_instance_id];
    const fee = feeMap[booking.id];
    return {
      id: booking.id,
      student: booking.customers ? {
        id: booking.customers.id,
        name: `${booking.customers.first_name || ''} ${booking.customers.last_name || ''}`.trim(),
        email: booking.customers.email,
      } : null,
      fromDate: originalClass?.class_date || booking.rescheduled_from_date,
      fromTime: originalClass?.start_time,
      fromType: originalClass?.class_type,
      toDate: booking.class_instances?.class_date,
      toTime: booking.class_instances?.start_time,
      toType: booking.class_instances?.class_type,
      reason: booking.reschedule_reason,
      fee: fee ? { amount: fee.amount, status: fee.payment_status, type: fee.fee_type } : null,
      isGlazing: booking.is_glazing_reschedule,
      source: booking.reschedule_source || 'admin',
      status: booking.status,
      createdAt: booking.created_at,
    };
  });

  // Also fetch recent STUDENT-INITIATED booking activity (credit bookings,
  // cancellations, forfeits). We over-fetch then filter out system batch
  // bookings (auto-created when a cohort launches — 4-6 bookings for the
  // same student within seconds).
  const { data: recentBookings, error: bookingsError } = await supabaseDb.supabase
    .from('bookings')
    .select(`
      id,
      student_id,
      status,
      booking_type,
      created_at,
      updated_at,
      class_instance_id,
      original_class_instance_id,
      course_enrollment_id,
      customers!bookings_student_id_fkey(id, first_name, last_name, email),
      class_instances!bookings_class_instance_id_fkey(id, class_date, start_time, end_time, class_type)
    `)
    .is('original_class_instance_id', null)
    .in('status', ['booked', 'cancelled', 'forfeited', 'attended', 'completed'])
    .order('created_at', { ascending: false })
    .limit(200);

  if (bookingsError) throw bookingsError;

  // Filter out system-generated batch bookings. When the cohort processor
  // auto-creates a student's 6-week schedule, it writes 4-7 bookings for
  // the same student within a few seconds. Group by student + 10-second
  // window: if the group has 3+ entries they're batch-created → skip.
  const batchKey = (b) => `${b.student_id}_${Math.floor(new Date(b.created_at).getTime() / 10000)}`;
  const batchCounts = {};
  for (const b of recentBookings || []) {
    const k = batchKey(b);
    batchCounts[k] = (batchCounts[k] || 0) + 1;
  }
  const studentActivity = (recentBookings || []).filter(b => batchCounts[batchKey(b)] < 3);

  const bookings = studentActivity.slice(0, 50).map(b => ({
    id: b.id,
    student: b.customers ? {
      id: b.customers.id,
      name: `${b.customers.first_name || ''} ${b.customers.last_name || ''}`.trim(),
      email: b.customers.email,
    } : null,
    fromDate: null,
    fromTime: null,
    fromType: null,
    toDate: b.class_instances?.class_date,
    toTime: b.class_instances?.start_time,
    toType: b.class_instances?.class_type,
    reason: null,
    fee: null,
    isGlazing: false,
    source: 'booking',
    status: b.status,
    bookingType: b.booking_type,
    createdAt: b.created_at,
  }));

  res.json({ reschedules, bookings });
}));

// Reschedule a booking
app.post('/api/admin/bookings/:bookingId/reschedule', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { newClassInstanceId, rescheduleReason, fee, isGlazingReschedule } = req.body;

  if (!newClassInstanceId) {
    return res.status(400).json({ error: 'Missing required field: newClassInstanceId' });
  }

  // Get original booking
  const { data: originalBooking, error: fetchError } = await supabaseDb.supabase
    .from('bookings')
    .select('*, class_instances!bookings_class_instance_id_fkey(class_date)')
    .eq('id', bookingId)
    .single();

  if (fetchError) throw fetchError;

  // Block reschedule if target class is at capacity. Count actual booked rows
  // rather than the cached current_enrollment, and use the same fallback (10)
  // as the student reschedule path.
  const { data: targetClass, error: targetClassErr } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, max_capacity, class_date, start_time')
    .eq('id', parseInt(newClassInstanceId))
    .single();

  if (targetClassErr || !targetClass) {
    return res.status(404).json({ error: 'Target class not found' });
  }

  // Both gates: the instance's own cap, and the studio-wide wheel count across
  // every cohort sharing this timeslot. An admin-granted capacity override for
  // this exact student is the only way past either.
  const seat = await supabaseDb.checkSeatAvailability(targetClass, originalBooking.student_id, { checkWheels: true });
  if (!seat.allowed) {
    return res.status(400).json({
      error: seat.reason === 'STUDIO_FULL'
        ? `Studio is full — all ${supabaseDb.STUDIO_WHEELS} wheels are booked for this timeslot.`
        : 'This class is full. Cannot reschedule to a class at max capacity.'
    });
  }

  // If the student already has a cancelled/rescheduled booking at the target
  // class (e.g. from the old DELETE+POST reschedule flow), hard-delete it
  // first so the in-place update below doesn't hit a unique constraint.
  const { data: conflicting } = await supabaseDb.supabase
    .from('bookings')
    .select('id, status')
    .eq('student_id', originalBooking.student_id)
    .eq('class_instance_id', parseInt(newClassInstanceId))
    .neq('id', parseInt(bookingId))
    .maybeSingle();

  if (conflicting) {
    if (['cancelled', 'rescheduled', 'forfeited', 'absent'].includes(conflicting.status)) {
      await supabaseDb.supabase.from('bookings').delete().eq('id', conflicting.id);
      console.log(`Deleted conflicting ${conflicting.status} booking ${conflicting.id} at class ${newClassInstanceId}`);
    } else {
      return res.status(409).json({ error: 'Student already has an active booking for this class.' });
    }
  }

  // Mark original booking as rescheduled (keeps student visible on original class calendar)
  await supabaseDb.supabase
    .from('bookings')
    .update({
      status: 'rescheduled',
      original_class_instance_id: originalBooking.class_instance_id,
      rescheduled_from_date: originalBooking.class_instances.class_date,
      reschedule_source: 'admin',
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId);

  // Decrement old class enrollment
  await supabaseDb.updateClassEnrollment(originalBooking.class_instance_id, -1);

  // Create new booking on target class
  const { data: createdBooking, error: createError } = await supabaseDb.supabase
    .from('bookings')
    .insert({
      student_id: originalBooking.student_id,
      class_instance_id: parseInt(newClassInstanceId),
      status: 'booked',
      booking_type: originalBooking.booking_type || 'regular',
      course_enrollment_id: originalBooking.course_enrollment_id,
      original_class_instance_id: originalBooking.class_instance_id,
      rescheduled_from_date: originalBooking.class_instances.class_date,
      reschedule_reason: rescheduleReason || null,
      reschedule_fee_paid: fee || 0,
      is_glazing_reschedule: isGlazingReschedule || false,
      reschedule_source: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (createError) throw createError;
  const newBooking = createdBooking;

  // Increment new class enrollment
  await supabaseDb.updateClassEnrollment(parseInt(newClassInstanceId), 1);

  // Spend the grant if this seat only existed because of one.
  if (seat.override) {
    await supabaseDb.consumeCapacityOverride(seat.override.id, newBooking?.id);
    console.log(`⚠️  Capacity override ${seat.override.id} used: student ${originalBooking.student_id} rescheduled over cap into class ${newClassInstanceId} — ${seat.override.reason}`);
  }

  // If there's a fee, create a fee record
  if (fee && fee > 0) {
    const { error: feeError } = await supabaseDb.supabase
      .from('reschedule_fees')
      .insert({
        student_id: originalBooking.student_id,
        booking_id: newBooking.id,
        fee_type: 'makeup',
        amount: fee,
        payment_status: 'waived', // Admin reschedules are automatically waived
        notes: rescheduleReason || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (feeError) console.error('Error creating fee record:', feeError);
  }

  // Send reschedule confirmation email
  try {
    const { data: student } = await supabaseDb.supabase
      .from('customers')
      .select('first_name, email')
      .eq('id', originalBooking.student_id)
      .single();

    const { data: newClassInstance } = await supabaseDb.supabase
      .from('class_instances')
      .select('class_date, start_time, end_time')
      .eq('id', newClassInstanceId)
      .single();

    if (student?.email && newClassInstance) {
      const rescheduleTemplate = require('../email-templates/reschedule-confirmation');
      const { sendAndLogEmail } = require('../utils/emailService');
      const originalDate = originalBooking.class_instances?.class_date
        ? new Date(originalBooking.class_instances.class_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
        : 'your original class';
      const newDate = new Date(newClassInstance.class_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      const newTime = `${newClassInstance.start_time} – ${newClassInstance.end_time}`;

      const { subject, html } = rescheduleTemplate.generate({
        firstName: student.first_name || 'Student',
        originalDate,
        newDate,
        newTime,
        courseIdentifier: originalBooking.course_enrollment_id || '',
      });

      await sendAndLogEmail({
        emailType: 'reschedule_confirmation',
        courseIdentifier: originalBooking.course_enrollment_id || 'N/A',
        subject,
        html,
        recipientEmails: [student.email],
        sentBy: 'system',
      });
    }
  } catch (emailErr) {
    console.error('Failed to send reschedule confirmation email:', emailErr);
  }

  // Sync affected classes to Google Calendar
  try {
    const calendarSync = require('../utils/calendarSync');
    calendarSync.syncClassInstance(originalBooking.class_instance_id).catch(() => {});
    calendarSync.syncClassInstance(parseInt(newClassInstanceId)).catch(() => {});
  } catch (e) { /* ignore */ }

  // If this booking moved to a different course, check whether the enrollment metadata
  // should be updated (e.g., student moved from Thursday to Tuesday course).
  // Only update once ALL active bookings for the enrollment are in the new course.
  if (originalBooking.course_enrollment_id) {
    try {
      const { data: newClassData } = await supabaseDb.supabase
        .from('class_instances')
        .select('class_type')
        .eq('id', newClassInstanceId)
        .single();
      const newBase = newClassData?.class_type?.replace(/\.\d+$/, '') || '';

      const { data: enrollment } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('id, course_identifier')
        .eq('id', originalBooking.course_enrollment_id)
        .single();

      if (enrollment && newBase && newBase !== enrollment.course_identifier) {
        // Check if ALL active bookings for this enrollment are now in the new course
        const { data: activeBookings } = await supabaseDb.supabase
          .from('bookings')
          .select('id, class_instance_id')
          .eq('course_enrollment_id', enrollment.id)
          .in('status', ['booked', 'attended']);

        const activeClassIds = (activeBookings || []).map(b => b.class_instance_id);
        let allInNewCourse = true;
        if (activeClassIds.length > 0) {
          const { data: activeClasses } = await supabaseDb.supabase
            .from('class_instances')
            .select('id, class_type')
            .in('id', activeClassIds);
          allInNewCourse = (activeClasses || []).every(c =>
            (c.class_type?.replace(/\.\d+$/, '') || '') === newBase
          );
        }

        if (allInNewCourse) {
          // All bookings moved — update enrollment metadata from the new course's class instances
          const { data: newCourseClasses } = await supabaseDb.supabase
            .from('class_instances')
            .select('class_date, start_time, end_time')
            .like('class_type', `${newBase}.%`)
            .order('class_date', { ascending: true });

          if (newCourseClasses && newCourseClasses.length > 0) {
            const firstDate = new Date(newCourseClasses[0].class_date);
            const lastDate = new Date(newCourseClasses[newCourseClasses.length - 1].class_date);
            const dayNames = ['SUNDAYS', 'MONDAYS', 'TUESDAYS', 'WEDNESDAYS', 'THURSDAYS', 'FRIDAYS', 'SATURDAYS'];
            const dayName = dayNames[firstDate.getDay()];
            const schedulePattern = dayName.replace(/S$/, ''); // TUESDAY
            const fmtShort = (d) => `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
            const timeStr = `${newCourseClasses[0].start_time} - ${newCourseClasses[0].end_time}`;
            const variantTitle = `${dayName} • ${fmtShort(firstDate)}–${fmtShort(lastDate)} • ${timeStr.toLowerCase()}`;

            await supabaseDb.supabase
              .from('course_enrollments')
              .update({
                course_identifier: newBase,
                schedule_pattern: schedulePattern,
                course_variant_title: variantTitle,
                course_start_date: firstDate.toISOString().split('T')[0],
                course_end_date: lastDate.toISOString().split('T')[0],
                class_time: timeStr,
                updated_at: new Date().toISOString(),
              })
              .eq('id', enrollment.id);

            console.log(`✅ Updated enrollment ${enrollment.id} metadata: ${enrollment.course_identifier} → ${newBase} (${variantTitle})`);
          }
        }
      }
    } catch (metaErr) {
      console.error('Failed to update enrollment metadata after course move:', metaErr);
      // Non-blocking — the reschedule itself succeeded
    }
  }

  res.json({ message: 'Booking rescheduled successfully', newBooking });
}));

// Get reschedule fees for a student
// Get all active waitlist entries (admin — for emails page)
app.get('/api/admin/waitlist', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { data, error } = await supabaseDb.supabase
    .from('waitlist')
    .select(`
      id, position, joined_at, claimed, notification_sent_at,
      customers!waitlist_student_id_fkey (id, first_name, last_name, email),
      class_instances!waitlist_class_instance_id_fkey (id, class_type, class_date, start_time, end_time, instructor)
    `)
    .eq('claimed', false)
    .order('class_instances(class_date)', { ascending: true });

  if (error) {
    console.error('Error fetching waitlist:', error);
    return res.status(500).json({ error: 'Failed to fetch waitlist' });
  }

  res.json({ waitlist: data || [] });
}));

// Send a waitlist email manually (admin)
app.post('/api/admin/waitlist/:id/send-email', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { emailType } = req.body; // 'waitlisted' | 'class-full' | 'confirmed'

  const { data: entry, error } = await supabaseDb.supabase
    .from('waitlist')
    .select(`
      id, student_id,
      customers!waitlist_student_id_fkey (first_name, last_name, email),
      class_instances!waitlist_class_instance_id_fkey (id, class_type, class_date, start_time, end_time, instructor)
    `)
    .eq('id', parseInt(id))
    .single();

  if (error || !entry) return res.status(404).json({ error: 'Waitlist entry not found' });

  const student = entry.customers;
  const cls = entry.class_instances;
  if (!student?.email || !cls) return res.status(400).json({ error: 'Missing student or class data' });

  const { sendEmail } = require('../utils/emailService');
  const { wrapEmailTemplate } = require('../email-templates/base');
  const classDateStr = new Date(cls.class_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const ct = cls.class_type || '';
  const weekMatch = ct.match(/_\w+(\d)\./);
  const courseTitle = ct.startsWith('HB') ? 'Handbuilding'
    : (weekMatch && weekMatch[1] === '7') ? 'Wheelthrowing Intermediate 7 Weeks'
    : 'Wheelthrowing Beginners/Ext 6 Weeks';

  let subject, body;

  if (emailType === 'waitlisted') {
    subject = `VES — You're on the waitlist for ${classDateStr}`;
    body = `
      <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">You're on the waitlist</h1>
      <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">Hi ${student.first_name}, thank you for your interest! The class below is currently full, but you've been added to the waitlist.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FFF7E6; border-radius: 8px; margin: 0 0 20px;">
        <tr><td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E6200; text-transform: uppercase; letter-spacing: 0.05em;">Waitlisted Class</p>
          <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: #282828;">${courseTitle}</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${classDateStr}</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${cls.start_time} – ${cls.end_time}</p>
          <p style="margin: 0; font-size: 15px; color: #282828;">Instructor: ${cls.instructor}</p>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F5F3F0; border-radius: 8px; margin: 0 0 20px;">
        <tr><td style="padding: 16px 20px;">
          <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #282828;">What happens next?</p>
          <p style="margin: 0 0 4px; font-size: 14px; line-height: 1.6; color: #282828;">1. If a spot opens up, you will be <strong>automatically booked in</strong>.</p>
          <p style="margin: 0 0 4px; font-size: 14px; line-height: 1.6; color: #282828;">2. A <strong>confirmation email</strong> will be sent to you immediately.</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #282828;">3. No action is needed from you — we'll handle the rest!</p>
        </td></tr>
      </table>
      <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #888888;">No credit has been deducted — credits are only used when you are confirmed into the class.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0;"><tr><td align="center">
        <a href="https://club.ves.sg/classes" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">View My Classes</a>
      </td></tr></table>`;
  } else if (emailType === 'class-full') {
    subject = `VES — Please reschedule your ${classDateStr} class`;
    body = `
      <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">Class is full — please reschedule</h1>
      <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">Hi ${student.first_name}, unfortunately a spot did not open up for your waitlisted class. The class is confirmed full and you will need to reschedule to another available class.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FFF7E6; border-radius: 8px; margin: 0 0 20px;">
        <tr><td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E6200; text-transform: uppercase; letter-spacing: 0.05em;">Class Not Available</p>
          <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: #282828;">${courseTitle}</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${classDateStr}</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${cls.start_time} – ${cls.end_time}</p>
          <p style="margin: 0; font-size: 15px; color: #282828;">Instructor: ${cls.instructor}</p>
        </td></tr>
      </table>
      <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #282828;">Please log in to reschedule your class to another available session. No credit has been deducted — your class credit is still available.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0;"><tr><td align="center">
        <a href="https://club.ves.sg/classes" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">Reschedule Now</a>
      </td></tr></table>`;
  } else if (emailType === 'confirmed') {
    subject = `VES — You're in! Class confirmed — ${classDateStr}`;
    body = `
      <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">You're in! Class confirmed</h1>
      <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">Hi ${student.first_name}, great news — a spot has opened up and you've been confirmed for your class!</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
        <tr><td style="padding: 16px 20px;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Class Details</p>
          <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: #282828;">${courseTitle}</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${classDateStr}</p>
          <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${cls.start_time} – ${cls.end_time}</p>
          <p style="margin: 0; font-size: 15px; color: #282828;">Instructor: ${cls.instructor}</p>
        </td></tr>
      </table>
      <p style="margin: 0 0 4px; font-size: 14px; line-height: 1.5; color: #282828;"><strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268 (<a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Map</a>)</p>
      <p style="margin: 0 0 20px; font-size: 13px; line-height: 1.5; color: #888888;">Nearest MRT: Holland Village &middot; No on-site parking</p>
      <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #282828;">We look forward to seeing you at the studio!</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 0;"><tr><td align="center">
        <a href="https://club.ves.sg/classes" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">View My Classes</a>
      </td></tr></table>`;
  } else {
    return res.status(400).json({ error: 'Invalid email type. Use: waitlisted, class-full, or confirmed' });
  }

  const result = await sendEmail({ to: student.email, subject, html: wrapEmailTemplate(body) });

  if (result.success) {
    showStatus && showStatus('success', 'Email sent');
  }

  res.json({ success: result.success, emailType, studentName: `${student.first_name} ${student.last_name}`, error: result.error });
}));

// ── Gift-voucher email (admin-composed family HB gift) ──────────────────────
// Parse a comma / newline / semicolon separated list of addresses into a
// validated array. Returns { list } or { error } for a bad address.
function parseEmailList(raw) {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Strip invisible characters that survive copy-paste (zero-width spaces,
  // BOM, non-breaking spaces) and would otherwise reach Resend and be rejected.
  const clean = s => String(s)
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00A0]/g, '')
    .trim();
  const tokens = (Array.isArray(raw) ? raw : String(raw || '').split(/[,\n;]+/))
    .map(clean)
    .filter(Boolean);
  const list = [];
  for (const tok of tokens) {
    // Accept a "Name <email@x.com>" form by extracting the bracketed address.
    const m = tok.match(/<\s*([^>]+?)\s*>\s*$/);
    const email = clean(m ? m[1] : tok);
    if (!emailRe.test(email)) return { error: `Invalid email address: ${tok}` };
    // Resend accepts both plain and "Name <email>"; preserve display name if given.
    list.push(m ? `${tok.slice(0, m.index).trim()} <${email}>`.trim() : email);
  }
  return { list };
}

// Build the subject + html for a gift-voucher email from the request body.
function buildGiftVoucherEmail(body) {
  const { generateGiftVoucherEmail } = require('../email-templates/gift-voucher');
  return generateGiftVoucherEmail({
    subject: body.subject,
    recipientName: body.recipientName,
    giverName: body.giverName,
    giftLabel: body.giftLabel,
    giverMessage: body.giverMessage,
    months: body.months ? parseInt(body.months) : undefined,
  });
}

// Preview — returns rendered subject + html without sending.
app.post('/api/admin/emails/gift-voucher/preview', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { subject, html } = buildGiftVoucherEmail(req.body || {});
  res.json({ subject, html });
}));

// Send — to (required) + optional cc, both accepting multiple addresses.
app.post('/api/admin/emails/gift-voucher/send', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const to = parseEmailList(body.to);
  if (to.error) return res.status(400).json({ error: to.error });
  if (to.list.length === 0) return res.status(400).json({ error: 'At least one "To" address is required' });
  const cc = parseEmailList(body.cc);
  if (cc.error) return res.status(400).json({ error: cc.error });
  if (!String(body.giverMessage || '').trim()) return res.status(400).json({ error: "The giver's message is required" });

  const { sendEmail } = require('../utils/emailService');
  const { subject, html } = buildGiftVoucherEmail(body);
  const result = await sendEmail({
    to: to.list,
    cc: cc.list.length ? cc.list : undefined,
    subject,
    html,
  });
  if (!result.success) return res.status(502).json({ error: result.error || 'Send failed' });
  res.json({ success: true, to: to.list, cc: cc.list, messageId: result.messageId });
}));

// Gift a membership to a recipient — reassigns the entitlement, records who
// gave it + their message, recomputes both customers' types, and (optionally)
// emails the recipient the gift email. This is the Fadilah→Iman flow made
// first-class: the purchaser buys, admin gifts it to the recipient in one step.
app.post('/api/admin/memberships/:id/gift', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { recipientEmail, giverName, giverMessage, sendEmail: doSend = true } = req.body || {};

  const rcpt = parseEmailList(recipientEmail);
  if (rcpt.error) return res.status(400).json({ error: rcpt.error });
  if (rcpt.list.length !== 1) return res.status(400).json({ error: 'Provide exactly one recipient email' });
  const recipientAddr = rcpt.list[0];

  // The membership being gifted
  const { data: membership, error: mErr } = await supabaseDb.supabase
    .from('memberships')
    .select('id, customer_id, membership_type, status')
    .eq('id', parseInt(id))
    .single();
  if (mErr || !membership) return res.status(404).json({ error: 'Membership not found' });

  // Recipient must already be a customer (they need an account to own it).
  const { data: recipient } = await supabaseDb.supabase
    .from('customers')
    .select('id, email, first_name, last_name')
    .ilike('email', recipientAddr)
    .maybeSingle();
  if (!recipient) {
    return res.status(404).json({ error: `No customer found for ${recipientAddr}. Create their account first, then gift the membership.` });
  }
  if (recipient.id === membership.customer_id) {
    return res.status(400).json({ error: 'This membership already belongs to that customer' });
  }

  const purchaserId = membership.customer_id;

  // Reassign the entitlement to the recipient and stamp the gift metadata.
  const { error: updErr } = await supabaseDb.supabase
    .from('memberships')
    .update({
      customer_id: recipient.id,
      gifted_by_customer_id: purchaserId,
      gift_message: giverMessage || null,
      gifted_at: new Date().toISOString(),
    })
    .eq('id', membership.id);
  if (updErr) return res.status(500).json({ error: updErr.message });

  // Keep both customers' types in sync (purchaser may lose member status; the
  // recipient gains it — pending counts as member).
  if (purchaserId) await supabaseDb.updateSingleCustomerType(purchaserId);
  await supabaseDb.updateSingleCustomerType(recipient.id);

  // The term markers now belong to the recipient — refresh so their name shows
  // on the studio calendar (fire-and-forget).
  require('../utils/calendarSync').syncMembership(membership.id).catch(() => {});

  // Email the recipient the membership gift email.
  let emailResult = { skipped: true };
  if (doSend) {
    const monthsMatch = (membership.membership_type || '').match(/(\d+)/);
    const months = monthsMatch ? parseInt(monthsMatch[1]) : 6;
    const { subject, html } = buildGiftVoucherEmail({
      subject: 'membership',
      recipientName: recipient.first_name || '',
      giverName,
      giverMessage,
      months,
    });
    emailResult = await require('../utils/emailService').sendEmail({ to: recipient.email, subject, html });
  }

  res.json({
    success: true,
    membershipId: membership.id,
    recipient: { id: recipient.id, email: recipient.email, name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() },
    emailed: doSend ? emailResult.success === true : false,
    emailError: doSend && emailResult.success === false ? emailResult.error : undefined,
  });
}));

// Get class notes (admin)
app.get('/api/admin/classes/:classId/notes', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { data } = await supabaseDb.supabase
    .from('instructor_notes')
    .select('*, customers!instructor_notes_instructor_id_fkey(first_name, last_name)')
    .eq('class_instance_id', parseInt(classId))
    .order('created_at', { ascending: false });
  res.json({ notes: data || [] });
}));

// Save class note (admin)
app.post('/api/admin/classes/:classId/notes', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { content } = req.body;
  const { dbCustomerId } = req.user;

  if (!content?.trim()) return res.status(400).json({ error: 'Note content required' });

  // Check if there's an existing class note to update
  const { data: existing } = await supabaseDb.supabase
    .from('instructor_notes')
    .select('id')
    .eq('class_instance_id', parseInt(classId))
    .eq('note_type', 'class')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabaseDb.supabase
      .from('instructor_notes')
      .update({ content: content.trim(), updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Failed to update note' });
    return res.json({ note: data });
  }

  const { data, error } = await supabaseDb.supabase
    .from('instructor_notes')
    .insert({
      instructor_id: dbCustomerId,
      class_instance_id: parseInt(classId),
      note_type: 'class',
      content: content.trim()
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to save note' });
  res.json({ note: data });
}));

// Get student's waitlist entries (admin)
app.get('/api/admin/students/:studentId/waitlist', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const { data, error } = await supabaseDb.supabase
    .from('waitlist')
    .select(`
      id, position, joined_at, claimed,
      class_instances!waitlist_class_instance_id_fkey (
        id, class_type, class_date, start_time, end_time, instructor
      )
    `)
    .eq('student_id', parseInt(studentId))
    .eq('claimed', false)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('Error fetching student waitlist:', error);
    return res.status(500).json({ error: 'Failed to fetch waitlist' });
  }

  const waitlistEntries = (data || []).map(w => ({
    id: w.id,
    position: w.position,
    classDate: w.class_instances?.class_date,
    classType: w.class_instances?.class_type,
    startTime: w.class_instances?.start_time,
    endTime: w.class_instances?.end_time,
    instructor: w.class_instances?.instructor,
    classInstanceId: w.class_instances?.id,
  }));

  res.json({ waitlistEntries });
}));

app.get('/api/admin/students/:studentId/fees', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const { data: fees, error } = await supabaseDb.supabase
    .from('reschedule_fees')
    .select('*, bookings(id, class_instances!bookings_class_instance_id_fkey(class_date, start_time, class_type))')
    .eq('student_id', studentId)
    .order('fee_date', { ascending: false });

  if (error) throw error;

  res.json({ fees: fees || [] });
}));

// Update fee payment status
app.patch('/api/admin/fees/:feeId/payment', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { feeId } = req.params;
  const { paymentStatus } = req.body;

  if (!['pending', 'paid', 'waived'].includes(paymentStatus)) {
    return res.status(400).json({ error: 'Invalid payment status' });
  }

  // Waiving a fee = forgiving it. If VES Credit was auto-applied to offset it,
  // refund that credit — otherwise the spend transaction is orphaned and the
  // customer's balance goes negative. (Same reasoning as fee deletion.)
  if (paymentStatus === 'waived') {
    const { data: refunded, error: refundError } = await supabaseDb.supabase
      .from('credit_transactions')
      .delete()
      .eq('type', 'spend')
      .eq('source', 'reschedule_fee')
      .eq('reference_id', String(feeId))
      .select();
    if (refundError) throw refundError;
    if (refunded && refunded.length) {
      const total = refunded.reduce((s, r) => s + Number(r.amount), 0);
      console.log(`💰 Refunded $${total} VES Credit on waiving reschedule fee ${feeId}`);
    }
  }

  const { data: fee, error } = await supabaseDb.supabase
    .from('reschedule_fees')
    .update({
      payment_status: paymentStatus,
      payment_date: paymentStatus === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', feeId)
    .select()
    .single();

  if (error) throw error;

  res.json({ message: 'Fee payment status updated', fee });
}));

app.delete('/api/admin/fees/:feeId', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { feeId } = req.params;

  // Reverse any VES Credit that was auto-applied to offset this fee. Deleting a
  // fee = waiving it, so the credit it consumed must be refunded — otherwise the
  // spend transaction is orphaned and the customer's balance goes negative.
  const { data: refunded, error: refundError } = await supabaseDb.supabase
    .from('credit_transactions')
    .delete()
    .eq('type', 'spend')
    .eq('source', 'reschedule_fee')
    .eq('reference_id', String(feeId))
    .select();

  if (refundError) throw refundError;
  if (refunded && refunded.length) {
    const total = refunded.reduce((s, r) => s + Number(r.amount), 0);
    console.log(`💰 Refunded $${total} VES Credit on deletion of reschedule fee ${feeId}`);
  }

  const { error } = await supabaseDb.supabase
    .from('reschedule_fees')
    .delete()
    .eq('id', feeId);

  if (error) throw error;

  res.json({ message: 'Fee deleted successfully' });
}));

// ── Cohort Dates endpoints ──────────────────────────────────────────────

// ── Cohort Periods (WT reschedule windows) ────────────────────────────
// Simple date ranges. WT students can reschedule to any WT class within
// the same cohort period their original class falls in.

app.get('/api/admin/cohort-periods', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { data, error } = await supabaseDb.supabase
    .from('cohort_periods')
    .select('*')
    .order('start_date', { ascending: true });
  if (error) throw error;
  res.json({ periods: data || [] });
}));

app.post('/api/admin/cohort-periods', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { name, startDate, endDate } = req.body;
  if (!name || !startDate || !endDate) {
    return res.status(400).json({ error: 'name, startDate and endDate are required' });
  }
  const { data, error } = await supabaseDb.supabase
    .from('cohort_periods')
    .insert({ name, start_date: startDate, end_date: endDate })
    .select()
    .single();
  if (error) throw error;
  res.json({ period: data });
}));

app.put('/api/admin/cohort-periods/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, startDate, endDate } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (startDate !== undefined) updates.start_date = startDate;
  if (endDate !== undefined) updates.end_date = endDate;
  const { data, error } = await supabaseDb.supabase
    .from('cohort_periods')
    .update(updates)
    .eq('id', parseInt(id))
    .select()
    .single();
  if (error) throw error;
  res.json({ period: data });
}));

app.delete('/api/admin/cohort-periods/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { error } = await supabaseDb.supabase
    .from('cohort_periods')
    .delete()
    .eq('id', parseInt(req.params.id));
  if (error) throw error;
  res.json({ message: 'Cohort period deleted' });
}));

// Public endpoint for the student reschedule flow to look up cohort period
app.get('/api/cohort-period-for-date', authenticateToken, asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required' });
  const { data, error } = await supabaseDb.supabase
    .from('cohort_periods')
    .select('*')
    .lte('start_date', date)
    .gte('end_date', date)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  res.json({ period: data || null });
}));

app.get('/api/admin/customers/:customerId/pieces', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  const customer = await supabaseDb.findCustomerByShopifyId(customerId);

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const pieces = await supabaseDb.getPotteryPiecesByCustomerId(customer.id);

  const formattedPieces = pieces.map(piece => ({
    id: piece.id.toString(),
    title: piece.title,
    description: piece.notes,
    clay_type: piece.clay_type,
    glaze: piece.glazes[0] || '',
    glazes: piece.glazes,
    firing_temp: '',
    dimensions: piece.height && piece.width && piece.length
      ? `${piece.height}" H x ${piece.width}" W x ${piece.length}" L`
      : '',
    date_completed: new Date(piece.date_completed).toISOString().split('T')[0],
    images: piece.images,
    tags: piece.tags,
    student_notes: piece.notes,
    instructor_notes: '',
    is_public: piece.is_public
  }));

  res.json({ pieces: formattedPieces });
}));

// Update customer (student) info
app.put('/api/admin/customers/:customerId', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const updateData = req.body;

  const updatedCustomer = await supabaseDb.updateCustomer(parseInt(customerId), {
    firstName: updateData.first_name,
    lastName: updateData.last_name,
    email: updateData.email,
    customerType: updateData.customer_type,
    classesAllocated: updateData.classes_allocated,
    classesUsed: updateData.classes_used
  });

  res.json({
    success: true,
    customer: {
      id: updatedCustomer.id,
      firstName: updatedCustomer.first_name,
      lastName: updatedCustomer.last_name,
      email: updatedCustomer.email,
      customerType: updatedCustomer.customer_type
    }
  });
}));

// Get all pottery pieces for admin gallery view
app.get('/api/admin/pottery/all', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const allPieces = await supabaseDb.getAllPotteryPieces();

  const formattedPieces = allPieces.map(piece => ({
    id: piece.id.toString(),
    title: piece.title,
    description: piece.notes,
    clay_type: piece.clay_type,
    glazes: piece.glazes,
    height: piece.height?.toString(),
    width: piece.width?.toString(),
    length: piece.length?.toString(),
    date_completed: new Date(piece.date_completed).toISOString().split('T')[0],
    images: piece.images,
    tags: piece.tags,
    is_public: piece.is_public,
    featured: piece.featured,
    studentId: piece.customer_id,
    studentName: piece.customer
      ? `${piece.customer.first_name} ${piece.customer.last_name}`.trim()
      : 'Unknown Student',
    studentEmail: piece.customer?.email || ''
  }));

  res.json({ pieces: formattedPieces });
}));

// Toggle piece public status
app.put('/api/admin/pottery/:id/toggle-public', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const piece = await supabaseDb.getPotteryPieceById(parseInt(id));

  if (!piece) {
    return res.status(404).json({ error: 'Pottery piece not found' });
  }

  const updatedPiece = await supabaseDb.updatePotteryPiece(parseInt(id), {
    isPublic: !piece.is_public
  });

  res.json({
    success: true,
    isPublic: updatedPiece.is_public,
    message: `Piece ${updatedPiece.is_public ? 'published' : 'unpublished'}`
  });
}));

// Toggle piece featured status
app.put('/api/admin/pottery/:id/toggle-featured', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const piece = await supabaseDb.getPotteryPieceById(parseInt(id));

  if (!piece) {
    return res.status(404).json({ error: 'Pottery piece not found' });
  }

  const updatedPiece = await supabaseDb.updatePotteryPiece(parseInt(id), {
    featured: !piece.featured
  });

  res.json({
    success: true,
    featured: updatedPiece.featured,
    message: `Piece ${updatedPiece.featured ? 'featured' : 'unfeatured'}`
  });
}));

// Create clay type
app.post('/api/admin/clay-types', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { name, description, active } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Clay type name is required' });
  }

  const clayType = await supabaseDb.createClayType({
    name,
    description: description || null,
    active: active !== undefined ? active : true
  });

  res.json({ success: true, clayType });
}));

// Update clay type
app.put('/api/admin/clay-types/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, active } = req.body;

  const clayType = await supabaseDb.updateClayType(parseInt(id), {
    name,
    description,
    active
  });

  res.json({ success: true, clayType });
}));

// Delete clay type
app.delete('/api/admin/clay-types/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await supabaseDb.deleteClayType(parseInt(id));
  res.json({ success: true, message: 'Clay type deleted' });
}));

const { upload, uploadImageToSupabase } = require('../utils/imageUpload');

// Upload clay type image
app.post('/api/admin/clay-types/:id/image', authenticateToken, requireAdmin, upload.single('image'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });

  const { url } = await uploadImageToSupabase(req.file.buffer, req.file.originalname, req.file.mimetype, 'clay-types');

  await supabaseDb.supabase
    .from('clay_types')
    .update({ image_url: url })
    .eq('id', parseInt(id));

  res.json({ success: true, image_url: url });
}));

// Get flex credits for a student (from any 10-class package enrollment).
// number_of_weeks is normally 10, but admins can bump it (e.g. 12) to grant
// extra flex credits, so we accept >=10 and prefer the active enrollment.
app.get('/api/admin/students/:studentId/flex-credits', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { data: enrollments } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id, number_of_weeks, class_credits_allocated, status, created_at')
    .eq('student_id', parseInt(studentId))
    .gte('number_of_weeks', 10)
    .order('created_at', { ascending: false });

  const pkg = (enrollments || []).find(e => e.status === 'active' && e.class_credits_allocated > 0)
           || (enrollments || []).find(e => e.class_credits_allocated > 0)
           || (enrollments || [])[0];
  if (!pkg) {
    return res.json({ remaining: 0, allocated: 0, used: 0, enrollmentId: null });
  }
  // Compute from bookings — never trust stale DB columns
  const credits = await supabaseDb.getEnrollmentCredits(pkg.id);
  res.json({
    remaining: credits.remaining,
    allocated: credits.allocated,
    used: credits.committed,
    enrollmentId: pkg.id,
  });
}));

// Create glaze
app.post('/api/admin/glazes', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { name, description, color, cone, active, glaze_type, stock_status } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Glaze name is required' });
  }

  const glaze = await supabaseDb.createGlaze({
    name,
    description: description || null,
    color: color || null,
    cone: cone || null,
    active: active !== undefined ? active : true,
    glaze_type: glaze_type || 'glaze',
    stock_status: stock_status || 'in_stock'
  });

  res.json({ success: true, glaze });
}));

// Update glaze
app.put('/api/admin/glazes/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, color, cone, active, glaze_type, stock_status } = req.body;

  const glaze = await supabaseDb.updateGlaze(parseInt(id), {
    name,
    description,
    color,
    cone,
    active,
    glaze_type,
    stock_status
  });

  res.json({ success: true, glaze });
}));

// Upload glaze image
app.post('/api/admin/glazes/:id/image', authenticateToken, requireAdmin, upload.single('image'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });

  const { url } = await uploadImageToSupabase(req.file.buffer, req.file.originalname, req.file.mimetype, `glazes`);

  await supabaseDb.supabase
    .from('glazes')
    .update({ image_url: url })
    .eq('id', parseInt(id));

  res.json({ success: true, image_url: url });
}));

// Delete glaze
app.delete('/api/admin/glazes/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await supabaseDb.deleteGlaze(parseInt(id));
  res.json({ success: true, message: 'Glaze deleted' });
}));

// Get all memberships
app.get('/api/admin/memberships', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const memberships = await supabaseDb.getAllMemberships();

  const formattedMemberships = memberships.map(m => ({
    id: m.id,
    type: m.membership_type,
    status: m.status,
    startDate: m.start_date,
    endDate: m.end_date,
    purchaseDate: m.purchase_date,
    perks: m.perks,
    studentId: m.customer_id,
    studentName: m.customer
      ? `${m.customer.first_name} ${m.customer.last_name}`.trim()
      : 'Unknown',
    studentEmail: m.customer?.email || ''
  }));

  res.json({ memberships: formattedMemberships });
}));

// Create membership
app.post('/api/admin/memberships', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { customerId, membershipType, startDate, endDate, perks } = req.body;

  if (!customerId || !membershipType || !startDate || !endDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const membership = await supabaseDb.createMembership({
    customerId: parseInt(customerId),
    membershipType,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    perks: perks || {},
    status: 'active'
  });

  // Update customer_type after membership creation
  await supabaseDb.updateSingleCustomerType(parseInt(customerId));

  // Push term markers to the studio Google Calendar (fire-and-forget).
  if (membership?.id) {
    require('../utils/calendarSync').syncMembership(membership.id).catch(() => {});
  }

  res.json({ success: true, membership });
}));

// Update membership
app.put('/api/admin/memberships/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { membershipType, startDate, endDate, status, perks } = req.body;

  const membership = await supabaseDb.updateMembership(parseInt(id), {
    membershipType,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    status,
    perks
  });

  // Update customer_type after membership change
  if (membership.customer_id) {
    await supabaseDb.updateSingleCustomerType(membership.customer_id);
  }

  // Refresh calendar term markers — dates/type/status may have changed
  // (syncMembership removes the markers if it's no longer active).
  require('../utils/calendarSync').syncMembership(parseInt(id)).catch(() => {});

  res.json({ success: true, membership });
}));

// Activate a pending (reserved) membership — starts the term on the member's
// first studio visit. Sets start_date (defaults to today), end_date = start + N
// months (parsed from the membership type), and status = active.
app.post('/api/admin/memberships/:id/activate', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { startDate } = req.body || {};

  const { data: existing, error: fetchErr } = await supabaseDb.supabase
    .from('memberships')
    .select('id, customer_id, membership_type')
    .eq('id', parseInt(id))
    .single();
  if (fetchErr || !existing) {
    return res.status(404).json({ error: 'Membership not found' });
  }

  const monthsMatch = (existing.membership_type || '').match(/(\d+)/);
  const months = monthsMatch ? parseInt(monthsMatch[1]) : 6;

  // Anchor the term to the chosen start date (default: today in SGT). All math
  // is done on UTC-constructed dates so a plain YYYY-MM-DD never shifts a day
  // due to the server's timezone.
  const sgtTodayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().split('T')[0];
  const startStr = /^\d{4}-\d{2}-\d{2}$/.test(startDate || '') ? startDate : sgtTodayStr;
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const end = new Date(Date.UTC(sy, sm - 1, sd));
  end.setUTCMonth(end.getUTCMonth() + months);
  const endStr = end.toISOString().split('T')[0];

  const membership = await supabaseDb.updateMembership(parseInt(id), {
    startDate: startStr,
    endDate: endStr,
    status: 'active',
  });

  // Keep customer_type in sync (pending → active is still a member).
  if (existing.customer_id) {
    await supabaseDb.updateSingleCustomerType(existing.customer_id);
  }

  // Now that the term has real dates, drop the START/END markers on the
  // studio Google Calendar (fire-and-forget).
  require('../utils/calendarSync').syncMembership(parseInt(id)).catch(() => {});

  res.json({ success: true, membership });
}));

// Delete membership
app.delete('/api/admin/memberships/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Get membership to know customer_id before deleting
  const { data: memToDelete } = await supabaseDb.supabase
    .from('memberships')
    .select('customer_id')
    .eq('id', parseInt(id))
    .single();
  // Remove the calendar term markers before the row (and its event ids) is gone.
  await require('../utils/calendarSync').deleteMembershipEvents(parseInt(id));
  await supabaseDb.deleteMembership(parseInt(id));
  // Update customer_type after deletion
  if (memToDelete?.customer_id) {
    await supabaseDb.updateSingleCustomerType(memToDelete.customer_id);
  }
  res.json({ success: true, message: 'Membership deleted' });
}));

// ============================================
// CALENDAR INTEGRATION
// ============================================

app.get('/api/classes/bookings/:bookingId/calendar', authenticateToken, asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { dbCustomerId } = req.user;

  const booking = await supabaseDb.getBookingById(parseInt(bookingId));

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (booking.student_id !== dbCustomerId) {
    return res.status(403).json({ error: 'This booking does not belong to you' });
  }

  const classInstance = await supabaseDb.getClassInstanceById(booking.class_instance_id);

  // Convert to format expected by generateICS
  const formattedBooking = {
    id: booking.id,
    studentId: booking.student_id,
    classInstanceId: booking.class_instance_id,
    status: booking.status
  };

  const formattedClass = {
    id: classInstance.id,
    classDate: classInstance.class_date,
    startTime: classInstance.start_time,
    endTime: classInstance.end_time,
    classType: classInstance.class_type,
    instructor: classInstance.instructor,
    room: classInstance.room
  };

  const icsContent = generateICS(formattedBooking, formattedClass, req.user);

  const filename = `ves-pottery-class-${booking.id}.ics`;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  res.send(icsContent);
}));

app.get('/api/classes/my-bookings/calendar', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;

  const bookings = await supabaseDb.getStudentBookings(dbCustomerId);

  const today = new Date();
  const futureBookings = bookings.filter(b =>
    b.status === 'booked' && new Date(b.class_instance.class_date) >= today
  );

  if (futureBookings.length === 0) {
    return res.status(404).json({ error: 'No upcoming bookings found' });
  }

  const bookingsWithClasses = futureBookings.map(booking => ({
    booking: {
      id: booking.id,
      studentId: booking.student_id,
      classInstanceId: booking.class_instance_id,
      status: booking.status
    },
    classInstance: {
      id: booking.class_instance.id,
      classDate: booking.class_instance.class_date,
      startTime: booking.class_instance.start_time,
      endTime: booking.class_instance.end_time,
      classType: booking.class_instance.class_type,
      instructor: booking.class_instance.instructor,
      room: booking.class_instance.room
    }
  }));

  const icsContent = generateMultipleICS(bookingsWithClasses, req.user);

  const filename = `ves-pottery-classes-all.ics`;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  res.send(icsContent);
}));

// ============================================

// ============================================
// COURSE EMAIL ENDPOINTS
// ============================================

const { sendAndLogEmail, detectCourseTemplate, detectStudentTemplate } = require('../utils/emailService');

// Helper: format date as "14 March" style
function formatDateNice(dateStr) {
  if (!dateStr) return '—';
  const cleaned = String(dateStr).split(/[T ]/)[0];
  const d = new Date(cleaned + 'T12:00:00');
  if (isNaN(d.getTime())) return '—';
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// Helper: get day of week from date string
function getDayOfWeek(dateStr) {
  if (!dateStr) return '';
  const cleaned = String(dateStr).split('T')[0];
  const d = new Date(cleaned + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return days[d.getDay()];
}

// Helper: parse start date from course identifier
// e.g. WT1104PM_DL6 → 11 Apr (day=11, month=04), WT0503NT_JL6 → 05 Mar
function parseStartDateFromIdentifier(courseId) {
  const match = courseId.match(/^(?:WT|HB)(\d{2})(\d{2})/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = new Date().getFullYear();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day} ${months[month - 1]} ${year}`;
}

// Helper: format time slot from start_time/end_time
function formatTimeSlot(startTime, endTime) {
  if (!startTime || !endTime) return '';
  const fmt = (t) => {
    const s = String(t).trim();
    // Handle "1:00 PM" / "9:30 AM" format
    const ampmMatch = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10);
      const m = parseInt(ampmMatch[2], 10);
      const isPM = ampmMatch[3].toUpperCase() === 'PM';
      if (isPM && h < 12) h += 12;
      if (!isPM && h === 12) h = 0;
      const ampm = h >= 12 ? 'pm' : 'am';
      const hr = h % 12 || 12;
      return m === 0 ? `${hr}${ampm}` : `${hr}:${String(m).padStart(2,'0')}${ampm}`;
    }
    // Handle "13:00:00" / "13:00" 24h format
    const parts = s.split(':').map(Number);
    const h = parts[0], m = parts[1] || 0;
    if (isNaN(h)) return '';
    const ampm = h >= 12 ? 'pm' : 'am';
    const hr = h % 12 || 12;
    return m === 0 ? `${hr}${ampm}` : `${hr}:${String(m).padStart(2,'0')}${ampm}`;
  };
  return `${fmt(startTime)} – ${fmt(endTime)}`;
}

// 1. List upcoming courses with email send status
app.get('/api/admin/course-emails', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  // Use Singapore timezone (UTC+8) for date calculations
  const now = new Date();
  const sgtNow = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  const today = sgtNow.toISOString().split('T')[0];
  const in14Days = new Date(sgtNow.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Find any course that has at least one class today or in the future — this
  // catches both upcoming courses and courses currently in progress. Courses
  // whose last class has passed naturally have no future class_instances and
  // will be excluded. We look ahead 90 days to cover long cohorts.
  const in90Days = new Date(sgtNow.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { data: classes, error: classError } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, end_time')
    .gte('class_date', today)
    .lte('class_date', in90Days)
    .order('class_date', { ascending: true });

  if (classError) throw classError;

  // Group by base course identifier
  const courseMap = {};
  for (const cls of (classes || [])) {
    const baseId = cls.class_type.split('.')[0];
    // Skip HB courses — their emails are sent automatically on enrollment
    if (baseId.startsWith('HB')) continue;
    if (!courseMap[baseId]) {
      courseMap[baseId] = {
        courseIdentifier: baseId,
        courseType: 'Wheelthrowing',
        classDates: [],
        startTime: cls.start_time,
        endTime: cls.end_time,
      };
    }
    courseMap[baseId].classDates.push(cls.class_date);
  }

  // For each course, compute its true start/end dates from ALL class_instances
  // (not just the lookahead window above). Scope to the last 6 months so
  // prior-year cohorts with the same year-less identifier don't leak in.
  const sixMonthsAgo = new Date(sgtNow.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const courses = [];
  for (const [courseId, course] of Object.entries(courseMap)) {
    const { data: allCourseClasses } = await supabaseDb.supabase
      .from('class_instances')
      .select('class_date')
      .like('class_type', `${courseId}%`)
      .gte('class_date', sixMonthsAgo)
      .order('class_date', { ascending: true });

    const allDates = (allCourseClasses || []).map(c => String(c.class_date).split('T')[0]);
    const firstClassDate = allDates[0];
    const lastClassDate = allDates[allDates.length - 1];

    // Skip courses whose last class has already passed. We want to keep
    // showing a course until it has fully ended so students can still receive
    // reminder emails mid-cohort.
    if (lastClassDate && lastClassDate < today) {
      continue;
    }

    // Student count comes from course_enrollments — this is the source of
    // truth for "who is enrolled in the course". Booking status can change
    // (completed/rescheduled) without affecting enrollment, so counting
    // bookings on week 1 gave inconsistent numbers after attendance marking
    // or reschedules.
    let studentCount = 0;
    {
      const { count } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('*', { count: 'exact', head: true })
        .like('course_identifier', `${courseId}%`)
        .in('status', ['active', 'pending', 'upcoming']);
      studentCount = count || 0;
    }

    // Get enrollment for number_of_weeks
    const { data: sampleEnrollment } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('number_of_weeks')
      .like('course_identifier', `${courseId}%`)
      .limit(1)
      .single();

    // Check if email was sent
    const { data: sentEmail } = await supabaseDb.supabase
      .from('sent_emails')
      .select('sent_at')
      .eq('email_type', 'course_details')
      .eq('course_identifier', courseId)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const emailSentAt = sentEmail?.sent_at || null;

    // If the course has already started and the course-details email was
    // never sent, hide it — the initial email is only meaningful before the
    // course begins. Courses with a sent email stay visible until they end
    // so the "Sent" status remains visible mid-cohort.
    if (!emailSentAt && firstClassDate && firstClassDate <= today) {
      continue;
    }

    const fmtDate = (d) => {
      if (!d) return '';
      // Handle both "2026-04-11" and "2026-04-11T00:00:00" formats
      const dateStr = String(d).split('T')[0];
      const dt = new Date(dateStr + 'T12:00:00');
      if (isNaN(dt.getTime())) return '';
      return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    courses.push({
      courseIdentifier: courseId,
      courseType: course.courseType,
      numberOfWeeks: sampleEnrollment?.number_of_weeks || allDates.length,
      startDate: firstClassDate ? fmtDate(firstClassDate) : parseStartDateFromIdentifier(courseId) || '—',
      endDate: lastClassDate ? fmtDate(lastClassDate) : '—',
      firstClassDate: firstClassDate || null,
      lastClassDate: lastClassDate || null,
      timeSlot: formatTimeSlot(course.startTime, course.endTime) || (courseId.includes('PM') ? '1pm – 3pm' : courseId.includes('AM') ? '9:30am – 12pm' : courseId.includes('NT') ? '7pm – 9:30pm' : ''),
      studentCount: studentCount || 0,
      emailSentAt,
    });
  }

  res.json({ courses });
}));

// 2. Generate email draft from template + DB data
app.get('/api/admin/course-emails/:courseId/draft', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  // Get students from course_enrollments — enrollment is the source of truth
  // for "who is in the course" (booking statuses like completed/rescheduled
  // don't change enrollment).
  let students = [];
  const { data: studentEnrollments, error: enrollError } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('student_id, course_title, course_type, number_of_weeks, package_total_classes, package_total_courses, customers(id, first_name, last_name, email)')
    .like('course_identifier', `${courseId}%`)
    .in('status', ['active', 'pending', 'upcoming']);

  if (enrollError) throw enrollError;
  if (!studentEnrollments || studentEnrollments.length === 0) {
    return res.status(404).json({ error: 'No students found for this course' });
  }

  // Dedupe by student_id in case of duplicate enrollments. Each student's
  // templateType comes from THEIR enrollment (package-aware), not the cohort
  // sample — 10-Class and 3x6-week package students share the cohort but get
  // a different course-details email.
  const seen = new Set();
  students = studentEnrollments
    .filter(e => e.customers && !seen.has(e.student_id) && seen.add(e.student_id))
    .map(e => ({
      id: e.customers.id,
      firstName: e.customers.first_name,
      lastName: e.customers.last_name,
      email: e.customers.email,
      name: `${e.customers.first_name} ${e.customers.last_name}`.trim(),
      templateType: detectStudentTemplate(e),
    }));

  // Get a sample enrollment for template detection
  const { data: enrollments } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .like('course_identifier', `${courseId}%`)
    .limit(1)
    .maybeSingle();

  // Get class instances
  const { data: classInstances, error: classError } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, end_time')
    .like('class_type', `${courseId}%`)
    .order('class_date', { ascending: true });

  if (classError) throw classError;

  const classDates = (classInstances || []).map(c => String(c.class_date).split(/[T ]/)[0]).sort();
  const startDate = classDates[0] || null;
  const endDate = classDates[classDates.length - 1] || null;
  const firstClass = (classInstances || [])[0] || null;

  // Calculate collection/disposal dates (only if we have class dates)
  let collectionStartDate = null;
  let disposalDate = null;
  if (endDate) {
    const lastClassDate = new Date(endDate + 'T00:00:00');
    collectionStartDate = new Date(lastClassDate);
    collectionStartDate.setMonth(collectionStartDate.getMonth() + 1);
    disposalDate = new Date(collectionStartDate);
    disposalDate.setMonth(disposalDate.getMonth() + 3);
  }

  // Detect template type from sample enrollment (enrollments is a single object from maybeSingle)
  const templateType = enrollments ? detectCourseTemplate(enrollments) : 'wt-6week';

  const timeSlot = firstClass ? formatTimeSlot(firstClass.start_time, firstClass.end_time)
    : (courseId.includes('PM') ? '1pm – 3:30pm' : courseId.includes('AM') ? '9:30am – 12pm' : courseId.includes('NT') ? '7pm – 9:30pm' : '');
  const dayOfWeek = startDate ? getDayOfWeek(startDate) : '';

  // Use identifier-parsed date as fallback when no class instances exist
  const displayStartDate = startDate ? formatDateNice(startDate) : parseStartDateFromIdentifier(courseId) || '—';
  const displayEndDate = endDate ? formatDateNice(endDate) : '—';

  res.json({
    courseIdentifier: courseId,
    templateType,
    dayOfWeek,
    startDate: displayStartDate,
    endDate: displayEndDate,
    timeSlot,
    collectionStart: collectionStartDate ? formatDateNice(collectionStartDate.toISOString().split('T')[0]) : '',
    collectionEnd: collectionStartDate ? formatDateNice(collectionStartDate.toISOString().split('T')[0]) : '',
    disposalDate: disposalDate ? formatDateNice(disposalDate.toISOString().split('T')[0]) : '',
    holidayExclusions: '',
    specialNotes: '',
    students,
    classDates: classDates.map(d => formatDateNice(d)),
  });
}));

// Template types live as files in email-templates/courses/. The name arrives from
// the client and is used to build a require() path, so it is matched against the
// directory listing rather than interpolated straight in.
const COURSE_TEMPLATE_DIR = require('path').join(__dirname, '../email-templates/courses');
function listCourseTemplateTypes() {
  return require('fs').readdirSync(COURSE_TEMPLATE_DIR)
    .filter(f => f.endsWith('.js'))
    .map(f => f.slice(0, -3));
}

// Outside production the module cache is dropped first, so editing a template
// file and reloading the admin preview shows the new copy without a restart.
function loadCourseTemplate(type) {
  if (!listCourseTemplateTypes().includes(type)) return null;
  const resolved = require.resolve(`../email-templates/courses/${type}`);
  if (process.env.NODE_ENV !== 'production') delete require.cache[resolved];
  return require(resolved);
}

function buildCourseEmailFields(body) {
  return {
    dayOfWeek: body.dayOfWeek,
    startDate: body.startDate,
    endDate: body.endDate,
    timeSlot: body.timeSlot,
    holidayExclusions: body.holidayExclusions || '',
    collectionStart: body.collectionStart,
    collectionEnd: body.collectionEnd,
    disposalDate: body.disposalDate,
    specialNotes: body.specialNotes || '',
  };
}

// Segment recipients and render each group's email. Shared by the preview and
// send endpoints so a preview can never show a different email from the one that
// actually goes out. Returns { groups } or { error } for an unknown template.
async function buildCourseEmailGroups(courseId, body) {
  const { templateType, recipientEmails } = body;

  // Segment recipients by THEIR OWN enrollment, re-derived from the DB — never
  // trust client-posted segmentation. Package students (10-Class, 3x6-week)
  // share the cohort but receive a package-specific course-details email.
  const { data: segEnrollments } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('course_title, course_type, number_of_weeks, package_total_classes, package_total_courses, customers(email)')
    .like('course_identifier', `${courseId}%`)
    .in('status', ['active', 'pending', 'upcoming']);

  const templateByEmail = new Map();
  for (const e of (segEnrollments || [])) {
    if (e.customers?.email) templateByEmail.set(e.customers.email.toLowerCase(), detectStudentTemplate(e));
  }

  // Fallback for recipients with no enrollment match: the posted templateType,
  // with the original safety net — the package templates are only ever sent to
  // students whose own enrollment proves the package, never as a blanket type.
  let fallbackType = templateType;
  if (fallbackType === 'wt-10class' || fallbackType === 'wt-3x6week') {
    console.warn(`[course-email] Blocked blanket ${fallbackType} for ${courseId} → coerced to wt-6week`);
    fallbackType = 'wt-6week';
  }

  const byType = new Map(); // templateType -> [emails]
  for (const email of recipientEmails) {
    const type = templateByEmail.get(String(email).toLowerCase()) || fallbackType;
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(email);
  }

  const templateFields = buildCourseEmailFields(body);

  const groups = [];
  for (const [type, emails] of byType) {
    const template = loadCourseTemplate(type);
    if (!template) return { error: `Unknown template type: ${type}` };
    const { subject, html } = template.generate(templateFields);
    groups.push({ templateType: type, emails, subject, html });
  }
  return { groups };
}

// 3a. Preview the course detail email(s) — renders the real template files, so
// what the admin reads here is byte-for-byte what send would deliver.
app.post('/api/admin/course-emails/:courseId/preview', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { templateType, recipientEmails } = req.body;

  if (!templateType) {
    return res.status(400).json({ error: 'templateType is required' });
  }

  // No recipients means the admin is checking copy, not a cohort. Render the
  // requested template as-is: the anti-blanket coercion guards sends, and
  // nothing is being sent here, so it would only hide the package templates.
  if (!recipientEmails || recipientEmails.length === 0) {
    const template = loadCourseTemplate(templateType);
    if (!template) return res.status(400).json({ error: `Unknown template type: ${templateType}` });
    const { subject, html } = template.generate(buildCourseEmailFields(req.body));
    return res.json({ groups: [{ templateType, recipientCount: 0, recipientEmails: [], subject, html }] });
  }

  const { groups, error } = await buildCourseEmailGroups(courseId, req.body);
  if (error) return res.status(400).json({ error });

  res.json({
    groups: groups.map(g => ({
      templateType: g.templateType,
      recipientCount: g.emails.length,
      recipientEmails: g.emails,
      subject: g.subject,
      html: g.html,
    })),
  });
}));

// 3. Send course detail email
app.post('/api/admin/course-emails/:courseId/send', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { templateType, recipientEmails } = req.body;

  if (!templateType || !recipientEmails || recipientEmails.length === 0) {
    return res.status(400).json({ error: 'templateType and recipientEmails are required' });
  }

  const { groups, error } = await buildCourseEmailGroups(courseId, req.body);
  if (error) return res.status(400).json({ error });

  const sends = [];
  const failures = [];
  for (const { templateType: type, emails, subject, html } of groups) {
    const result = await sendAndLogEmail({
      emailType: 'course_details',
      courseIdentifier: courseId,
      subject,
      html,
      recipientEmails: emails,
      sentBy: req.user.email,
    });

    if (result.success) {
      sends.push({ templateType: type, count: emails.length, messageId: result.messageId });
    } else {
      failures.push({ templateType: type, count: emails.length, error: result.error });
    }
  }

  if (sends.length === 0) {
    return res.status(500).json({ error: 'Failed to send email', details: failures.map(f => f.error).join('; ') });
  }

  res.json({ success: failures.length === 0, sends, failures });
}));

// 4. Email send history
app.get('/api/admin/course-emails/history', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { data: emails, error } = await supabaseDb.supabase
    .from('sent_emails')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  res.json({ emails: emails || [] });
}));

// ============================================

// Course config CRUD
app.get('/api/admin/course-config', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  await courseConfig.ensureLoaded();
  const configs = courseConfig.getAllConfigs();
  res.json(configs);
}));

app.put('/api/admin/course-config/:key', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { key } = req.params;
  const updates = req.body;

  delete updates.id;
  delete updates.course_type_key;
  delete updates.created_at;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseDb.supabase
    .from('course_config')
    .update(updates)
    .eq('course_type_key', key)
    .select()
    .single();

  if (error) throw error;

  await courseConfig.refreshConfig();
  res.json(data);
}));

app.post('/api/admin/course-config', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const config = req.body;

  if (!config.course_type_key || !config.display_name || !config.category) {
    return res.status(400).json({ error: 'Missing required fields: course_type_key, display_name, category' });
  }

  config.created_at = new Date().toISOString();
  config.updated_at = new Date().toISOString();

  const { data, error } = await supabaseDb.supabase
    .from('course_config')
    .insert(config)
    .select()
    .single();

  if (error) throw error;

  await courseConfig.refreshConfig();
  res.json(data);
}));

// ── Student Management for Upcoming Courses ─────────────────────────────

// Get students booked in a course (from bookings on first class instance)
app.get('/api/admin/course-emails/:courseId/students', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const { data: firstInst } = await supabaseDb.supabase
    .from('class_instances')
    .select('id')
    .eq('class_type', `${courseId}.1`)
    .limit(1)
    .maybeSingle();

  if (!firstInst) {
    return res.json({ students: [] });
  }

  const { data: bookings } = await supabaseDb.supabase
    .from('bookings')
    .select('id, student_id, status, booking_type, customers(id, first_name, last_name, email)')
    .eq('class_instance_id', firstInst.id)
    .in('status', ['booked', 'attended']);

  const seen = new Set();
  const students = (bookings || [])
    .filter(b => b.customers && !seen.has(b.student_id) && seen.add(b.student_id))
    .map(b => ({
      id: b.customers.id,
      firstName: b.customers.first_name,
      lastName: b.customers.last_name,
      email: b.customers.email,
    }));

  res.json({ students });
}));

// Get available courses for moving a student
app.get('/api/admin/available-courses', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { type, excludeCourse } = req.query;

  // Get future class instances grouped by base course identifier
  const today = new Date().toISOString().split('T')[0];
  const { data: classes } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, end_time, instructor, current_enrollment, max_capacity, status')
    .gte('class_date', today)
    .neq('status', 'cancelled')
    .order('class_date', { ascending: true });

  // Group by base course identifier (strip .N suffix)
  const courseMap = {};
  (classes || []).forEach(c => {
    const base = c.class_type.replace(/\.\d+$/, '');
    // Filter by type if specified
    if (type === 'WT' && !base.startsWith('WT')) return;
    if (type === 'HB' && !base.startsWith('HB')) return;
    // Exclude current course
    if (excludeCourse && base === excludeCourse) return;

    if (!courseMap[base]) {
      courseMap[base] = {
        courseId: base,
        classType: base.startsWith('WT') ? 'Wheelthrowing' : 'Handbuilding',
        instructor: c.instructor,
        startDate: c.class_date,
        startTime: c.start_time,
        endTime: c.end_time,
        totalClasses: 0,
        availableSpots: 0,
      };
    }
    courseMap[base].totalClasses++;
    courseMap[base].availableSpots = Math.max(0, (c.max_capacity || 8) - (c.current_enrollment || 0));
  });

  res.json({ courses: Object.values(courseMap) });
}));

// Switch enrollment type (HB↔WT) — updates enrollment and reboks classes
app.post('/api/admin/enrollments/:enrollmentId/switch-type', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;
  const { newCourseType, toCourseId } = req.body;

  const { data: enrollment } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', parseInt(enrollmentId))
    .single();

  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });

  // Update enrollment type and course identifier
  const isToHB = newCourseType.toLowerCase().includes('handbuilding');
  const updateData = {
    course_type: newCourseType,
    course_identifier: toCourseId || null,
    course_title: isToHB ? 'Handbuilding Beginner/Ext 4-8 Weeks' : 'Wheelthrowing Beginner/Ext 6 Weeks',
    updated_at: new Date().toISOString(),
  };

  // If switching to HB, set credit-based fields
  if (isToHB) {
    updateData.class_credits_allocated = enrollment.number_of_weeks || 4;
    updateData.class_credits_remaining = (enrollment.number_of_weeks || 4) - (enrollment.weeks_completed || 0);
    updateData.class_credits_used = enrollment.weeks_completed || 0;
  } else {
    // If switching to WT, clear HB credit fields
    updateData.class_credits_allocated = null;
    updateData.class_credits_remaining = null;
    updateData.class_credits_used = null;
  }

  // If toCourseId specified, derive schedule info from target course classes
  if (toCourseId) {
    const today = new Date().toISOString().split('T')[0];
    const { data: targetInfo } = await supabaseDb.supabase
      .from('class_instances')
      .select('class_date, start_time, end_time, instructor')
      .like('class_type', `${toCourseId}.%`)
      .order('class_date', { ascending: true })
      .limit(1);

    if (targetInfo && targetInfo.length > 0) {
      const first = targetInfo[0];
      // Derive day of week from first class date
      const dayNames = ['SUNDAYS', 'MONDAYS', 'TUESDAYS', 'WEDNESDAYS', 'THURSDAYS', 'FRIDAYS', 'SATURDAYS'];
      const classDate = new Date(first.class_date + 'T00:00:00');
      updateData.schedule_pattern = dayNames[classDate.getDay()];
      updateData.class_time = first.start_time && first.end_time
        ? `${first.start_time}-${first.end_time}`
        : first.start_time || null;
      updateData.course_start_date = first.class_date;
    }

    // Count total classes for this course to set number_of_weeks.
    // Anchor the match with ".%" so we only count THIS cohort's weekly sessions
    // (e.g. WT0206NT_JL6.1..6) and never sweep in another cohort that merely
    // shares the same prefix — an unanchored "%" here silently inflated
    // number_of_weeks (e.g. to 12) and mis-classified the student.
    const { data: allTarget } = await supabaseDb.supabase
      .from('class_instances')
      .select('id', { count: 'exact' })
      .like('class_type', `${toCourseId}.%`)
      .neq('status', 'cancelled');

    if (allTarget) {
      updateData.number_of_weeks = allTarget.length;
      // Set end date from last class
      const { data: lastClass } = await supabaseDb.supabase
        .from('class_instances')
        .select('class_date')
        .like('class_type', `${toCourseId}.%`)
        .neq('status', 'cancelled')
        .order('class_date', { ascending: false })
        .limit(1);
      if (lastClass && lastClass.length > 0) {
        updateData.course_end_date = lastClass[0].class_date;
      }
    }
  }

  // Clear variant title since it came from original Shopify order
  updateData.course_variant_title = null;

  await supabaseDb.supabase
    .from('course_enrollments')
    .update(updateData)
    .eq('id', parseInt(enrollmentId));

  // If toCourseId specified, delete old bookings and create new ones
  if (toCourseId) {
    // Delete ALL future booked bookings for this student on this enrollment
    const today = new Date().toISOString().split('T')[0];

    // Get all booked bookings for this enrollment
    const { data: existingBookings } = await supabaseDb.supabase
      .from('bookings')
      .select('id, class_instance_id')
      .eq('course_enrollment_id', parseInt(enrollmentId))
      .eq('status', 'booked');

    // Also get the class dates to filter future ones
    if (existingBookings && existingBookings.length > 0) {
      const classIds = existingBookings.map(b => b.class_instance_id);
      const { data: classes } = await supabaseDb.supabase
        .from('class_instances')
        .select('id, class_date')
        .in('id', classIds);

      const futureClassIds = new Set((classes || []).filter(c => c.class_date >= today).map(c => c.id));
      const futureBookingIds = existingBookings.filter(b => futureClassIds.has(b.class_instance_id)).map(b => b.id);

      if (futureBookingIds.length > 0) {
        await supabaseDb.supabase
          .from('bookings')
          .delete()
          .in('id', futureBookingIds);
      }
    }

    // Create bookings for target course
    const { data: targetClasses } = await supabaseDb.supabase
      .from('class_instances')
      .select('id, class_type, class_date')
      .like('class_type', `${toCourseId}%`)
      .gte('class_date', today)
      .neq('status', 'cancelled')
      .order('class_date', { ascending: true });

    if (targetClasses && targetClasses.length > 0) {
      const now = new Date().toISOString();
      for (const cls of targetClasses) {
        // Check for existing booking
        const { data: existing } = await supabaseDb.supabase
          .from('bookings')
          .select('id')
          .eq('student_id', enrollment.student_id)
          .eq('class_instance_id', cls.id)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabaseDb.supabase
            .from('bookings')
            .insert({
              student_id: enrollment.student_id,
              class_instance_id: cls.id,
              status: 'booked',
              booking_type: 'regular',
              course_enrollment_id: parseInt(enrollmentId),
              created_at: now,
              updated_at: now,
            });
        }
      }
    }
  }

  res.json({ success: true, message: `Course type switched to ${newCourseType}` });
}));

// Move a student from one course to another (transfers all bookings)
app.post('/api/admin/course-emails/move-student', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { studentId, fromCourseId, toCourseId } = req.body;

  if (!studentId || !fromCourseId || !toCourseId) {
    return res.status(400).json({ error: 'Missing studentId, fromCourseId, or toCourseId' });
  }

  // Get all class instances for source course
  const { data: fromClasses } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, class_type, class_date')
    .like('class_type', `${fromCourseId}%`)
    .order('class_date', { ascending: true });

  // Get all class instances for target course
  const { data: toClasses } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, class_type, class_date')
    .like('class_type', `${toCourseId}%`)
    .order('class_date', { ascending: true });

  if (!toClasses || toClasses.length === 0) {
    return res.status(400).json({ error: `Target course ${toCourseId} has no class instances` });
  }

  // Find student's enrollment for the source course and update it to target
  const { data: enrollment } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id, course_identifier')
    .eq('student_id', studentId)
    .or(`course_identifier.like.${fromCourseId}%,course_identifier.is.null`)
    .eq('status', 'active')
    .order('id', { ascending: false })
    .limit(1)
    .single();

  const enrollmentId = enrollment?.id || null;

  // Update enrollment course_identifier to target course
  if (enrollmentId) {
    await supabaseDb.supabase
      .from('course_enrollments')
      .update({ course_identifier: toCourseId, updated_at: new Date().toISOString() })
      .eq('id', enrollmentId);
  }

  // Delete student's bookings from source course
  if (fromClasses && fromClasses.length > 0) {
    const fromIds = fromClasses.map(c => c.id);
    await supabaseDb.supabase
      .from('bookings')
      .delete()
      .eq('student_id', studentId)
      .in('class_instance_id', fromIds);
  }

  // Create bookings in target course — linked to enrollment
  const newBookings = toClasses.map(cls => ({
    student_id: studentId,
    class_instance_id: cls.id,
    status: 'booked',
    booking_type: 'regular',
    course_enrollment_id: enrollmentId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  // Insert bookings, skipping duplicates
  let created = 0;
  for (const booking of newBookings) {
    const { data: existing } = await supabaseDb.supabase
      .from('bookings')
      .select('id')
      .eq('student_id', booking.student_id)
      .eq('class_instance_id', booking.class_instance_id)
      .limit(1);

    if (!existing || existing.length === 0) {
      // Hard cap check
      const { count: currentCount } = await supabaseDb.supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('class_instance_id', booking.class_instance_id)
        .eq('status', 'booked');
      if (currentCount >= 10) {
        console.warn(`[MoveStudent] Skipping class ${booking.class_instance_id} — full (${currentCount}/10)`);
        continue;
      }
      const { error: insertErr } = await supabaseDb.supabase.from('bookings').insert(booking);
      if (insertErr) {
        console.error(`Failed to create booking for class ${booking.class_instance_id}:`, insertErr);
      } else {
        created++;
      }
    }
  }
  console.log(`[MoveStudent] Created ${created}/${newBookings.length} bookings for student ${studentId} in ${toCourseId}`);

  // Get student name for response
  const { data: student } = await supabaseDb.supabase
    .from('customers')
    .select('first_name, last_name')
    .eq('id', studentId)
    .single();

  res.json({
    message: `Moved ${student?.first_name} ${student?.last_name} from ${fromCourseId} to ${toCourseId}`,
    bookingsCreated: newBookings.length,
  });
}));

// ============================================
// VOUCHER MANAGEMENT ENDPOINTS
// ============================================

// Get voucher stats (must be before :id route)
app.get('/api/admin/vouchers/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const [
    { count: total, error: e1 },
    { count: pending, error: e2 },
    { count: redeemed, error: e3 },
    { count: cancelled, error: e4 }
  ] = await Promise.all([
    supabaseDb.supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true }),
    supabaseDb.supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabaseDb.supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'redeemed'),
    supabaseDb.supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'cancelled')
  ]);

  const err = e1 || e2 || e3 || e4;
  if (err) throw err;

  res.json({
    total: total || 0,
    pending: pending || 0,
    redeemed: redeemed || 0,
    cancelled: cancelled || 0
  });
}));

// List all vouchers with purchaser/recipient info
app.get('/api/admin/vouchers', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { data, error } = await supabaseDb.supabase
    .from('vouchers')
    .select(`
      *,
      purchaser:customers!vouchers_purchaser_customer_id_fkey(id, first_name, last_name, email),
      recipient:customers!vouchers_recipient_customer_id_fkey(id, first_name, last_name, email)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  res.json({ vouchers: data || [] });
}));

// Create a voucher manually
app.post('/api/admin/vouchers', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const {
    purchaser_name, purchaser_email, product_title, variant_title,
    amount, recipient_name, recipient_email, recipient_phone,
    notes, shopify_order_id, shopify_order_name
  } = req.body;

  let purchaser_customer_id = null;
  let recipient_customer_id = null;

  // Look up purchaser by email
  if (purchaser_email) {
    const { data: purchaser } = await supabaseDb.supabase
      .from('customers')
      .select('id')
      .eq('email', purchaser_email.toLowerCase().trim())
      .single();
    if (purchaser) purchaser_customer_id = purchaser.id;
  }

  // Look up recipient by email
  if (recipient_email) {
    const { data: recipient } = await supabaseDb.supabase
      .from('customers')
      .select('id')
      .eq('email', recipient_email.toLowerCase().trim())
      .single();
    if (recipient) recipient_customer_id = recipient.id;
  }

  const { data, error } = await supabaseDb.supabase
    .from('vouchers')
    .insert({
      purchaser_name,
      purchaser_email,
      purchaser_customer_id,
      product_title,
      variant_title,
      amount,
      recipient_name,
      recipient_email,
      recipient_phone,
      recipient_customer_id,
      notes,
      shopify_order_id,
      shopify_order_name,
      status: 'pending'
    })
    .select()
    .single();

  if (error) throw error;
  res.json({ voucher: data });
}));

// Update voucher fields
app.put('/api/admin/vouchers/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };

  // If status changes to redeemed, set redeemed_at
  if (updates.status === 'redeemed') {
    updates.redeemed_at = new Date().toISOString();
  }

  const { data, error } = await supabaseDb.supabase
    .from('vouchers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  res.json({ voucher: data });
}));

// Assign a recipient to a voucher
app.post('/api/admin/vouchers/:id/assign-recipient', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, email, phone } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Look up or create customer
  let { data: customer } = await supabaseDb.supabase
    .from('customers')
    .select('id')
    .eq('email', normalizedEmail)
    .single();

  if (!customer) {
    const { data: newCustomer, error: createErr } = await supabaseDb.supabase
      .from('customers')
      .insert({
        first_name,
        last_name,
        email: normalizedEmail,
        customer_type: 'student',
        shopify_customer_id: `VOUCHER-${Date.now()}`,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createErr) throw createErr;
    customer = newCustomer;
  }

  // Update voucher with recipient info
  const { data: voucher, error } = await supabaseDb.supabase
    .from('vouchers')
    .update({
      recipient_customer_id: customer.id,
      recipient_name: `${first_name} ${last_name}`.trim(),
      recipient_email: normalizedEmail,
      recipient_phone: phone || null
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  res.json({ voucher, customer });
}));

// Get active WT courses (with future class dates) for voucher enrollment dropdown
app.get('/api/admin/vouchers/active-courses', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  // class_type is the course identifier (e.g. WT1104AM_DL7.4)
  const { data: classes, error } = await supabaseDb.supabase
    .from('class_instances')
    .select('class_type, class_date, start_time, instructor')
    .gte('class_date', today)
    .like('class_type', 'WT%')
    .order('class_date', { ascending: true });

  if (error) throw error;

  // Group by base course identifier (strip the .N suffix)
  const courseMap = {};
  for (const ci of (classes || [])) {
    const base = ci.class_type.replace(/\.\d+$/, '');
    if (!courseMap[base]) {
      courseMap[base] = {
        course_identifier: base,
        class_type: ci.class_type,
        instructor: ci.instructor,
        start_time: ci.start_time,
        first_date: ci.class_date,
        last_date: ci.class_date,
        class_count: 0,
      };
    }
    courseMap[base].last_date = ci.class_date;
    courseMap[base].class_count++;
  }

  const courses = Object.values(courseMap)
    .sort((a, b) => a.first_date.localeCompare(b.first_date));

  res.json({ courses });
}));

// ============================================
// CONVERT VOUCHER TO ENROLLMENT
// ============================================

app.post('/api/admin/vouchers/:id/convert-to-enrollment', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { course_identifier } = req.body;

  if (!course_identifier) {
    return res.status(400).json({ error: 'course_identifier is required' });
  }

  const { supabase } = supabaseDb;

  // 1. Fetch voucher and verify it's eligible
  const { data: voucher, error: voucherErr } = await supabase
    .from('vouchers')
    .select('*')
    .eq('id', id)
    .single();

  if (voucherErr) throw voucherErr;
  if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
  if (!voucher.recipient_customer_id) {
    return res.status(400).json({ error: 'Voucher has no recipient assigned. Assign a recipient first.' });
  }
  if (voucher.status !== 'pending') {
    return res.status(400).json({ error: `Voucher status is '${voucher.status}', must be 'pending' to convert.` });
  }

  // 2. Find class instances matching the course_identifier pattern (class_type column)
  const { data: classInstances, error: classErr } = await supabase
    .from('class_instances')
    .select('*')
    .like('class_type', `${course_identifier}.%`)
    .order('class_date', { ascending: true });

  if (classErr) throw classErr;
  if (!classInstances || classInstances.length === 0) {
    return res.status(400).json({ error: `No class instances found matching '${course_identifier}.*'` });
  }

  // 3. Derive course type
  let courseType = 'Wheelthrowing Beginner';
  if (course_identifier.startsWith('HB')) {
    courseType = 'Handbuilding';
  }

  const now = new Date().toISOString();
  const shopifyOrderId = `VOUCHER-${voucher.id}`;
  const shopifyLineItemId = `VOUCHER-${voucher.id}-${Date.now()}`;

  // 4. Derive schedule_pattern and class_time from the class instances
  const firstClass = classInstances[0];
  const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const schedulePattern = dayNames[new Date(firstClass.class_date).getDay()];
  const classTime = [firstClass.start_time, firstClass.end_time].filter(Boolean).join(' - ') || null;

  // 4. Create course enrollment
  const { data: enrollment, error: enrollErr } = await supabase
    .from('course_enrollments')
    .insert({
      student_id: voucher.recipient_customer_id,
      shopify_order_id: shopifyOrderId,
      shopify_line_item_id: shopifyLineItemId,
      course_title: voucher.product_title || 'Voucher Redemption',
      course_variant_title: voucher.variant_title || '',
      course_type: courseType,
      schedule_pattern: schedulePattern,
      class_time: classTime,
      number_of_weeks: classInstances.length,
      course_start_date: classInstances[0].class_date,
      course_end_date: classInstances[classInstances.length - 1].class_date,
      status: 'active',
      course_identifier: course_identifier,
      class_credits_used: 0,
      class_credits_remaining: classInstances.length,
      created_at: now,
      updated_at: now
    })
    .select()
    .single();

  if (enrollErr) throw enrollErr;

  // 5. Create bookings for each class instance
  const bookings = classInstances.map(ci => ({
    student_id: voucher.recipient_customer_id,
    class_instance_id: ci.id,
    course_enrollment_id: enrollment.id,
    status: 'booked',
    booking_type: 'regular',
    created_at: now,
    updated_at: now
  }));

  // Check capacity before inserting
  for (const b of bookings) {
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('class_instance_id', b.class_instance_id)
      .eq('status', 'booked');
    if (count >= 10) {
      return res.status(400).json({ error: `Class is full (${count}/10). Cannot complete voucher enrollment.` });
    }
  }

  const { error: bookErr } = await supabase
    .from('bookings')
    .insert(bookings);

  if (bookErr) throw bookErr;

  // Update credits after booking — derived from the rows just inserted rather
  // than assumed from classInstances.length, so a partial insert can't leave
  // the counter claiming more was booked than actually was.
  await supabaseDb.syncStoredCredits(enrollment.id);

  await supabase
    .from('course_enrollments')
    .update({ bookings_created_at: now, updated_at: now })
    .eq('id', enrollment.id);

  // 6. Check cohort threshold and activate draft classes if met
  try {
    const { checkAndProcessThreshold } = require('../utils/courseEnrollmentManager');
    // Re-fetch enrollment with all fields for threshold check
    const { data: fullEnrollment } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('id', enrollment.id)
      .single();
    if (fullEnrollment) {
      await checkAndProcessThreshold(fullEnrollment);
    }
  } catch (thresholdErr) {
    console.error(`⚠️ Threshold check failed for voucher enrollment ${enrollment.id}:`, thresholdErr.message);
    // Non-fatal — enrollment and bookings are already created
  }

  // 7. Update voucher status
  const { data: updatedVoucher, error: updateErr } = await supabase
    .from('vouchers')
    .update({
      status: 'redeemed',
      redeemed_at: now,
      redeemed_enrollment_id: enrollment.id
    })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) throw updateErr;

  console.log(`🎁 Voucher ${id} converted to enrollment ${enrollment.id} for course ${course_identifier} (${classInstances.length} classes)`);

  res.json({
    success: true,
    voucher: updatedVoucher,
    enrollment,
    bookingsCreated: classInstances.length
  });
}));

// Account anomalies — run the daily invariant probe on demand.
// Source of truth: server/utils/anomalyProbe.js (matches getEnrollmentCredits semantics).
app.get('/api/admin/anomalies', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { runAnomalyProbe } = require('../utils/anomalyProbe');
  const findings = await runAnomalyProbe();
  res.json({ findings, count: findings.length, generatedAt: new Date().toISOString() });
}));

// Manual trigger for the digest email (admin-only) — for testing/forcing a send.
app.post('/api/admin/anomalies/send-digest', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { runAnomalyProbeAndAlert } = require('../utils/cohortAutoProcessor');
  await runAnomalyProbeAndAlert();
  res.json({ success: true });
}));

};
