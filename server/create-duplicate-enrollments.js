require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function createDuplicateEnrollments() {
  try {
    console.log('\n🔧 Creating duplicate enrollments for quantity 2 orders...\n');

    // The 4 customers who ordered quantity 2
    const doubleOrders = [
      {
        email: 'samanthayeo93@gmail.com',
        name: 'Samantha Yeo',
        course: { day: 'SATURDAY', time: '1:00pm - 3:30pm', start: '2026-01-17' },
        courseId: 'WT1701PM_DL6'
      },
      {
        email: 'Mitchell.chandx@gmail.com',
        name: 'Karyn Chan',
        course: { day: 'SATURDAY', time: '1:00pm - 3:30pm', start: '2026-01-17' },
        courseId: 'WT1701PM_DL6'
      },
      {
        email: 'pehmax@gmail.com',
        name: 'Max Peh',
        course: { day: 'TUESDAY', time: '7:00pm - 9:30pm', start: '2026-01-20' },
        courseId: 'WT2001NT_JL6'
      },
      {
        email: 'missemilyfraser@yahoo.co.uk',
        name: 'Emily Fraser',
        course: { day: 'SATURDAY', time: '9:30am - 12:00pm', start: '2026-01-17' },
        courseId: 'WT1701AM_DL6'
      }
    ];

    for (const order of doubleOrders) {
      console.log(`\n📝 Processing: ${order.name} (${order.email})`);
      console.log(`   Course: ${order.courseId} - ${order.course.day}s ${order.course.time}`);

      // Find the customer
      const { data: customer } = await supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('email', order.email)
        .single();

      if (!customer) {
        console.log(`   ❌ Customer not found in database`);
        continue;
      }

      // Check existing enrollments for this customer in this cohort
      const { data: existingEnrollments } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('*')
        .eq('student_id', customer.id)
        .eq('schedule_pattern', order.course.day)
        .eq('class_time', order.course.time)
        .eq('course_start_date', order.course.start);

      console.log(`   Current enrollments: ${existingEnrollments?.length || 0}`);

      // Create the missing enrollment (we need 2 total, so create 1 more)
      if (existingEnrollments && existingEnrollments.length === 1) {
        const templateEnrollment = existingEnrollments[0];

        // Create duplicate enrollment
        const newEnrollment = {
          student_id: customer.id,
          shopify_order_id: templateEnrollment.shopify_order_id,
          shopify_line_item_id: templateEnrollment.shopify_line_item_id,
          course_title: templateEnrollment.course_title,
          course_variant_title: templateEnrollment.course_variant_title,
          course_type: templateEnrollment.course_type,
          schedule_pattern: templateEnrollment.schedule_pattern,
          number_of_weeks: templateEnrollment.number_of_weeks,
          course_start_date: templateEnrollment.course_start_date,
          course_end_date: templateEnrollment.course_end_date,
          class_time: templateEnrollment.class_time,
          instructor: templateEnrollment.instructor,
          room: templateEnrollment.room,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data: created, error } = await supabaseDb.supabase
          .from('course_enrollments')
          .insert([newEnrollment])
          .select();

        if (error) {
          console.log(`   ❌ Error creating enrollment: ${error.message}`);
          continue;
        }

        console.log(`   ✅ Created duplicate enrollment (ID: ${created[0].id})`);

        // Get classes for this course
        const { data: classes } = await supabaseDb.supabase
          .from('class_instances')
          .select('id')
          .like('class_type', `${order.courseId}.%`)
          .order('class_date', { ascending: true});

        if (classes && classes.length > 0) {
          // Create bookings for the new enrollment
          const now = new Date().toISOString();
          const bookings = classes.map(cls => ({
            student_id: customer.id,
            class_instance_id: cls.id,
            status: 'booked',
            booking_type: 'regular',
            course_enrollment_id: created[0].id,
            booking_date: now,
            created_at: now,
            updated_at: now
          }));

          const { data: createdBookings, error: bookingError } = await supabaseDb.supabase
            .from('bookings')
            .insert(bookings)
            .select();

          if (bookingError) {
            console.log(`   ❌ Error creating bookings: ${bookingError.message}`);
          } else {
            console.log(`   ✅ Created ${createdBookings.length} bookings`);

            // Update enrollment
            await supabaseDb.supabase
              .from('course_enrollments')
              .update({ bookings_created_at: now })
              .eq('id', created[0].id);
          }
        }
      } else {
        console.log(`   ⚠️  Unexpected enrollment count: ${existingEnrollments?.length || 0}`);
      }
    }

    console.log('\n\n✅ All duplicate enrollments created!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createDuplicateEnrollments();
