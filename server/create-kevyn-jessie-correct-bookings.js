require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createKevynJessieCorrectBookings() {
  console.log('=== CREATING KEVYN JESSIE BOOKINGS FOR WT1403AM_JL6 ===\n');

  const kevynJessieId = 1300;

  // Get the WT1403AM_JL6 class IDs
  const { data: fridayClasses } = await supabase
    .from('class_instances')
    .select('*')
    .ilike('class_type', 'WT1403AM_JL6%')
    .order('class_date');

  console.log(`Found ${fridayClasses?.length || 0} WT1403AM_JL6 classes:\n`);

  fridayClasses?.forEach(cls => {
    console.log(`- ${cls.class_date} ${cls.class_type} ${cls.start_time}-${cls.end_time} (ID: ${cls.id})`);
  });

  if (!fridayClasses || fridayClasses.length === 0) {
    console.log('\n❌ No WT1403AM_JL6 classes found. The classes may not exist yet.');
    return;
  }

  // Create an enrollment first
  const now = new Date().toISOString();

  const { data: enrollment, error: enrollError } = await supabase
    .from('course_enrollments')
    .insert({
      student_id: kevynJessieId,
      course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
      course_identifier: 'WT1403AM_JL6',
      course_start_date: fridayClasses[0].class_date.split('T')[0],
      course_end_date: fridayClasses[fridayClasses.length - 1].class_date.split('T')[0],
      status: 'completed',
      created_at: now,
      updated_at: now
    })
    .select()
    .single();

  if (enrollError) {
    console.error('❌ Error creating enrollment:', enrollError.message);
    return;
  }

  console.log(`\n✅ Created enrollment ${enrollment.id}`);

  // Create bookings
  console.log('\n=== CREATING BOOKINGS ===\n');

  for (const cls of fridayClasses || []) {
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        student_id: kevynJessieId,
        class_instance_id: cls.id,
        course_enrollment_id: enrollment.id,
        status: 'attended',
        attended: true,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error(`❌ Error creating booking for ${cls.class_date}:`, error.message);
    } else {
      console.log(`✅ Created booking ${data.id} for ${cls.class_date} - ${cls.class_type}`);
    }
  }

  console.log('\n=== SUMMARY ===\n');
  console.log(`Kevyn Jessie Yong (ID: 1300) now has:`);
  console.log(`- 1 enrollment: WT1403AM_JL6`);
  console.log(`- ${fridayClasses?.length || 0} bookings`);
  console.log(`\nThis represents Jessie Ong's 5th course, under the email kevyn.jessie@gmail.com`);
}

createKevynJessieCorrectBookings().then(() => process.exit());
