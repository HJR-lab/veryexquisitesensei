require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function debugMitchellMissing() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Today: ${today}\n`);

    // Get Mitchell's account
    const { data: mitchell } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    console.log('Mitchell Chan account:');
    console.log(`  ID: ${mitchell.id}`);
    console.log(`  Name: ${mitchell.first_name} ${mitchell.last_name}`);
    console.log(`  Email: ${mitchell.email}`);
    console.log(`  Customer Type: ${mitchell.customer_type}`);
    console.log(`  Course Purchase Count: ${mitchell.course_purchase_count}`);
    console.log(`  Classes Allocated: ${mitchell.classes_allocated}`);

    // Check future bookings
    const { data: bookings } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date
        )
      `)
      .eq('student_id', mitchell.id)
      .in('status', ['booked', 'completed', 'attended']);

    const futureBookings = bookings.filter(b =>
      b.class_instances && b.class_instances.class_date >= today
    );

    console.log(`\n✅ Future bookings: ${futureBookings.length}`);
    futureBookings.forEach(b => {
      console.log(`  ${b.class_instances.class_date} - ${b.class_instances.class_type}`);
    });

    // Check if Mitchell should be in activeStudentIds
    const shouldBeActive = futureBookings.length > 0;
    console.log(`\n${shouldBeActive ? '✅' : '❌'} Should be in Active Students: ${shouldBeActive}`);

    // Check course status for WT1701PM_DL6
    const wt1701Bookings = bookings.filter(b =>
      b.class_instances && b.class_instances.class_type.startsWith('WT1701PM_DL6')
    );

    const hasStarted = wt1701Bookings.some(b => {
      const classDate = new Date(b.class_instances.class_date);
      const todayDate = new Date(today);
      classDate.setHours(0, 0, 0, 0);
      todayDate.setHours(0, 0, 0, 0);
      return classDate <= todayDate;
    });

    console.log(`\n✅ WT1701PM_DL6 has started: ${hasStarted}`);
    console.log(`Course status: ${hasStarted ? 'current' : 'upcoming'}`);

    if (!shouldBeActive || !hasStarted) {
      console.log('\n❌ PROBLEM FOUND: Mitchell should appear but logic excludes him');
    } else {
      console.log('\n🤔 Mitchell meets all criteria but is not appearing - check backend filtering');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

debugMitchellMissing();
