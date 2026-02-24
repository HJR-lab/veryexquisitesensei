require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

const CORRECT_ENROLLMENTS = [
  { email: 'shine2starry@gmail.com', name: 'Shin N Chan', course: 'WT2001NT_JL6', day: 'Tuesday', time: '7:00pm-9:30pm' },
  { email: 'charmaine.lauhuiqi@gmail.com', name: 'Charmaine Lau', course: 'WT1801AM_DL6', day: 'Sunday', time: '9:30am-12:00pm' },
  { email: 'liyiantai@gmail.com', name: 'Li-Yian Tai', course: 'WT1701PM_DL6', day: 'Saturday', time: '1:00pm-3:30pm' }
];

async function enrollCorrectly() {
  try {
    console.log('\n📚 Enrolling students in correct courses...\n');

    for (const enrollment of CORRECT_ENROLLMENTS) {
      console.log('\n============================================================');
      console.log(`${enrollment.name} (${enrollment.email})`);
      console.log(`Course: ${enrollment.course} - ${enrollment.day} ${enrollment.time}`);
      console.log('============================================================');

      const { data: customer } = await supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('email', enrollment.email)
        .single();

      if (\!customer) {
        console.log('❌ Customer not found');
        continue;
      }

      console.log(`✅ Found customer (ID: ${customer.id})`);

      const { data: classes } = await supabaseDb.supabase
        .from('class_instances')
        .select('*')
        .ilike('class_type', `${enrollment.course}%`)
        .order('class_date', { ascending: true });

      if (\!classes || classes.length === 0) {
        console.log('❌ Course classes not found');
        continue;
      }

      console.log(`Found ${classes.length} weeks for ${enrollment.course}`);

      let enrolled = 0;
      for (const classInstance of classes) {
        const weekNumber = classInstance.class_type.split('.')[1] || '?';
        const classDate = new Date(classInstance.class_date).toLocaleDateString();

        const { error: bookingError } = await supabaseDb.supabase
          .from('bookings')
          .insert({
            student_id: customer.id,
            class_instance_id: classInstance.id,
            booking_date: new Date().toISOString(),
            status: 'booked',
            booking_type: 'regular',
            is_makeup_class: false,
            advance_notice_given: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (bookingError) {
          if (bookingError.code === '23505') {
            console.log(`  ⏭️  Week ${weekNumber} (${classDate}) - Already enrolled`);
          } else {
            console.error(`  ❌ Week ${weekNumber} (${classDate}) - Error:`, bookingError.message);
          }
        } else {
          console.log(`  ✅ Week ${weekNumber} (${classDate}) - Enrolled`);
          enrolled++;
        }
      }

      if (enrolled > 0) {
        await supabaseDb.supabase
          .from('customers')
          .update({
            classes_used: enrolled,
            updated_at: new Date().toISOString()
          })
          .eq('id', customer.id);

        console.log(`\n✅ Enrolled in ${enrolled}/${classes.length} weeks`);
      }
    }

    console.log('\n\n============================================================');
    console.log('✨ Enrollment complete\!');
    console.log('============================================================');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

enrollCorrectly();
