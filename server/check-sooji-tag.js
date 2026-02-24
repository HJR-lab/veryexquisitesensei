require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkSoojiTag() {
  try {
    console.log('Searching for Sooji Tag...\n');

    // Search for Sooji Tag
    const { data: customers, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .or('first_name.ilike.%sooji%,last_name.ilike.%tag%');

    if (customerError) throw customerError;

    if (customers.length === 0) {
      console.log('❌ No customer found with name Sooji Tag');
      return;
    }

    console.log(`Found ${customers.length} customer(s):\n`);

    for (const customer of customers) {
      console.log('='.repeat(60));
      console.log(`Customer: ${customer.first_name} ${customer.last_name}`);
      console.log(`  ID: ${customer.id}`);
      console.log(`  Email: ${customer.email}`);
      console.log(`  Shopify ID: ${customer.shopify_customer_id}`);
      console.log(`  Customer Type: ${customer.customer_type}`);
      console.log(`  Classes Allocated: ${customer.classes_allocated}`);
      console.log(`  Course Purchase Count: ${customer.course_purchase_count}`);

      // Get bookings
      const { data: bookings, error: bookingsError } = await supabaseDb.supabase
        .from('bookings')
        .select(`
          *,
          class_instances!bookings_class_instance_id_fkey (
            class_date,
            class_type,
            start_time
          )
        `)
        .eq('student_id', customer.id)
        .order('class_instances(class_date)', { ascending: true });

      if (bookingsError) {
        console.log(`  ⚠️  Error fetching bookings: ${bookingsError.message}`);
      } else {
        console.log(`\n  Bookings: ${bookings.length} total`);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (bookings.length > 0) {
          bookings.forEach(b => {
            const classDate = new Date(b.class_instances.class_date);
            classDate.setHours(0, 0, 0, 0);
            const isFuture = classDate >= today;
            console.log(`    - ${b.class_instances.class_type} on ${b.class_instances.class_date} - ${b.status} ${isFuture ? '(FUTURE)' : '(PAST)'}`);
          });
        }
      }

      // Get course enrollments
      const { data: enrollments, error: enrollmentsError } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('*')
        .eq('student_id', customer.id)
        .order('created_at', { ascending: false });

      if (enrollmentsError) {
        console.log(`  ⚠️  Error fetching enrollments: ${enrollmentsError.message}`);
      } else {
        console.log(`\n  Course Enrollments: ${enrollments.length} total`);

        if (enrollments.length > 0) {
          enrollments.forEach(e => {
            console.log(`    - Course ID: ${e.course_identifier || 'N/A'}`);
            console.log(`      Status: ${e.status}`);
            console.log(`      Classes Used: ${e.classes_used}/${e.classes_allocated}`);
            console.log(`      Start: ${e.course_start_date || 'N/A'}`);
            console.log(`      Expiry: ${e.course_expiry_date || 'N/A'}`);
            console.log(`      Created: ${e.created_at}`);
            console.log('');
          });
        }
      }

      console.log('='.repeat(60));
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkSoojiTag();
