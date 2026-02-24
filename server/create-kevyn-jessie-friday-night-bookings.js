require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createKevynJessieFridayNightBookings() {
  console.log('=== CREATING KEVYN JESSIE FRIDAY NIGHT BOOKINGS (March 14 - April 18, 2025) ===\n');

  const kevynJessieId = 1300;

  // Get the WT1403NT_JL6 class IDs
  const { data: fridayClasses } = await supabase
    .from('class_instances')
    .select('*')
    .ilike('class_type', 'WT1403NT_JL6%')
    .order('class_date');

  console.log(`Found ${fridayClasses?.length || 0} WT1403NT_JL6 classes:\n`);

  fridayClasses?.forEach(cls => {
    console.log(`- ${cls.class_date} ${cls.class_type} (ID: ${cls.id})`);
  });

  // Create an enrollment first
  const now = new Date().toISOString();

  const { data: enrollment, error: enrollError } = await supabase
    .from('course_enrollments')
    .insert({
      student_id: kevynJessieId,
      course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
      course_identifier: 'WT1403NT_JL6',
      course_start_date: '2025-03-14',
      course_end_date: '2025-04-18',
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
  console.log(`- 1 enrollment: WT1403NT_JL6`);
  console.log(`- ${fridayClasses?.length || 0} bookings for Friday night classes (7:00 PM-9:30 PM)`);
  console.log(`\nThis is her 5th course under the different email address kevyn.jessie@gmail.com`);
}

createKevynJessieFridayNightBookings().then(() => process.exit());
