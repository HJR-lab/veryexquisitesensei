require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function fixJan2026StudentsClassesUsed() {
  try {
    console.log('\n🔧 Fixing Jan 2026 students classes_used...\n');

    const studentsToFix = [
      { email: 'sarahcherwh1011@gmail.com', name: 'Sarah Cher' },
      { email: 'charmaine.lauhuiqi@gmail.com', name: 'Charmaine Lau' },
      { email: 'sfoo9940@gmail.com', name: 'Jia Yin Foo' },
      { email: 'liyiantai@gmail.com', name: 'Li-Yian Tai' },
      { email: 'soojitag@me.com', name: 'Sooji Tag' }
    ];

    for (const student of studentsToFix) {
      const { data: customerData } = await supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('email', student.email)
        .single();

      if (!customerData) {
        console.log(`❌ ${student.name} not found`);
        continue;
      }

      console.log(`${student.name}:`);
      console.log(`  Before: Allocated ${customerData.classes_allocated}, Used ${customerData.classes_used}, Remaining ${customerData.classes_allocated - customerData.classes_used}`);

      // Update classes_used to 0
      const { error: updateError } = await supabaseDb.supabase
        .from('customers')
        .update({
          classes_used: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', customerData.id);

      if (updateError) {
        console.error(`  ❌ Error updating:`, updateError);
      } else {
        console.log(`  ✅ After: Allocated ${customerData.classes_allocated}, Used 0, Remaining ${customerData.classes_allocated}`);
      }
      console.log();
    }

    console.log('✨ All Jan 2026 students fixed!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixJan2026StudentsClassesUsed();
