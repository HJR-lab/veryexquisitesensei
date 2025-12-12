require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function addFridayJoyceClasses() {
  // Starting October 10, 2025 - 6 consecutive Fridays
  const startDate = new Date('2025-10-10');
  const classes = [];

  for (let i = 0; i < 6; i++) {
    const classDate = new Date(startDate);
    classDate.setDate(startDate.getDate() + (i * 7)); // Add 7 days for each week

    classes.push({
      class_date: classDate.toISOString().split('T')[0],
      start_time: '9:30 AM',
      end_time: '12:00 PM',
      class_type: 'Wheelthrowing Beginner',
      instructor: 'Joyce Lim',
      room: 'Main Studio',
      max_capacity: 8,
      current_enrollment: 0,
      updated_at: new Date().toISOString()
    });
  }

  console.log('Adding the following classes:');
  classes.forEach(c => {
    console.log(`  ${c.class_date} (Fri) ${c.start_time} - ${c.instructor}`);
  });

  const { data, error } = await supabase
    .from('class_instances')
    .insert(classes)
    .select();

  if (error) {
    console.error('❌ Error adding classes:', error);
  } else {
    console.log(`✅ Successfully added ${data.length} Friday 9:30 AM Joyce Lim classes`);
  }

  process.exit(0);
}

addFridayJoyceClasses();
