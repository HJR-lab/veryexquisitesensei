require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Check if Xiao Liu exists
  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .eq('email', 'amy1210liu1210@gamil.com');

  let customerId;

  if (existing && existing.length > 0) {
    customerId = existing[0].id;
    console.log('Found existing customer:', customerId);
  } else {
    // Create customer
    const { data: newCustomer, error } = await supabase
      .from('customers')
      .insert([{
        shopify_customer_id: String(Date.now()),
        first_name: 'Xiao',
        last_name: 'Liu',
        email: 'amy1210liu1210@gamil.com',
        customer_type: 'course',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      console.log('Error creating customer:', error.message);
      process.exit(1);
    }

    customerId = newCustomer[0].id;
    console.log('Created new customer:', customerId);
  }

  // Create enrollment
  const enrollment = {
    student_id: customerId,
    shopify_order_id: 6470000000001,
    course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
    course_variant_title: 'FRIDAYS • 23 Jan –27 Feb • 9:30am-12:00pm',
    course_type: 'Wheelthrowing Beginner',
    schedule_pattern: 'FRIDAY',
    number_of_weeks: 6,
    course_start_date: '2026-01-23',
    course_end_date: '2026-02-27',
    class_time: '9:30am - 12:00pm',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data: newEnrollment, error: enrollError } = await supabase
    .from('course_enrollments')
    .insert([enrollment])
    .select();

  if (enrollError) {
    console.log('Error creating enrollment:', enrollError.message);
    process.exit(1);
  }

  console.log('✅ Created enrollment ID:', newEnrollment[0].id);

  // Add to Friday classes
  const { data: classes } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2026-01-23')
    .lte('class_date', '2026-02-27')
    .eq('start_time', '9:30am')
    .ilike('class_type', '%WT2301AM%')
    .order('class_date');

  const bookings = classes.map(c => ({
    student_id: customerId,
    class_instance_id: c.id,
    status: 'booked',
    booking_type: 'regular',
    course_enrollment_id: newEnrollment[0].id,
    booking_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  const { data: createdBookings } = await supabase
    .from('bookings')
    .insert(bookings)
    .select();

  console.log('✅ Created', createdBookings.length, 'bookings');

  // Update class counts to 5
  for (const c of classes) {
    await supabase
      .from('class_instances')
      .update({ current_enrollment: 5 })
      .eq('id', c.id);
  }

  console.log('✅ Updated class enrollment counts to 5');

  await supabase
    .from('course_enrollments')
    .update({ bookings_created_at: new Date().toISOString() })
    .eq('id', newEnrollment[0].id);

  console.log('✅ Done!');
  process.exit(0);
})();
