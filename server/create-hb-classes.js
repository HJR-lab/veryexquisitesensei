require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createRecurringHBClasses() {
  console.log('\n🎨 CREATING RECURRING HANDBUILDING CLASSES\n');
  console.log('==========================================\n');

  const startDate = new Date('2026-09-17'); // Sept 17, 2026
  const endDate = new Date('2027-04-30');   // Apr 30, 2027

  const instructor = 'LT';       // Default instructor
  const room = 'Main Studio';
  const maxCapacity = 12;        // HB classes capacity

  // HB class schedule: Monday 7pm, Wednesday 7pm, Saturday 4pm
  // Naming: HBMONNT_LT (Mon Night), HBWEDNT_LT (Wed Night), HBSATEV_LT (Sat Evening)
  const hbSchedule = [
    { dayOfWeek: 1, dayName: 'Monday',    startTime: '7:00pm',  endTime: '9:00pm',  classType: 'HBMONNT_LT' },
    { dayOfWeek: 3, dayName: 'Wednesday', startTime: '7:00pm',  endTime: '9:00pm',  classType: 'HBWEDNT_LT' },
    { dayOfWeek: 6, dayName: 'Saturday',  startTime: '4:00pm',  endTime: '6:00pm',  classType: 'HBSATEV_LT' },
  ];

  const classesToCreate = [];
  let currentDate = new Date(startDate);

  console.log(`Generating classes from ${startDate.toDateString()} to ${endDate.toDateString()}\n`);

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();

    // Check if this day matches any HB schedule
    const schedule = hbSchedule.find(s => s.dayOfWeek === dayOfWeek);

    if (schedule) {
      // Format date as YYYY-MM-DD using local time to avoid timezone issues
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      classesToCreate.push({
        class_date: dateStr,
        start_time: schedule.startTime,
        end_time: schedule.endTime,
        class_type: schedule.classType,
        instructor: instructor,
        room: room,
        max_capacity: maxCapacity,
        current_enrollment: 0,
        status: 'active',
        class_technique: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Count by day
  const byCounts = {};
  classesToCreate.forEach(c => {
    byCounts[c.class_type] = (byCounts[c.class_type] || 0) + 1;
  });
  console.log(`Generated ${classesToCreate.length} HB classes:`);
  Object.entries(byCounts).forEach(([type, count]) => console.log(`  ${type}: ${count}`));
  console.log();

  // Check if any already exist (match on class_type + date)
  const { data: existingClasses } = await supabase
    .from('class_instances')
    .select('class_type, class_date, start_time')
    .or('class_type.eq.HBMONNT_LT,class_type.eq.HBWEDNT_LT,class_type.eq.HBSATEV_LT');

  const existingKeys = new Set((existingClasses || []).map(c => `${c.class_type}_${c.class_date.split('T')[0]}`));
  const newClasses = classesToCreate.filter(c => {
    const key = `${c.class_type}_${c.class_date}`;
    return !existingKeys.has(key);
  });

  console.log(`Existing HB classes: ${existingClasses?.length || 0}`);
  console.log(`New classes to create: ${newClasses.length}\n`);

  if (newClasses.length === 0) {
    console.log('✓ All HB classes already exist!\n');
    process.exit(0);
  }

  // Create classes in batches of 50
  const batchSize = 50;
  let created = 0;

  for (let i = 0; i < newClasses.length; i += batchSize) {
    const batch = newClasses.slice(i, i + batchSize);

    const { data, error } = await supabase
      .from('class_instances')
      .insert(batch)
      .select();

    if (error) {
      console.error(`Error creating batch ${Math.floor(i / batchSize) + 1}:`, error);
      break;
    }

    created += data.length;
    console.log(`   Created ${created}/${newClasses.length} classes...`);
  }

  console.log(`\n✅ Created ${created} recurring HB classes!\n`);

  // Show sample of created classes grouped by day
  for (const schedule of hbSchedule) {
    const { data: sampleClasses } = await supabase
      .from('class_instances')
      .select('class_date, class_type, start_time, end_time')
      .eq('class_type', schedule.classType)
      .order('class_date', { ascending: false })
      .limit(3);

    console.log(`${schedule.dayName} ${schedule.startTime} classes (latest 3):`);
    sampleClasses?.forEach(c => {
      console.log(`   ${c.class_date} - ${c.class_type} - ${c.start_time} to ${c.end_time}`);
    });
  }

  console.log('\n');
  process.exit(0);
}

createRecurringHBClasses().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
