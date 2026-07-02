// One-off: represent the new 3-course package (Shopify order #2583 / 6707957039262,
// qty 2 = Mitchell + Sarah) as commencing at cohort WT1107PM_DL6.1 (11 Jul).
//
// Decision (Justin): WT2305 (23 May–4 Jul) belongs to the OLD package; the new
// package #2583 is entirely upcoming. Mitchell's enr#5340 was mis-attributed to
// #2583 — re-tag it to old-package course 3, then enrol both students into
// WT1107PM_DL6.1 as course 1 of the new package (remaining = 2).
//
// Run once:  node scripts/apply-newpkg-mitchell-sarah.js
require('dotenv').config();
const { supabase, createCourseEnrollment } = require('../utils/supabaseDb');
const { addStudentToExistingCohort } = require('../utils/courseEnrollmentManager');

const ORDER_2583 = '6707957039262';
const PAX = [
  { studentId: 1116, name: 'Mitchell Chan', lineItem: '15389910892702' },    // pax 1 (buyer)
  { studentId: 2228, name: 'Sarah Ong',     lineItem: '15389910892702-2' },  // pax 2
];

(async () => {
  // 0. Guard: WT1107PM_DL6 cohort must exist with class instances + a peer enrollment to clone bookings from.
  const { data: cohortCIs } = await supabase.from('class_instances')
    .select('id, class_type').ilike('class_type', 'WT1107PM_DL6.%').order('class_date', { ascending: true });
  if (!cohortCIs || cohortCIs.length === 0) throw new Error('WT1107PM_DL6 cohort not found');
  const { data: peerBooking } = await supabase.from('bookings')
    .select('course_enrollment_id').in('class_instance_id', cohortCIs.map(c => c.id))
    .not('course_enrollment_id', 'is', null).limit(1).single();
  const { data: peerEnrollment } = await supabase.from('course_enrollments')
    .select('*').eq('id', peerBooking.course_enrollment_id).single();
  console.log(`Cohort WT1107PM_DL6: ${cohortCIs.length} class instances; peer enrollment #${peerEnrollment.id}`);

  // 1. Re-tag Mitchell's enr#5340 (WT2305) from new pkg #2583 → OLD package course 3.
  const { data: m5340 } = await supabase.from('course_enrollments')
    .select('id, shopify_order_id, shopify_line_item_id, package_courses_remaining').eq('id', 5340).single();
  if (m5340.shopify_order_id === ORDER_2583) {
    const { error } = await supabase.from('course_enrollments').update({
      shopify_order_id: null,
      shopify_line_item_id: 'PKG-C3',
      package_courses_remaining: 0,
      manual_student_override: true,
      updated_at: new Date().toISOString(),
    }).eq('id', 5340);
    if (error) throw error;
    console.log('✅ enr#5340 re-tagged to old-package course 3 (order→null, line→PKG-C3, remaining→0)');
  } else {
    console.log(`↷ enr#5340 already re-tagged (order=${m5340.shopify_order_id}) — skipping`);
  }

  // 2. Enrol each pax into WT1107PM_DL6 as course 1 of the new 3-course package.
  for (const p of PAX) {
    // Idempotency: skip if this order+line already has an enrollment.
    const { data: existing } = await supabase.from('course_enrollments')
      .select('id').eq('shopify_order_id', ORDER_2583).eq('shopify_line_item_id', p.lineItem).maybeSingle();
    if (existing) { console.log(`↷ ${p.name}: new-pkg enrollment #${existing.id} already exists — skipping`); continue; }

    const newEnr = await createCourseEnrollment({
      studentId: p.studentId,
      shopifyOrderId: ORDER_2583,
      shopifyLineItemId: p.lineItem,
      courseTitle: 'Wheelthrowing Beginner/Ext 6 Weeks • 3 Course Package',
      courseVariantTitle: 'SATURDAYS • 11 Jul –15 Aug • 1:00pm-3:30pm',
      courseType: 'Wheelthrowing Beginner',
      schedulePattern: 'SATURDAY',
      numberOfWeeks: 6,
      totalWeeks: 6,
      courseStartDate: '2026-07-11',
      courseEndDate: '2026-08-15',
      classTime: '1:00 PM - 3:30 PM',
      instructor: 'Dillon Lin',
      room: 'Studio A',
      status: 'active',
      packageTotalCourses: 3,
      packageTotalClasses: 18,
      packageCoursesRemaining: 2, // course 1 now scheduled; courses 2 & 3 to come
    });
    // Lock the manual student assignment so Shopify sync never reassigns this spot.
    await supabase.from('course_enrollments').update({ manual_student_override: true }).eq('id', newEnr.id);

    const res = await addStudentToExistingCohort(newEnr, peerEnrollment);
    console.log(`✅ ${p.name}: enr#${newEnr.id} created + booked into WT1107PM_DL6 (${res.bookingsCreated} bookings)`);
  }

  console.log('\nDone.');
})().then(() => process.exit(0)).catch(e => { console.error('❌', e); process.exit(1); });
