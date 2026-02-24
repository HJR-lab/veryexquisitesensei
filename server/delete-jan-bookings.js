require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Get all January 2026 bookings
  const { data: classes } = await supabase
    .from('class_instances')
    .select('id')
    .gte('class_date', '2026-01-01')
    .lte('class_date', '2026-01-31');

  const classIds = classes.map(c => c.id);

  const { data: bookings } = await supabase
    .from('bookings')
    .delete()
    .in('class_instance_id', classIds)
    .select();

  console.log('Deleted', bookings.length, 'January bookings');

  // Reset class enrollments
  await supabase
    .from('class_instances')
    .update({ current_enrollment: 0 })
    .in('id', classIds);

  // Reset enrollment flags
  await supabase
    .from('course_enrollments')
    .update({ bookings_created_at: null })
    .gte('course_start_date', '2026-01-01')
    .lte('course_start_date', '2026-01-31');

  console.log('Reset all enrollment flags');
  process.exit(0);
})();
