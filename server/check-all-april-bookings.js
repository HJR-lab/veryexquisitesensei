const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, status, class_instance:class_instances\!bookings_class_instance_id_fkey(class_date, class_type)')
    .eq('student_id', 1182)
    .order('class_instance(class_date)');
  console.log('All April bookings (' + bookings.length + '):');
  bookings.forEach(b => {
    const date = b.class_instance ? b.class_instance.class_date.substring(0, 10) : 'no date';
    console.log('  ID:', b.id, '| Date:', date, '| Status:', b.status);
  });
}
run();
