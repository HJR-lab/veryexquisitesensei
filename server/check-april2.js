const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, status, booking_type, class_instance:class_instances\!bookings_class_instance_id_fkey(class_date)')
    .eq('student_id', 1182)
    .order('class_instance(class_date)');
  if (error) console.log('Error:', error);
  if (data) {
    console.log('Total:', data.length, '\n');
    data.forEach(b => {
      const date = b.class_instance ? b.class_instance.class_date : 'no date';
      console.log('ID:', b.id, 'Date:', date, 'Status:', b.status, 'Type:', b.booking_type);
    });
    const jan27 = data.find(b => b.class_instance && b.class_instance.class_date === '2026-01-27');
    if (jan27) console.log('\nJan 27 booking ID:', jan27.id, 'Current status:', jan27.status, 'Type:', jan27.booking_type);
  }
}
run();
