require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkTuesdayState() {
  try {
    // Get all Tuesday classes
    const { data: classes } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .like('class_type', 'WT2001NT_JL6.%')
      .order('class_date', { ascending: true });

    console.log('\n📅 Current Tuesday classes:');
    classes.forEach(cls => {
      const date = new Date(cls.class_date);
      console.log(`   ${cls.class_type} - ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} | ID: ${cls.id}`);
    });

    // Check enrollments
    const { data: enrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, student_id')
      .eq('schedule_pattern', 'TUESDAY')
      .eq('class_time', '7:00pm - 9:30pm')
      .eq('course_start_date', '2026-01-20');

    console.log(`\n👥 Enrollments: ${enrollments?.length || 0}`);
    if (enrollments) {
      enrollments.forEach(e => {
        console.log(`   Enrollment ${e.id} - Student ${e.student_id}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkTuesdayState();
