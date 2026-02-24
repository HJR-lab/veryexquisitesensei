require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkMitchellAccounts() {
  try {
    console.log('Checking Mitchell.chandx accounts...\n');

    // Find all Mitchell.chandx accounts
    const { data: customers } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .or('email.eq.Mitchell.chandx@gmail.com,email.eq.Mitchell.chandx+dup@gmail.com');

    console.log(`Found ${customers.length} accounts:`);
    customers.forEach(c => {
      console.log(`  ${c.first_name} ${c.last_name} (ID: ${c.id}) - ${c.email}`);
      console.log(`    Customer Type: ${c.customer_type}`);
      console.log(`    Classes Allocated: ${c.classes_allocated}`);
    });

    // Check WT1701PM_DL6 bookings for both accounts
    for (const customer of customers) {
      console.log(`\n=== ${customer.first_name} ${customer.last_name} (${customer.email}) ===`);

      const { data: bookings } = await supabaseDb.supabase
        .from('bookings')
        .select(`
          *,
          class_instances!bookings_class_instance_id_fkey (
            class_type,
            class_date
          )
        `)
        .eq('student_id', customer.id)
        .in('status', ['booked', 'completed', 'attended'])
        .order('class_instances(class_date)', { ascending: true });

      const wt1701Bookings = bookings.filter(b =>
        b.class_instances && b.class_instances.class_type.startsWith('WT1701PM_DL6')
      );

      console.log(`WT1701PM_DL6 bookings: ${wt1701Bookings.length}`);
      wt1701Bookings.forEach(b => {
        console.log(`  ${b.class_instances.class_type} - ${b.class_instances.class_date} (${b.status})`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkMitchellAccounts();
