require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSarahDashboard() {
  try {
    console.log('=== Checking Sarah Chan Dashboard Structure ===\n');

    // Find Sarah Chan
    const { data: sarah, error: customerError } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email')
      .ilike('first_name', 'Sarah')
      .ilike('last_name', 'Chan')
      .single();

    if (customerError) {
      console.log('❌ Sarah Chan not found or multiple matches');
      // Try different search
      const { data: sarahs } = await supabase
        .from('customers')
        .select('id, first_name, last_name, email')
        .ilike('first_name', 'Sarah')
        .limit(10);

      console.log('Found these Sarah customers:');
      sarahs.forEach(s => {
        console.log(`  - ${s.first_name} ${s.last_name} (${s.email})`);
      });
      return;
    }

    console.log(`Found: ${sarah.first_name} ${sarah.last_name} (${sarah.email})`);
    console.log(`Customer ID: ${sarah.id}\n`);

    // Get ALL enrollments first (to see the full picture)
    const { data: allEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', sarah.id)
      .order('created_at', { ascending: false });

    console.log('=== ALL ENROLLMENTS (including completed) ===');
    allEnrollments.forEach((e, i) => {
      console.log(`${i + 1}. ID: ${e.id}, Status: ${e.status}`);
      console.log(`   Title: ${e.course_title}`);
      console.log(`   Identifier: ${e.course_identifier || 'NULL'}`);
      console.log(`   Package: ${e.package_total_courses || 'NULL'}`);
      console.log(`   Created: ${e.created_at}`);
      console.log('');
    });

    // Get ACTIVE enrollments (what dashboard API gets after our fix)
    const { data: activeEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', sarah.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false});

    console.log('=== ACTIVE ENROLLMENTS (Dashboard will show) ===');
    console.log(`Active enrollments: ${activeEnrollments.length}`);

    if (activeEnrollments.length === 0) {
      console.log('✅ Sarah has no active enrollments - no dashboard issues');
      return;
    }

    activeEnrollments.forEach((e, i) => {
      console.log(`${i + 1}. ${e.course_title} (${e.course_identifier || 'NULL'})`);
      if (e.package_total_courses) {
        console.log(`    📦 Package: ${e.package_total_courses} courses`);
      }
    });

    // Check for potential issues
    console.log('\n=== ANALYSIS ===');
    const individualCourses = activeEnrollments.filter(e => !e.package_total_courses || e.package_total_courses <= 1);
    const packageCourses = activeEnrollments.filter(e => e.package_total_courses && e.package_total_courses > 1);

    console.log(`Individual courses: ${individualCourses.length}`);
    console.log(`Package courses: ${packageCourses.length}`);

    if (individualCourses.length > 1 && packageCourses.length > 0) {
      console.log('⚠️  POTENTIAL ISSUE: Sarah has both individual and package courses active');
      console.log('💡 This might cause similar dashboard display issues as Mitchell had');
    } else if (individualCourses.length > 1) {
      console.log('⚠️  POTENTIAL ISSUE: Sarah has multiple individual courses active');
    } else if (activeEnrollments.length === 1) {
      console.log('✅ Sarah has a clean dashboard - only 1 active enrollment');
    } else {
      console.log('✅ Sarah\'s dashboard structure looks good');
    }

    // Check for N/A identifiers
    const naEnrollments = activeEnrollments.filter(e => !e.course_identifier);
    if (naEnrollments.length > 0) {
      console.log(`⚠️  WARNING: Sarah has ${naEnrollments.length} enrollment(s) with NULL course_identifier`);
      console.log('💡 These will show as "N/A" on the dashboard');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkSarahDashboard().then(() => process.exit());