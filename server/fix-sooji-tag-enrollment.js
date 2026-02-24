require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function fixSoojiTag() {
  try {
    console.log('Fixing Sooji Tag enrollment records...\n');

    // Step 1: Find Sooji Tag
    const { data: sooji, error: soojiError } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'soojitag@me.com')
      .single();

    if (soojiError) throw soojiError;
    console.log(`✓ Found Sooji Tag (ID: ${sooji.id})`);

    // Step 2: Delete ALL existing enrollments
    console.log('\nDeleting existing enrollment records...');
    const { error: deleteError } = await supabaseDb.supabase
      .from('course_enrollments')
      .delete()
      .eq('student_id', sooji.id);

    if (deleteError) throw deleteError;
    console.log('✓ Deleted old enrollment records');

    // Step 3: Create a single correct enrollment
    console.log('\nCreating correct enrollment record...');

    // Get her bookings to determine classes used
    const { data: bookings } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_date,
          class_type
        )
      `)
      .eq('student_id', sooji.id)
      .order('class_instances(class_date)', { ascending: true });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendedClasses = bookings.filter(b => {
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate < today && (b.status === 'attended' || b.status === 'booked');
    }).length;

    console.log(`  Classes attended/past: ${attendedClasses}`);
    console.log(`  Total bookings: ${bookings.length}`);

    const { data: enrollment, error: enrollError } = await supabaseDb.supabase
      .from('course_enrollments')
      .insert({
        student_id: sooji.id,
        course_identifier: 'WT1801AM_DL6',
        status: 'active',
        number_of_weeks: 6,
        total_weeks: 6,
        weeks_completed: attendedClasses,
        weeks_remaining: 6 - attendedClasses,
        class_credits_allocated: 6,
        class_credits_used: attendedClasses,
        class_credits_remaining: 6 - attendedClasses,
        course_start_date: '2026-01-17',
        start_date: '2026-01-17',
        instructor: 'DL',
        course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
        created_at: '2026-01-13T01:54:06.880488',
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (enrollError) throw enrollError;
    console.log('✓ Created correct enrollment:');
    console.log(`  Course ID: ${enrollment.course_identifier}`);
    console.log(`  Status: ${enrollment.status}`);
    console.log(`  Classes Used: ${enrollment.class_credits_used}/${enrollment.class_credits_allocated}`);

    // Step 4: Update course_purchase_count
    console.log('\nUpdating course_purchase_count...');
    const { error: updateError } = await supabaseDb.supabase
      .from('customers')
      .update({ course_purchase_count: 1 })
      .eq('id', sooji.id);

    if (updateError) throw updateError;
    console.log('✓ Updated course_purchase_count to 1');

    // Step 5: Verify the fix
    console.log('\n='.repeat(60));
    console.log('VERIFICATION:');
    console.log('='.repeat(60));

    const { data: verifyCustomer } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('id', sooji.id)
      .single();

    const { data: verifyEnrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', sooji.id);

    console.log(`\nCustomer:`)
    console.log(`  Name: ${verifyCustomer.first_name} ${verifyCustomer.last_name}`);
    console.log(`  Email: ${verifyCustomer.email}`);
    console.log(`  Course Purchase Count: ${verifyCustomer.course_purchase_count}`);

    console.log(`\nEnrollments: ${verifyEnrollments.length} total`);
    verifyEnrollments.forEach(e => {
      console.log(`  - Course: ${e.course_identifier}`);
      console.log(`    Status: ${e.status}`);
      console.log(`    Classes: ${e.classes_used}/${e.classes_allocated}`);
    });

    console.log(`\nBookings: ${bookings.length} total`);
    bookings.forEach(b => {
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      const isFuture = classDate >= today;
      console.log(`  - ${b.class_instances.class_type} on ${b.class_instances.class_date} - ${b.status} ${isFuture ? '(FUTURE)' : '(PAST)'}`);
    });

    console.log('\n✅ Sooji Tag enrollment fixed successfully!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

fixSoojiTag();
