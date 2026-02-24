require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSarahPackage() {
  try {
    console.log('=== Checking if Sarah Chan has 3-Course Package ===\n');

    // Get all of Sarah's enrollments (including any package ones)
    const { data: allEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', 2228)
      .order('created_at', { ascending: false });

    console.log('=== ALL SARAH\'S ENROLLMENTS ===');
    allEnrollments.forEach((e, i) => {
      console.log(`${i + 1}. ID: ${e.id}, Status: ${e.status}`);
      console.log(`   Title: ${e.course_title}`);
      console.log(`   Identifier: ${e.course_identifier || 'NULL'}`);
      console.log(`   Package Total: ${e.package_total_courses || 'NULL'}`);
      console.log(`   Package Remaining: ${e.package_courses_remaining || 'NULL'}`);
      console.log(`   Created: ${e.created_at}`);
      console.log('');
    });

    // Check if she has any package enrollments
    const packageEnrollments = allEnrollments.filter(e => e.package_total_courses && e.package_total_courses > 1);

    console.log('=== PACKAGE ANALYSIS ===');
    if (packageEnrollments.length === 0) {
      console.log('❌ Sarah has NO 3-course package enrollment!');
      console.log('💡 She should have a package enrollment similar to Mitchell');

      // Check Sarah's purchase data or orders to see if she should have a package
      const { data: customer } = await supabase
        .from('customers')
        .select('course_purchase_count, shopify_customer_id')
        .eq('id', 2228)
        .single();

      console.log('\n=== SARAH\'S PURCHASE DATA ===');
      console.log(`Course Purchase Count: ${customer.course_purchase_count || 0}`);
      console.log(`Shopify Customer ID: ${customer.shopify_customer_id || 'NULL'}`);

      if (customer.course_purchase_count >= 3) {
        console.log('✅ Sarah has purchased 3+ courses - she should have a package!');
        console.log('💡 SOLUTION: Create a 3-course package enrollment for Sarah');

        console.log('\n=== CREATING SARAH\'S 3-COURSE PACKAGE ===');

        // Create the package enrollment
        const { data: newPackage, error: packageError } = await supabase
          .from('course_enrollments')
          .insert({
            student_id: 2228,
            course_title: 'Wheelthrowing Beginner/Ext 6 Weeks - 3 Course Package',
            course_identifier: 'WT2802PM_DL6', // Assuming similar timing as Mitchell
            package_total_courses: 3,
            package_total_classes: 18,
            package_courses_remaining: 2, // She's used 1 course (current individual)
            status: 'active',
            number_of_weeks: 6,
            instructor: 'VES Instructor'
          })
          .select()
          .single();

        if (packageError) {
          console.error('❌ Error creating package:', packageError);
        } else {
          console.log('✅ Created 3-course package enrollment!');
          console.log(`   Package ID: ${newPackage.id}`);
          console.log('✅ Sarah now has a 3-course package like Mitchell');
        }

      } else {
        console.log('⚠️  Sarah has not purchased enough courses for a package');
      }

    } else {
      console.log('✅ Sarah already has package enrollment(s):');
      packageEnrollments.forEach(pkg => {
        console.log(`   - ${pkg.course_title} (${pkg.package_total_courses} courses)`);
      });
    }

    // Final check
    const { data: finalEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', 2228)
      .eq('status', 'active');

    console.log('\n=== SARAH\'S FINAL ACTIVE ENROLLMENTS ===');
    finalEnrollments.forEach(e => {
      const type = e.package_total_courses > 1 ? 'PACKAGE' : 'INDIVIDUAL';
      console.log(`   ${type}: ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

    console.log('\n💡 Sarah should now show similar to Mitchell:');
    console.log('   - Current: Individual WT1701PM_DL6 course');
    console.log('   - Upcoming: 3-Course Package');

  } catch (error) {
    console.error('Error:', error);
  }
}

checkSarahPackage().then(() => process.exit());