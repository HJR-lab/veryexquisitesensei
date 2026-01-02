require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function markPublicHolidays() {
  try {
    console.log('\n🎉 Marking Singapore Public Holidays for 2026...\n');

    // Singapore Public Holidays 2026 (Official MOM dates)
    const publicHolidays = [
      { date: '2026-01-01', name: "New Year's Day" },
      { date: '2026-02-17', name: 'Chinese New Year' },
      { date: '2026-02-18', name: 'Chinese New Year (Day 2)' },
      { date: '2026-03-21', name: 'Hari Raya Puasa' },
      { date: '2026-04-03', name: 'Good Friday' },
      { date: '2026-05-01', name: 'Labour Day' },
      { date: '2026-05-27', name: 'Hari Raya Haji' },
      { date: '2026-06-01', name: 'Vesak Day (observed)' },
      { date: '2026-08-10', name: 'National Day (observed)' },
      { date: '2026-11-09', name: 'Deepavali (observed)' },
      { date: '2026-12-25', name: 'Christmas Day' }
    ];

    console.log('Singapore Public Holidays 2026:');
    publicHolidays.forEach(holiday => {
      const date = new Date(holiday.date);
      console.log(`   ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} - ${holiday.name}`);
    });

    // Get all 2026 classes
    const { data: allClasses } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', '2026-01-01')
      .lt('class_date', '2027-01-01')
      .order('class_date', { ascending: true });

    console.log(`\n\n📅 Checking ${allClasses.length} classes for public holidays...\n`);

    let markedCount = 0;
    const affectedClasses = [];

    for (const cls of allClasses) {
      const classDateStr = cls.class_date.split('T')[0];
      const holiday = publicHolidays.find(h => h.date === classDateStr);

      if (holiday) {
        affectedClasses.push({
          class: cls,
          holiday: holiday
        });

        // Update class to mark as public holiday
        const { error } = await supabaseDb.supabase
          .from('class_instances')
          .update({
            cancellation_reason: `Public Holiday: ${holiday.name}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', cls.id);

        if (error) {
          console.log(`❌ Error updating ${cls.class_type}: ${error.message}`);
        } else {
          markedCount++;
          const date = new Date(cls.class_date);
          console.log(`🎉 ${cls.class_type} on ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} - ${holiday.name}`);
        }
      }
    }

    console.log(`\n\n📊 Summary:`);
    console.log(`   Total classes checked: ${allClasses.length}`);
    console.log(`   Classes on public holidays: ${markedCount}`);

    if (affectedClasses.length > 0) {
      console.log(`\n⚠️  Classes affected by public holidays:\n`);
      affectedClasses.forEach(item => {
        const date = new Date(item.class.class_date);
        console.log(`   ${item.class.class_type}`);
        console.log(`   ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`);
        console.log(`   Holiday: ${item.holiday.name}`);
        console.log(`   Instructor: ${item.class.instructor}\n`);
      });
    }

    console.log(`\n✅ Public holidays marked! Use 'cancellation_reason' field to identify them.`);
    console.log(`   Frontend can check if cancellation_reason contains "Public Holiday" for pink highlighting.`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

markPublicHolidays();
