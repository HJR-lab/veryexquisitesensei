require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  console.log('Deleting all invalid January 2026 data...\n');

  // ONLY these 5 start dates are valid for Jan 2026
  const validDates = ['2026-01-17', '2026-01-18', '2026-01-20', '2026-01-22', '2026-01-23'];

  // 1. Delete enrollments NOT on valid start dates
  const { data: deleted1 } = await supabase
    .from('course_enrollments')
    .delete()
    .gte('course_start_date', '2026-01-01')
    .lte('course_start_date', '2026-01-31')
    .not('course_start_date', 'in', '("2026-01-17","2026-01-18","2026-01-20","2026-01-22","2026-01-23")')
    .select();

  console.log('Deleted', deleted1 ? deleted1.length : 0, 'enrollments with invalid start dates');

  // 2. Delete ALL Jan 2026 bookings
  const { data: janClasses } = await supabase
    .from('class_instances')
    .select('id')
    .gte('class_date', '2026-01-01')
    .lte('class_date', '2026-01-31');

  if (janClasses && janClasses.length > 0) {
    const classIds = janClasses.map(c => c.id);
    const { data: deleted2 } = await supabase
      .from('bookings')
      .delete()
      .in('class_instance_id', classIds)
      .select();

    console.log('Deleted', deleted2 ? deleted2.length : 0, 'bookings');

    await supabase
      .from('class_instances')
      .update({ current_enrollment: 0 })
      .in('id', classIds);
  }

  // 3. Reset enrollment flags
  await supabase
    .from('course_enrollments')
    .update({ bookings_created_at: null })
    .gte('course_start_date', '2026-01-01')
    .lte('course_start_date', '2026-01-31');

  console.log('\n✅ Cleanup complete');
  process.exit(0);
})();
