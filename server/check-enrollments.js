const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('id, status, course_title, course_start_date, course_end_date')
    .eq('student_id', 1182);
  console.log('Enrollments:', enrollments);
  console.log('');
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, status, course_enrollment_id, class_instance:class_instances\!bookings_class_instance_id_fkey(class_date)')
    .eq('student_id', 1182);
  console.log('Total bookings:', bookings.length);
  const withActiveEnrollment = bookings.filter(b => {
    const enr = enrollments.find(e => e.id === b.course_enrollment_id);
    return enr && enr.status === 'active';
  });
  console.log('Bookings with active enrollment:', withActiveEnrollment.length);
  console.log('');
  withActiveEnrollment.forEach(b => console.log('ID:', b.id, 'Status:', b.status, 'Date:', b.class_instance.class_date));
}
run();
