require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createRecurringHBClasses() {
  console.log('\n🎨 CREATING RECURRING HANDBUILDING CLASSES\n');
  console.log('==========================================\n');

  const startDate = new Date('2025-09-17'); // Sept 17, 2025 (Wednesday)
  const endDate = new Date('2026-12-31');   // Dec 31, 2026

  const instructor = 'LT';       // Default instructor
  const room = 'Main Studio';
  const maxCapacity = 12;        // HB classes capacity

  // HB class schedule: Wednesday 7pm, Monday 7pm, Saturday 4pm
  const hbSchedule = [
    { dayOfWeek: 3, dayName: 'Wednesday', startTime: '7:00pm',  endTime: '9:00pm',  timeSuffix: 'NT' },  // Wed 7pm (existing)
    { dayOfWeek: 1, dayName: 'Monday',    startTime: '7:00pm',  endTime: '9:00pm',  timeSuffix: 'NT' },  // Mon 7pm (new)
    { dayOfWeek: 6, dayName: 'Saturday',  startTime: '4:00pm',  endTime: '6:00pm',  timeSuffix: 'PM' },  // Sat 4pm (new)
  ];

  const classesToCreate = [];
  let currentDate = new Date(startDate);

  console.log(`Generating classes from ${startDate.toDateString()} to ${endDate.toDateString()}\n`);

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();

    // Check if this day matches any HB schedule
    const schedule = hbSchedule.find(s => s.dayOfWeek === dayOfWeek);

    if (schedule) {
      const dateStr = currentDate.toISOString().split('T')[0];

      // Format: HB_DDMMYY_LT (e.g., HB_170925_LT)
      const day = String(currentDate.getDate()).padStart(2, '0');
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const year = String(currentDate.getFullYear()).slice(-2);
      const classType = `HB_${day}${month}${year}_${instructor}`;

      classesToCreate.push({
        class_date: dateStr,
        start_time: schedule.startTime,
        end_time: schedule.endTime,
        class_type: classType,
        instructor: instructor,
        room: room,
        max_capacity: maxCapacity,
        current_enrollment: 0,
        status: 'active',
        class_technique: null,  // Instructor will set this
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
    const d = new Date(c.class_date);
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
    byCounts[dayName] = (byCounts[dayName] || 0) + 1;
  });
  console.log(`Generated ${classesToCreate.length} HB classes:`);
  Object.entries(byCounts).forEach(([day, count]) => console.log(`  ${day}: ${count}`));
  console.log();

  // Check if any already exist
  const { data: existingClasses } = await supabase
    .from('class_instances')
    .select('class_type, class_date, start_time')
    .like('class_type', 'HB_%');

  // Build set of existing class identifiers (class_type + date to handle same type different days)
  const existingKeys = new Set((existingClasses || []).map(c => `${c.class_type}_${c.class_date}_${c.start_time}`));
  const newClasses = classesToCreate.filter(c => {
    const key = `${c.class_type}_${c.class_date}_${c.start_time}`;
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
      .like('class_type', 'HB_%')
      .eq('start_time', schedule.startTime)
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
