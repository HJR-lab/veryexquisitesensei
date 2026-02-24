require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createGeraldineEnrollment() {
  try {
    // Get Geraldine's customer info
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('email', 'gbr@uwcsea.edu.sg')
      .single();

    console.log(`Creating enrollment for: ${customer.first_name} ${customer.last_name}\n`);

    // Get her regular (non-makeup) bookings for WT2201NT_JL6
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          instructor
        )
      `)
      .eq('student_id', customer.id)
      .eq('booking_type', 'regular')
      .in('status', ['booked', 'completed', 'attended']);

    const wt2201Bookings = bookings.filter(b =>
      b.class_instances.class_type.startsWith('WT2201NT_JL6')
    );

    console.log(`Found ${wt2201Bookings.length} regular bookings for WT2201NT_JL6\n`);

    if (wt2201Bookings.length === 0) {
      console.log('No regular bookings found for WT2201NT_JL6. Exiting.');
      process.exit(0);
    }

    // Get course details from bookings
    const sortedBookings = wt2201Bookings.sort((a, b) =>
      new Date(a.class_instances.class_date) - new Date(b.class_instances.class_date)
    );
    const firstClass = sortedBookings[0];
    const instructor = firstClass.class_instances.instructor || 'Jolin Lim';

    // Create the enrollment
    const enrollmentData = {
      student_id: customer.id,
      course_identifier: 'WT2201NT_JL6',
      course_title: 'Wheelthrowing Course',
      course_type: 'Wheelthrowing',
      number_of_weeks: 6,
      total_weeks: 6,
      weeks_completed: 0,
      weeks_remaining: 6,
      start_date: firstClass.class_instances.class_date,
      course_start_date: firstClass.class_instances.class_date,
      expected_end_date: sortedBookings[sortedBookings.length - 1].class_instances.class_date,
      instructor: instructor,
      status: 'active',
      class_credits_allocated: 6,
      class_credits_used: 0,
      class_credits_remaining: 6,
      glazing_class_used: false,
      shopify_order_id: null // VES order, not Shopify
    };

    console.log('Creating enrollment with data:');
    console.log(JSON.stringify(enrollmentData, null, 2));
    console.log('');

    const { data: newEnrollment, error } = await supabase
      .from('course_enrollments')
      .insert([enrollmentData])
      .select()
      .single();

    if (error) {
      console.error('Error creating enrollment:', error);
      process.exit(1);
    }

    console.log(`✅ Created enrollment ID: ${newEnrollment.id}\n`);

    // Update all WT2201NT_JL6 bookings to link to this enrollment
    console.log('Linking bookings to enrollment...');
    const bookingIds = wt2201Bookings.map(b => b.id);

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ course_enrollment_id: newEnrollment.id })
      .in('id', bookingIds);

    if (updateError) {
      console.error('Error updating bookings:', updateError);
    } else {
      console.log(`✅ Linked ${bookingIds.length} bookings to enrollment\n`);
    }

    console.log('=== SUMMARY ===');
    console.log(`Created enrollment: WT2201NT_JL6`);
    console.log(`Start date: ${enrollmentData.start_date}`);
    console.log(`Linked bookings: ${bookingIds.length}`);
    console.log(`Enrollment ID: ${newEnrollment.id}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

createGeraldineEnrollment();
