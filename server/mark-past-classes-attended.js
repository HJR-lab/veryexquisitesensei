require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function markPastClassesAttended() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`Marking all past classes (before ${today.toISOString().split('T')[0]}) as attended...\n`);

  // Find all bookings with status 'booked' where the class date has passed
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      student_id,
      status,
      class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        class_type
      )
    `)
    .eq('status', 'booked');

  if (error) {
    console.error('Error fetching bookings:', error);
    return;
  }

  console.log(`Found ${bookings.length} booked bookings total`);

  const pastBookings = bookings.filter(b => {
    const classDate = new Date(b.class_instances.class_date);
    classDate.setHours(23, 59, 59, 999);
    return classDate < today;
  });

  console.log(`Found ${pastBookings.length} past classes to mark as attended\n`);

  let updated = 0;
  for (const booking of pastBookings) {
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'attended',
        attended: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', booking.id);

    if (updateError) {
      console.error(`Error updating booking ${booking.id}:`, updateError);
      continue;
    }

    console.log(`✅ Marked booking ${booking.id} as attended (Class: ${booking.class_instances.class_type}, Date: ${booking.class_instances.class_date})`);
    updated++;
  }

  console.log(`\n✅ Updated ${updated} bookings to 'attended' status`);
}

markPastClassesAttended().then(() => process.exit());
