const axios = require('axios');

// Use the running server's API
(async () => {
  try {
    // First, let's login as an admin to get a token
    // For testing, we'll just query the database directly using one of the existing patterns
    const { supabase } = require('./utils/supabaseDb');

    // Find Huiting
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('*')
      .ilike('first_name', '%huiting%')
      .single();

    if (custError) {
      console.error('Error finding customer:', custError);
      return;
    }

    console.log('Customer:', customer.db_customer_id, customer.first_name, customer.last_name);

    // Get all bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instance:class_instances!bookings_class_instance_id_fkey (*)
      `)
      .eq('student_id', customer.db_customer_id)
      .order('booking_date', { ascending: false });

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return;
    }

    console.log(`\nFound ${bookings.length} bookings:\n`);
    bookings.forEach(b => {
      console.log(`Booking ID: ${b.id}`);
      console.log(`  Course Enrollment ID: ${b.course_enrollment_id || 'NONE (standalone)'}`);
      console.log(`  Class: ${b.class_instance.class_type}`);
      console.log(`  Date: ${b.class_instance.class_date}`);
      console.log(`  Status: ${b.status}`);
      console.log(`  Attended: ${b.attended}`);
      console.log('');
    });

    // Get enrollments
    const { data: enrollments, error: enrollError } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', customer.db_customer_id);

    if (enrollError) {
      console.error('Error fetching enrollments:', enrollError);
      return;
    }

    console.log(`\nFound ${enrollments.length} enrollments:\n`);
    enrollments.forEach(e => {
      console.log(`Enrollment ID: ${e.id}`);
      console.log(`  Course: ${e.course_identifier}`);
      console.log(`  Instructor: ${e.instructor}`);
      console.log(`  Status: ${e.status}`);
      console.log('');
    });

  } catch (err) {
    console.error('Error:', err);
  }
})();
