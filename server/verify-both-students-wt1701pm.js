require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function verifyBothStudents() {
  try {
    console.log('Verifying both Sarah and Calvin Chan (Mitchell) in WT1701PM_DL6...\n');

    // Get both accounts
    const { data: accounts } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .or('email.eq.Mitchell.chandx@gmail.com,email.eq.Mitchell.chandx+dup@gmail.com')
      .order('id');

    console.log(`Found ${accounts.length} accounts:\n`);

    for (const account of accounts) {
      console.log(`=== ${account.first_name} ${account.last_name} (ID: ${account.id}) ===`);
      console.log(`Email: ${account.email}`);
      console.log(`Course Purchase Count: ${account.course_purchase_count}`);
      console.log(`Classes Allocated: ${account.classes_allocated}`);

      // Get WT1701PM_DL6 bookings
      const { data: bookings } = await supabaseDb.supabase
        .from('bookings')
        .select(`
          *,
          class_instances!bookings_class_instance_id_fkey (
            class_type,
            class_date
          )
        `)
        .eq('student_id', account.id)
        .in('status', ['booked', 'completed', 'attended']);

      const wt1701Bookings = bookings.filter(b =>
        b.class_instances && b.class_instances.class_type.startsWith('WT1701PM_DL6')
      );

      console.log(`\nWT1701PM_DL6 bookings: ${wt1701Bookings.length}`);
      wt1701Bookings.forEach(b => {
        console.log(`  ${b.class_instances.class_date} - ${b.class_instances.class_type} (${b.status})`);
      });
      console.log('');
    }

    console.log('\n✅ Both students should appear in the Active Students list for WT1701PM_DL6');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

verifyBothStudents();
