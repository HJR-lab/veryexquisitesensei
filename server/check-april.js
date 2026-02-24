const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  const { data, error } = await supabase.from('bookings').select('id, status, booking_type, attended').eq('student_id', 1182);
  if (error) console.log('Error:', error);
  if (data) {
    console.log('Total:', data.length);
    const counts = {};
    data.forEach(b => counts[b.status] = (counts[b.status] || 0) + 1);
    console.log('Counts:', counts);
    data.forEach(b => console.log('ID:', b.id, 'Status:', b.status, 'Type:', b.booking_type, 'Attended:', b.attended));
  }
}
run();
