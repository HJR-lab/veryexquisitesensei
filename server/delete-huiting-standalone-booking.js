const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  console.log('Deleting standalone booking 27336 for Huiting...\n');

  // First, check what we're deleting
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', 27336)
    .single();

  if (fetchError) {
    console.log('Error fetching booking:', fetchError);
    return;
  }

  console.log('Booking to delete:', booking);
  console.log('');

  // Delete the booking
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', 27336);

  if (error) {
    console.log('Error deleting booking:', error);
  } else {
    console.log('✅ Successfully deleted standalone booking 27336');
    console.log('Huiting now has only the WT2201NT_JL6 course in their history');
  }
}

run();
