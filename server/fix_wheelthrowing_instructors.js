require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixAllWheelthrowingInstructors() {
  console.log('🔧 Fixing all wheelthrowing instructors...\n');

  const { data: classes, error } = await supabase
    .from('class_instances')
    .select('id, class_date, start_time, instructor, class_type')
    .ilike('class_type', '%wheelthrowing%');

  if (error) {
    console.error('Error fetching classes:', error);
    process.exit(1);
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let updated = 0;

  for (const cls of classes) {
    // Parse date correctly - class_date is YYYY-MM-DD, treat as local time not UTC
    const [year, month, day] = cls.class_date.split('T')[0].split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const dayOfWeek = date.getDay(); // Use local day of week
    const dayName = dayNames[dayOfWeek];

    let correctInstructor = null;

    // Weekdays (Tue=2, Thu=4) - Joyce Lim
    if (dayOfWeek === 2 || dayOfWeek === 4) {
      correctInstructor = 'Joyce Lim';
    }
    // Weekends (Fri=5, Sat=6, Sun=0) - Dillon Lin
    else if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
      correctInstructor = 'Dillon Lin';
    }

    if (correctInstructor && cls.instructor !== correctInstructor) {
      console.log(`${cls.class_date} (${dayName}) ${cls.start_time} - "${cls.instructor}" → "${correctInstructor}"`);

      const { error: updateError } = await supabase
        .from('class_instances')
        .update({ instructor: correctInstructor })
        .eq('id', cls.id);

      if (updateError) {
        console.error('Error updating:', updateError);
      } else {
        updated++;
      }
    }
  }

  console.log(`\n✅ Updated ${updated} wheelthrowing class instructors`);
  console.log('\n📋 Final assignments:');
  console.log('   • Joyce Lim - Tuesdays and Thursdays');
  console.log('   • Dillon Lin - Fridays, Saturdays, and Sundays');
  console.log('   • Lynette Ting - Wednesdays (handbuilding)');

  process.exit(0);
}

fixAllWheelthrowingInstructors();
