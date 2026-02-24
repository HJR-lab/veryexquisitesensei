require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Direct count of bookings
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, student_id, class_instance_id')
    .gte('created_at', '2025-11-01');

  console.log('All bookings created since Nov 1, 2025:');
  console.log('Total:', bookings ? bookings.length : 0);
  
  if (error) {
    console.log('Error:', error.message);
  }

  if (bookings && bookings.length > 0) {
    console.log('\nFirst 10 bookings:');
    bookings.slice(0, 10).forEach(b => {
      console.log('  Student:', b.student_id, 'Class:', b.class_instance_id);
    });
  }

  process.exit(0);
})();
