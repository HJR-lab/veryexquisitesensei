require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function addRyanLing() {
  try {
    console.log('\n🔧 Adding Ryan Ling to Tuesday 7pm course...\n');

    // 1. Create customer
    const { data: customer, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .insert([{
        shopify_customer_id: '8995355558046',
        first_name: 'Ryan',
        last_name: 'Ling',
        email: 'ryan.ling@u.nus.edu',
        customer_type: 'student',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (customerError) {
      console.log(`❌ Error creating customer: ${customerError.message}`);
      return;
    }

    console.log(`✅ Created customer: Ryan Ling (ID: ${customer.id})`);

    // 2. Create enrollment
    const { data: enrollment, error: enrollmentError } = await supabaseDb.supabase
      .from('course_enrollments')
      .insert([{
        student_id: customer.id,
        shopify_order_id: '2441',
        shopify_line_item_id: '2441-ryan',
        course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
        course_variant_title: 'TUESDAYS • 20 Jan –3 Mar • 7:00pm-9:30pm - NO CLASS 17 FEB',
        course_type: 'Wheelthrowing Beginner',
        schedule_pattern: 'TUESDAY',
        number_of_weeks: 6,
        course_start_date: '2026-01-20',
        course_end_date: '2026-03-03',
        class_time: '7:00pm - 9:30pm',
        instructor: 'Joyce Lim',
        room: 'Studio A',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (enrollmentError) {
      console.log(`❌ Error creating enrollment: ${enrollmentError.message}`);
      return;
    }

    console.log(`✅ Created enrollment (ID: ${enrollment.id})`);

    // 3. Get all Tuesday 7pm classes
    const { data: classes } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .like('class_type', 'WT2001NT_JL6.%')
      .order('class_date', { ascending: true });

    console.log(`\n📅 Creating bookings for ${classes.length} classes...`);

    const now = new Date().toISOString();
    const bookings = classes.map(cls => ({
      student_id: customer.id,
      class_instance_id: cls.id,
      status: 'booked',
      booking_type: 'regular',
      course_enrollment_id: enrollment.id,
      booking_date: now,
      created_at: now,
      updated_at: now
    }));

    const { data: createdBookings, error: bookingError } = await supabaseDb.supabase
      .from('bookings')
      .insert(bookings)
      .select();

    if (bookingError) {
      console.log(`❌ Error creating bookings: ${bookingError.message}`);
      return;
    }

    console.log(`✅ Created ${createdBookings.length} bookings`);

    // 4. Update enrollment
    await supabaseDb.supabase
      .from('course_enrollments')
      .update({ bookings_created_at: now })
      .eq('id', enrollment.id);

    // 5. Update class enrollment counts
    for (const cls of classes) {
      const { count } = await supabaseDb.supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('class_instance_id', cls.id);

      await supabaseDb.supabase
        .from('class_instances')
        .update({ current_enrollment: count })
        .eq('id', cls.id);
    }

    console.log(`\n✅ Ryan Ling added to WT2001NT_JL6 (Tuesday 7pm)!`);

    // Show final enrollment
    console.log('\n📊 Current enrollments:');
    const { data: finalBookings } = await supabaseDb.supabase
      .from('bookings')
      .select('*, customers(first_name, last_name)')
      .eq('class_instance_id', classes[0].id)
      .order('student_id');

    finalBookings.forEach(b => {
      console.log(`   - ${b.customers.first_name} ${b.customers.last_name}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

addRyanLing();
