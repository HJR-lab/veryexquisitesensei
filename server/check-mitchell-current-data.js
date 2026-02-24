const { supabase } = require('./utils/supabaseDb');

async function checkMitchellData() {
  try {
    // Find Mitchell Chan
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .ilike('first_name', 'Mitchell')
      .ilike('last_name', 'Chan')
      .single();

    if (customerError) {
      console.error('Error finding Mitchell:', customerError);
      return;
    }

    console.log('=== MITCHELL CHAN DATA ===\n');
    console.log('Customer ID:', customer.id);
    console.log('Name:', customer.first_name, customer.last_name);
    console.log('Email:', customer.email);
    console.log('Course Purchase Count:', customer.course_purchase_count);
    console.log('Classes Allocated:', customer.classes_allocated);

    // Get current enrollment
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', customer.id)
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    console.log('\n=== CURRENT ENROLLMENT ===');
    if (enrollmentError) {
      console.log('No active enrollment found');
    } else {
      console.log('Enrollment ID:', enrollment.id);
      console.log('Course Title:', enrollment.course_title);
      console.log('Course Identifier:', enrollment.course_identifier);
      console.log('Course Type:', enrollment.course_type);
      console.log('Number of Weeks:', enrollment.number_of_weeks);
      console.log('Status:', enrollment.status);
      console.log('Instructor:', enrollment.instructor);
      console.log('Package Info:');
      console.log('  - Total Courses:', enrollment.package_total_courses);
      console.log('  - Current Course:', enrollment.package_current_course);
      console.log('  - Package Type:', enrollment.package_type);
    }

    // Get all enrollments for comparison
    const { data: allEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', customer.id)
      .order('created_at', { ascending: false });

    console.log('\n=== ALL ENROLLMENTS ===');
    allEnrollments.forEach((e, i) => {
      console.log(`${i + 1}. Status: ${e.status}, Title: ${e.course_title}`);
      console.log(`   Package: ${e.package_total_courses || 'N/A'} courses, Current: ${e.package_current_course || 'N/A'}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

checkMitchellData().then(() => process.exit());