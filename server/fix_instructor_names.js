require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixInstructorNames() {
  try {
    console.log('🔧 Fixing instructor names...\n');

    // Get all classes
    const { data: classes, error: fetchError } = await supabase
      .from('class_instances')
      .select('id, class_date, start_time, instructor, class_type')
      .order('class_date', { ascending: true });

    if (fetchError) throw fetchError;

    let updatedCount = 0;

    for (const cls of classes) {
      const date = new Date(cls.class_date + 'T00:00:00');
      const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, 2=Tue, etc.

      let correctInstructor = null;

      // Handbuilding classes - always Lynette Ting
      if (cls.class_type?.toLowerCase().includes('handbuilding')) {
        correctInstructor = 'Lynette Ting';
      }
      // Wheelthrowing classes
      else if (cls.class_type?.toLowerCase().includes('wheelthrowing')) {
        // Weekdays (Tue=2, Thu=4) - Joyce Lim
        if (dayOfWeek === 2 || dayOfWeek === 4) {
          correctInstructor = 'Joyce Lim';
        }
        // Weekends (Fri=5, Sat=6, Sun=0) - Dillon Lin
        else if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
          correctInstructor = 'Dillon Lin';
        }
      }

      // Update if instructor is wrong
      if (correctInstructor && cls.instructor !== correctInstructor) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        console.log(`📝 ${cls.class_date} (${dayNames[dayOfWeek]}) ${cls.start_time} - ${cls.class_type}`);
        console.log(`   Changing: "${cls.instructor}" → "${correctInstructor}"`);

        const { error: updateError } = await supabase
          .from('class_instances')
          .update({ instructor: correctInstructor })
          .eq('id', cls.id);

        if (updateError) {
          console.error(`   ❌ Error:`, updateError.message);
        } else {
          updatedCount++;
        }
      }
    }

    console.log(`\n✅ Updated ${updatedCount} class instructors`);
    console.log('\n📋 Correct instructor assignments:');
    console.log('   • Joyce Lim - Weekdays (Tue/Thu) for wheelthrowing');
    console.log('   • Dillon Lin - Weekends (Fri/Sat/Sun) for wheelthrowing');
    console.log('   • Lynette Ting - Wednesdays for handbuilding');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixInstructorNames();
