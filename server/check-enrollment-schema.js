require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkSchema() {
  try {
    // Get a sample enrollment to see the columns
    const { data: enrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .limit(1);

    if (enrollments && enrollments.length > 0) {
      console.log('Course Enrollments columns:');
      console.log(Object.keys(enrollments[0]));
      console.log('\nSample record:');
      console.log(JSON.stringify(enrollments[0], null, 2));
    } else {
      console.log('No enrollments found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkSchema();
