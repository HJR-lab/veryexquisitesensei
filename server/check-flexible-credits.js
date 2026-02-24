require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkFlexibleCredits() {
  try {
    // Check schema for flexible credit columns
    const { data: columns } = await supabase
      .from('course_enrollments')
      .select('*')
      .limit(1);

    if (columns && columns.length > 0) {
      console.log('=== Available columns in course_enrollments ===');
      console.log(Object.keys(columns[0]).sort().join('\n'));
    }

    // Check if we have any 10-class packages
    const { data: tenClassPackages } = await supabase
      .from('course_enrollments')
      .select('id, customer_id, course_title, number_of_weeks, class_credits_allocated, class_credits_used, hb_credits_allocated, hb_credits_used')
      .or('number_of_weeks.eq.10,course_title.ilike.%10 Classes%')
      .limit(5);

    console.log('\n=== 10-Class Package enrollments ===');
    if (tenClassPackages && tenClassPackages.length > 0) {
      tenClassPackages.forEach(e => {
        console.log(`\nID: ${e.id}`);
        console.log(`  Title: ${e.course_title}`);
        console.log(`  Weeks: ${e.number_of_weeks}`);
        console.log(`  WT Credits: ${e.class_credits_allocated} allocated, ${e.class_credits_used} used`);
        console.log(`  HB Credits: ${e.hb_credits_allocated || 0} allocated, ${e.hb_credits_used || 0} used`);
      });
    } else {
      console.log('No 10-class packages found');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkFlexibleCredits();
