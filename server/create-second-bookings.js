require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function createSecondBookings() {
  try {
    console.log('\n🔧 Creating second bookings for quantity 2 orders...\n');

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
      console.log(`   Course: ${order.courseId}`);

      // Find the customer
      const { data: customer } = await supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('email', order.email)
        .single();

      if (!customer) {
        console.log(`   ❌ Customer not found`);
        continue;
      }

      // Get both enrollments
      const { data: enrollments } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('id')
        .eq('student_id', customer.id)
        .eq('schedule_pattern', order.course.day)
        .eq('class_time', order.course.time)
        .eq('course_start_date', order.course.start)
        .order('id', { ascending: true });

      if (!enrollments || enrollments.length !== 2) {
        console.log(`   ⚠️  Expected 2 enrollments, found ${enrollments?.length || 0}`);
        continue;
      }

      console.log(`   Enrollments: ${enrollments[0].id}, ${enrollments[1].id}`);

      // Get all classes for this course
      const { data: classes } = await supabaseDb.supabase
        .from('class_instances')
        .select('id, class_type, class_date')
        .like('class_type', `${order.courseId}.%`)
        .order('class_date', { ascending: true });

      console.log(`   Classes: ${classes.length}`);

      const now = new Date().toISOString();
      let createdCount = 0;

      // For each class, check if second enrollment has a booking
      for (const cls of classes) {
        const { data: existingBookings } = await supabaseDb.supabase
          .from('bookings')
          .select('id, course_enrollment_id')
          .eq('student_id', customer.id)
          .eq('class_instance_id', cls.id);

        const hasFirstBooking = existingBookings.some(b => b.course_enrollment_id === enrollments[0].id);
        const hasSecondBooking = existingBookings.some(b => b.course_enrollment_id === enrollments[1].id);

        if (hasFirstBooking && !hasSecondBooking) {
          // Create second booking
          const { error } = await supabaseDb.supabase
            .from('bookings')
            .insert([{
              student_id: customer.id,
              class_instance_id: cls.id,
              status: 'booked',
              booking_type: 'regular',
              course_enrollment_id: enrollments[1].id,
              booking_date: now,
              created_at: now,
              updated_at: now
            }]);

          if (error) {
            console.log(`   ❌ Error creating booking for ${cls.class_type}: ${error.message}`);
          } else {
            createdCount++;
          }
        }
      }

      console.log(`   ✅ Created ${createdCount} second bookings`);

      // Update enrollment
      if (createdCount > 0) {
        await supabaseDb.supabase
          .from('course_enrollments')
          .update({ bookings_created_at: now })
          .eq('id', enrollments[1].id);
      }
    }

    console.log('\n\n✅ All second bookings created!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createSecondBookings();
