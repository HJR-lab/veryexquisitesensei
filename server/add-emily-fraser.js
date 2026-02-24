require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function addEmilyFraser() {
  try {
    console.log('\n🔧 Adding Emily Fraser...\n');

    // First, add Emily to customers table
    const { data: customer, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .insert([{
        shopify_customer_id: '8955901509790-emily',  // Temporary ID
        first_name: 'Emily',
        last_name: 'Fraser',
        email: 'missemilyfraser@yahoo.co.uk',
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

    console.log(`✅ Created customer: Emily Fraser (ID: ${customer.id})`);

    // Create 2 enrollments for Emily (quantity 2)
    const enrollmentsToCreate = [];
    for (let i = 0; i < 2; i++) {
      enrollmentsToCreate.push({
        student_id: customer.id,
        shopify_order_id: '2436',
        shopify_line_item_id: `2436-${i}`,
        course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
        course_variant_title: 'SATURDAYS • 17 Jan –21 Feb • 9:30am-12:00pm',
        course_type: 'Wheelthrowing Beginner',
        schedule_pattern: 'SATURDAY',
        number_of_weeks: 6,
        course_start_date: '2026-01-17',
        course_end_date: '2026-02-21',
        class_time: '9:30am - 12:00pm',
        instructor: 'Dillon Lin',
        room: 'Studio A',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    const { data: enrollments, error: enrollmentError } = await supabaseDb.supabase
      .from('course_enrollments')
      .insert(enrollmentsToCreate)
      .select();

    if (enrollmentError) {
      console.log(`❌ Error creating enrollments: ${enrollmentError.message}`);
      return;
    }

    console.log(`✅ Created ${enrollments.length} enrollments`);

    // Get classes for WT1701AM_DL6
    const { data: classes } = await supabaseDb.supabase
      .from('class_instances')
      .select('id')
      .like('class_type', 'WT1701AM_DL6.%')
      .order('class_date', { ascending: true });

    if (!classes || classes.length === 0) {
      console.log(`❌ No classes found for WT1701AM_DL6`);
      return;
    }

    console.log(`Found ${classes.length} classes`);

    // Create bookings for both enrollments
    const now = new Date().toISOString();
    let totalBookings = 0;

    for (const enrollment of enrollments) {
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
      } else {
        totalBookings += createdBookings.length;

        // Update enrollment
        await supabaseDb.supabase
          .from('course_enrollments')
          .update({ bookings_created_at: now })
          .eq('id', enrollment.id);
      }
    }

    console.log(`✅ Created ${totalBookings} total bookings for Emily Fraser (x2)`);
    console.log(`\n✅ Emily Fraser fully enrolled in WT1701AM_DL6!`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

addEmilyFraser();
