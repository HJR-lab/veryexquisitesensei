require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function fixCourseCounts() {
  try {
    console.log('Fixing course purchase counts for Mitchell and Sarah Chan...\n');

    // Update Sarah's course_purchase_count to 1
    const { data: sarah, error: error1 } = await supabaseDb.supabase
      .from('customers')
      .update({
        course_purchase_count: 1
      })
      .eq('email', 'Mitchell.chandx+dup@gmail.com')
      .select();

    if (error1) {
      console.error('Error updating Sarah:', error1);
    } else {
      console.log('✅ Updated Sarah Chan:');
      console.log(`  Course Purchase Count: ${sarah[0].course_purchase_count}`);
      console.log(`  Classes Allocated: ${sarah[0].classes_allocated}`);
    }

    // Mitchell already has course_purchase_count: 2 (correct for WT1701PM_DL6 and WT2802PM_JL6)
    const { data: mitchell } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    console.log('\n✅ Mitchell Chan:');
    console.log(`  Course Purchase Count: ${mitchell.course_purchase_count} (WT1701PM_DL6 + WT2802PM_JL6)`);
    console.log(`  Classes Allocated: ${mitchell.classes_allocated}`);

    console.log('\n📋 Expected results:');
    console.log('  Active Students: Mitchell Chan (WT1701PM_DL6), Sarah Chan (WT1701PM_DL6)');
    console.log('  Upcoming Enrollments: Mitchell Chan (WT2802PM_JL6)');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

fixCourseCounts();
