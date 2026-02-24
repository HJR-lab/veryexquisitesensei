require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function check() {
  const { data: cls } = await supabase.from('class_instances').select('*').eq('id', 10378).single();
  console.log('Class:', cls.id, cls.class_type, cls.class_date);

  const { data: bookings } = await supabase.from('bookings').select('id, student_id, status').eq('class_instance_id', cls.id);
  console.log('Bookings:', bookings ? bookings.length : 0);
  if (bookings) bookings.forEach(b => console.log('  -', b.id, b.student_id, b.status));

  process.exit(0);
}
check();
