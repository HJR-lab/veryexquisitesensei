const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  console.log('Fixing Huiting\'s course enrollment...\n');

  // Check current state of enrollment 5047
  const { data: enrollment, error: fetchError } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', 5047)
    .single();

  if (fetchError) {
    console.log('Error fetching enrollment:', fetchError);
    return;
  }

  console.log('Current enrollment state:');
  console.log('  ID:', enrollment.id);
  console.log('  Course Identifier:', enrollment.course_identifier);
  console.log('  Instructor:', enrollment.instructor);
  console.log('  Status:', enrollment.status);
  console.log('');

  // Update the enrollment with the correct course identifier
  const { data: updated, error: updateError } = await supabase
    .from('course_enrollments')
    .update({
      course_identifier: 'WT2201NT_JL6',
      instructor: 'Joyce Lim'
    })
    .eq('id', 5047)
    .select()
    .single();

  if (updateError) {
    console.log('Error updating enrollment:', updateError);
    return;
  }

  console.log('✅ Successfully updated enrollment:');
  console.log('  Course Identifier:', updated.course_identifier);
  console.log('  Instructor:', updated.instructor_name);
  console.log('\nNow all bookings (including the makeup) will be grouped under the WT2201NT_JL6 course.');
}

run();
