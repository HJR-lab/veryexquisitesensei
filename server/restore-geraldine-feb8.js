require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function restoreGeraldine() {
  try {
    console.log('Restoring Geraldine Brogden\'s Feb 8 class...\n');

    // Get Geraldine
    const { data: geraldine } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'gbr@uwcsea.edu.sg')
      .single();

    // Get the WT1801AM_DL6.4 class instance
    const { data: classInstance } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .eq('class_type', 'WT1801AM_DL6.4')
      .eq('class_date', '2026-02-08T00:00:00')
      .single();

    if (!classInstance) {
      console.error('Class instance not found');
      return;
    }

    console.log(`Found class: ${classInstance.class_type} on ${classInstance.class_date}`);

    // Restore the booking
    const now = new Date().toISOString();
    const { error } = await supabaseDb.supabase
      .from('bookings')
      .insert({
        student_id: geraldine.id,
        class_instance_id: classInstance.id,
        status: 'booked',
        booking_type: 'makeup',
        updated_at: now
      });

    if (error) {
      console.error('Error restoring booking:', error);
      return;
    }

    console.log('\n✅ Restored booking for WT1801AM_DL6.4 on Feb 8');
    console.log('   This is part of Geraldine\'s CURRENT active enrollment');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

restoreGeraldine();
