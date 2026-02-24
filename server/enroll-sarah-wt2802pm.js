require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function enrollSarahWT2802PM() {
  try {
    console.log('Enrolling Sarah Chan in WT2802PM_JL6...\n');

    // Get Sarah's customer info
    const { data: sarah } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'Mitchell.chandx+dup@gmail.com')
      .single();

    console.log(`Sarah Chan (ID: ${sarah.id})`);
    console.log(`Current Course Purchase Count: ${sarah.course_purchase_count}\n`);

    // Get WT2802PM_JL6 classes
    const { data: classes } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .ilike('class_type', 'WT2802PM_JL6%')
      .order('class_date', { ascending: true });

    console.log(`Found ${classes.length} classes in WT2802PM_JL6:`);
    classes.forEach(c => {
      console.log(`  - ${c.class_date} (ID: ${c.id})`);
    });
    console.log('');

    // Create bookings for all 6 classes
    const now = new Date().toISOString();
    for (const classInstance of classes) {
      const { error } = await supabaseDb.supabase
        .from('bookings')
        .insert({
          student_id: sarah.id,
          class_instance_id: classInstance.id,
          status: 'booked',
          booking_type: 'regular',
          updated_at: now
        });

      if (error) {
        console.error(`❌ Error creating booking for ${classInstance.class_date}:`, error);
      } else {
        console.log(`✅ Created booking for ${classInstance.class_date}`);
      }
    }

    // Update Sarah's course_purchase_count to 2
    const { error: updateError } = await supabaseDb.supabase
      .from('customers')
      .update({
        course_purchase_count: 2
      })
      .eq('id', sarah.id);

    if (updateError) {
      console.error('❌ Error updating course_purchase_count:', updateError);
    } else {
      console.log('\n✅ Updated Sarah\'s course_purchase_count to 2');
    }

    console.log('\n✅ Sarah Chan now has:');
    console.log('   - WT1701PM_DL6 (CURRENT)');
    console.log('   - WT2802PM_JL6 (UPCOMING)');
    console.log('\nShe will appear in both Active Students and Upcoming Enrollments');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

enrollSarahWT2802PM();
