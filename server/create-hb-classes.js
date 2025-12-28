require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createRecurringHBClasses() {
  console.log('\n🎨 CREATING RECURRING HANDBUILDING CLASSES\n');
  console.log('==========================================\n');

  const startDate = new Date('2025-09-17'); // Sept 17, 2025 (Wednesday)
  const endDate = new Date('2026-12-31');   // Dec 31, 2026

  const classTime = '19:00';  // 7:00 PM
  const endTime = '21:00';    // 9:00 PM
  const instructor = 'LT';       // Default instructor
  const room = 'Main Studio';
  const maxCapacity = 12;        // HB classes capacity

  const classesToCreate = [];
  let currentDate = new Date(startDate);

  console.log(`Generating classes from ${startDate.toDateString()} to ${endDate.toDateString()}\n`);

  while (currentDate <= endDate) {
    // Only create on Wednesdays (day 3)
    if (currentDate.getDay() === 3) {
      const dateStr = currentDate.toISOString().split('T')[0];

      // Format: HB_DDMMYY_LT (e.g., HB_170925_LT)
      const day = String(currentDate.getDate()).padStart(2, '0');
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const year = String(currentDate.getFullYear()).slice(-2);
      const classType = `HB_${day}${month}${year}_${instructor}`;

      classesToCreate.push({
        class_date: dateStr,
        start_time: classTime,
        end_time: endTime,
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

  console.log(`Generated ${classesToCreate.length} Wednesday HB classes\n`);

  // Check if any already exist
  const { data: existingClasses } = await supabase
    .from('class_instances')
    .select('class_type')
    .like('class_type', 'HB_%');

  const existingClassTypes = new Set((existingClasses || []).map(c => c.class_type));
  const newClasses = classesToCreate.filter(c => !existingClassTypes.has(c.class_type));

  console.log(`Existing HB classes: ${existingClassTypes.size}`);
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

  // Show sample of created classes
  const { data: sampleClasses } = await supabase
    .from('class_instances')
    .select('*')
    .like('class_type', 'HB_%')
    .order('class_date')
    .limit(5);

  console.log('Sample of created classes:');
  sampleClasses?.forEach(c => {
    console.log(`   ${c.class_date} - ${c.class_type} - ${c.start_time} to ${c.end_time}`);
  });

  console.log('\n');
  process.exit(0);
}

createRecurringHBClasses().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
