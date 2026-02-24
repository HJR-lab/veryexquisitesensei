require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function createDuplicateCustomers() {
  try {
    console.log('\n🔧 Creating duplicate customer records for quantity 2 orders...\n');

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
      console.log(`\n📝 Processing: ${order.name}`);

      // Find original customer
      const { data: originalCustomer } = await supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('email', order.email)
        .single();

      if (!originalCustomer) {
        console.log(`   ❌ Original customer not found`);
        continue;
      }

      console.log(`   Original customer ID: ${originalCustomer.id}`);

      // Check if duplicate already exists
      const emailParts = originalCustomer.email.split('@');
      const duplicateEmail = `${emailParts[0]}+dup@${emailParts[1]}`;

      const { data: existingDuplicate } = await supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('first_name', `${originalCustomer.first_name} (*)`)
        .eq('last_name', originalCustomer.last_name)
        .eq('email', duplicateEmail)
        .maybeSingle();

      let duplicateCustomer;

      if (existingDuplicate) {
        console.log(`   ℹ️  Duplicate customer already exists (ID: ${existingDuplicate.id})`);
        duplicateCustomer = existingDuplicate;
      } else {
        // Create duplicate customer with (*) in first name and modified email
        const { data: created, error } = await supabaseDb.supabase
          .from('customers')
          .insert([{
            shopify_customer_id: `${originalCustomer.shopify_customer_id}-dup`,
            first_name: `${originalCustomer.first_name} (*)`,
            last_name: originalCustomer.last_name,
            email: duplicateEmail,
            customer_type: originalCustomer.customer_type,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (error) {
          console.log(`   ❌ Error creating duplicate customer: ${error.message}`);
          continue;
        }

        duplicateCustomer = created;
        console.log(`   ✅ Created duplicate customer (ID: ${duplicateCustomer.id})`);
      }

      // Get the 2 enrollments for this customer/course
      const { data: enrollments } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('id, student_id')
        .eq('student_id', originalCustomer.id)
        .eq('schedule_pattern', order.course.day)
        .eq('class_time', order.course.time)
        .eq('course_start_date', order.course.start)
        .order('id', { ascending: true });

      if (!enrollments || enrollments.length !== 2) {
        console.log(`   ⚠️  Expected 2 enrollments, found ${enrollments?.length || 0}`);
        continue;
      }

      console.log(`   Found 2 enrollments: ${enrollments[0].id}, ${enrollments[1].id}`);

      // Update second enrollment to use duplicate customer ID
      const { error: updateError } = await supabaseDb.supabase
        .from('course_enrollments')
        .update({ 
          student_id: duplicateCustomer.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', enrollments[1].id);

      if (updateError) {
        console.log(`   ❌ Error updating enrollment: ${updateError.message}`);
        continue;
      }

      console.log(`   ✅ Updated enrollment ${enrollments[1].id} to use duplicate customer`);

      // Get all classes for this course
      const { data: classes } = await supabaseDb.supabase
        .from('class_instances')
        .select('id, class_type')
        .like('class_type', `${order.courseId}.%`)
        .order('class_date', { ascending: true });

      console.log(`   Creating bookings for ${classes.length} classes...`);

      const now = new Date().toISOString();
      let createdCount = 0;

      // Create bookings for duplicate customer
      for (const cls of classes) {
        const { error: bookingError } = await supabaseDb.supabase
          .from('bookings')
          .insert([{
            student_id: duplicateCustomer.id,
            class_instance_id: cls.id,
            status: 'booked',
            booking_type: 'regular',
            course_enrollment_id: enrollments[1].id,
            booking_date: now,
            created_at: now,
            updated_at: now
          }]);

        if (bookingError) {
          console.log(`   ❌ Error creating booking for ${cls.class_type}: ${bookingError.message}`);
        } else {
          createdCount++;
        }
      }

      console.log(`   ✅ Created ${createdCount}/${classes.length} bookings`);
    }

    console.log('\n\n✅ All duplicate customers and bookings created!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createDuplicateCustomers();
