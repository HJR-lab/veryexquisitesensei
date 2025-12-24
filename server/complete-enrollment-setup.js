const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Extract course identifier from class_type
function getCourseIdentifier(classType) {
  const match = classType.match(/^(.+)\.\d+$/);
  return match ? match[1] : classType;
}

// Extract course type
function getCourseType(classType) {
  return classType.startsWith('WT') ? 'wheelthrowing' : 'handbuilding';
}

async function completeSetup() {
  console.log('\n🎨 COMPLETE ENROLLMENT SETUP\n');

  // Step 1: Clear all existing enrollments
  console.log('Step 1: Clearing existing enrollments...');
  const { error: deleteError } = await supabase
    .from('course_enrollments')
    .delete()
    .neq('id', 0); // Delete all

  if (deleteError) {
    console.error('Error deleting enrollments:', deleteError);
    return;
  }
  console.log('✅ Cleared all enrollments\n');

  // Step 2: Clear all booking links
  console.log('Step 2: Clearing booking links...');
  await supabase
    .from('bookings')
    .update({ course_enrollment_id: null })
    .neq('id', 0);
  console.log('✅ Cleared all booking links\n');

  // Step 3: Get all bookings with class info
  console.log('Step 3: Loading bookings...');
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      student_id,
      attended,
      status,
      booking_date,
      class_instance:class_instances!bookings_class_instance_id_fkey(
        id,
        class_date,
        class_type,
        instructor
      )
    `)
    .order('class_instance(class_date)', { ascending: true });

  console.log('✅ Loaded', bookings.length, 'bookings\n');

  // Step 4: Group bookings by student and course identifier
  console.log('Step 4: Grouping bookings into courses...');
  const studentCourses = {};

  bookings.forEach(booking => {
    if (!booking.class_instance) return;

    const studentId = booking.student_id;
    const courseId = getCourseIdentifier(booking.class_instance.class_type);
    const key = `${studentId}_${courseId}`;

    if (!studentCourses[key]) {
      studentCourses[key] = {
        studentId: studentId,
        courseId: courseId,
        courseType: getCourseType(booking.class_instance.class_type),
        instructor: booking.class_instance.instructor,
        bookings: []
      };
    }
    studentCourses[key].bookings.push(booking);
  });

  const uniqueCourses = Object.values(studentCourses);
  console.log('✅ Found', uniqueCourses.length, 'unique courses\n');

  // Step 5: Create enrollments and link bookings
  console.log('Step 5: Creating enrollments and linking bookings...');
  let created = 0;
  let linked = 0;

  for (const course of uniqueCourses) {
    const sortedBookings = course.bookings.sort((a, b) =>
      new Date(a.class_instance.class_date) - new Date(b.class_instance.class_date)
    );

    const startDate = sortedBookings[0].class_instance.class_date.split('T')[0];
    const endDate = sortedBookings[sortedBookings.length - 1].class_instance.class_date.split('T')[0];

    const courseTitle = course.courseType === 'wheelthrowing' ? 'Wheelthrowing' : 'Handbuilding';

    // Create enrollment
    const { data: enrollment, error: enrollError } = await supabase
      .from('course_enrollments')
      .insert({
        student_id: course.studentId,
        course_title: `${courseTitle} 6-Week Course`,
        course_type: course.courseType,
        number_of_weeks: 6,
        course_start_date: startDate,
        course_end_date: endDate,
        instructor: course.instructor,
        status: new Date(endDate) < new Date() ? 'completed' : 'active'
      })
      .select()
      .single();

    if (enrollError) {
      console.error('Error creating enrollment:', enrollError);
      continue;
    }

    created++;

    // Link all bookings to this enrollment
    for (const booking of course.bookings) {
      await supabase
        .from('bookings')
        .update({ course_enrollment_id: enrollment.id })
        .eq('id', booking.id);
      linked++;
    }

    if (created % 50 === 0) {
      console.log(`Created ${created} enrollments, linked ${linked} bookings...`);
    }
  }

  console.log(`\n✅ Created ${created} enrollments`);
  console.log(`✅ Linked ${linked} bookings\n`);

  // Step 6: Update all course_purchase_count fields
  console.log('Step 6: Updating course_purchase_count for all customers...');
  const { data: customers } = await supabase
    .from('customers')
    .select('id');

  let updated = 0;
  for (const customer of customers) {
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq('student_id', customer.id);

    await supabase
      .from('customers')
      .update({ course_purchase_count: enrollments?.length || 0 })
      .eq('id', customer.id);

    updated++;
    if (updated % 100 === 0) {
      console.log(`Updated ${updated} customers...`);
    }
  }

  console.log(`✅ Updated ${updated} customers\n`);

  console.log('=== SETUP COMPLETE ===');
  console.log(`✅ ${created} enrollments created`);
  console.log(`✅ ${linked} bookings linked`);
  console.log(`✅ ${updated} customer records updated`);
}

completeSetup();
