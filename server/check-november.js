require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkNovember() {
  console.log('\n📊 DATABASE STATUS CHECK\n');
  console.log('==========================================\n');

  // Check November 2024 classes
  const { data: novClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2024-11-01')
    .lt('class_date', '2024-12-01')
    .order('class_date');

  console.log(`📅 November 2024 Classes: ${novClasses?.length || 0}`);
  
  if (novClasses && novClasses.length > 0) {
    console.log('\nSample November classes:');
    novClasses.slice(0, 5).forEach(c => {
      console.log(`   ${c.class_date} ${c.day_of_week} ${c.start_time} - ${c.class_type} (${c.current_enrollment} students)`);
    });
  }

  // Check December 2024 classes
  const { data: decClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2024-12-01')
    .lt('class_date', '2025-01-01')
    .order('class_date');

  console.log(`\n📅 December 2024 Classes: ${decClasses?.length || 0}`);

  // Total stats
  const { data: allEnrollments } = await supabase
    .from('course_enrollments')
    .select('id, bookings_created_at');

  const withBookings = allEnrollments?.filter(e => e.bookings_created_at) || [];
  const withoutBookings = allEnrollments?.filter(e => !e.bookings_created_at) || [];

  console.log(`\n📊 Overall Stats:`);
  console.log(`   Total enrollments: ${allEnrollments?.length || 0}`);
  console.log(`   With bookings: ${withBookings.length}`);
  console.log(`   Without bookings: ${withoutBookings.length}`);

  const { data: allClasses } = await supabase
    .from('class_instances')
    .select('id');
  
  const { data: allBookings } = await supabase
    .from('bookings')
    .select('id');

  console.log(`   Total classes: ${allClasses?.length || 0}`);
  console.log(`   Total bookings: ${allBookings?.length || 0}\n`);

  process.exit(0);
}

checkNovember().catch(console.error);
