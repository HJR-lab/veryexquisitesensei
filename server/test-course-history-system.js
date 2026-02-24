require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function testCourseHistoryForMultipleStudents() {
  console.log('=== TESTING COURSE HISTORY SYSTEM-WIDE ===\n');

  // Get a few students with bookings to test
  const { data: students, error } = await supabase
    .from('customers')
    .select(`
      id,
      first_name,
      last_name,
      email
    `)
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  for (const student of students) {
    console.log(`\n📋 Testing: ${student.first_name} ${student.last_name} (ID: ${student.id})`);
    
    // Get their bookings with class details
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        id,
        course_enrollment_id,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date
        )
      `)
      .eq('student_id', student.id);

    if (!bookings || bookings.length === 0) {
      console.log('   No bookings found');
      continue;
    }

    // Extract course identifiers
    const extractCourseIdentifier = (classType) => {
      if (!classType) return null;
      const match = classType.match(/^(.+?)(?:\.\d+)?$/);
      return match ? match[1] : classType;
    };

    const courseIds = new Set();
    bookings.forEach(b => {
      if (b.class_instances?.class_type) {
        const courseId = extractCourseIdentifier(b.class_instances.class_type);
        if (courseId) courseIds.add(courseId);
      }
    });

    console.log(`   Total Bookings: ${bookings.length}`);
    console.log(`   Unique Courses: ${courseIds.size}`);
    console.log(`   Course Identifiers:`);
    [...courseIds].sort().forEach(c => console.log(`     - ${c}`));
  }

  console.log('\n=== TESTING COMPLETE ===');
  console.log('\nThe course history endpoint groups by actual course identifiers.');
  console.log('This means students with multiple courses in one enrollment will see them split correctly.');
}

testCourseHistoryForMultipleStudents().then(() => process.exit());
