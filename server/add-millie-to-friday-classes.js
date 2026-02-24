require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Find Friday Jan 23 classes
  const { data: classes } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2026-01-23')
    .lte('class_date', '2026-02-27')
    .eq('start_time', '9:30am')
    .ilike('class_type', '%WT2301AM%')
    .order('class_date');

  if (!classes || classes.length === 0) {
    console.log('No Friday classes found');
    process.exit(1);
  }

  console.log(`Found ${classes.length} Friday classes\n`);

  // Create bookings for Millie (student 1209, enrollment 4782)
  const bookings = classes.map(c => ({
    student_id: 1209,
    class_instance_id: c.id,
    status: 'booked',
    booking_type: 'regular',
    course_enrollment_id: 4782,
    booking_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  const { data: created, error } = await supabase
    .from('bookings')
    .insert(bookings)
    .select();

  if (error) {
    console.log('Error:', error.message);
    process.exit(1);
  }

  console.log(`✅ Created ${created.length} bookings for Millie Wright\n`);

  // Update class enrollment counts to 4
  for (const c of classes) {
    await supabase
      .from('class_instances')
      .update({ current_enrollment: 4 })
      .eq('id', c.id);
  }

  console.log('✅ Updated class enrollment counts to 4');

  // Mark enrollment as having bookings
  await supabase
    .from('course_enrollments')
    .update({ bookings_created_at: new Date().toISOString() })
    .eq('id', 4782);

  console.log('✅ Marked enrollment as processed');

  process.exit(0);
})();
