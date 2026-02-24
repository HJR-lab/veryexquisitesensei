require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createWT1403AMClassesAndBookings() {
  console.log('=== CREATING WT1403AM_JL6 CLASS INSTANCES ===\n');

  const kevynJessieId = 1300;
  const now = new Date().toISOString();

  // Friday dates from March 14 to April 18, 2025 (6 weeks)
  const fridayDates = [
    { date: '2025-03-14', week: 1 },
    { date: '2025-03-21', week: 2 },
    { date: '2025-03-28', week: 3 },
    { date: '2025-04-04', week: 4 },
    { date: '2025-04-11', week: 5 },
    { date: '2025-04-18', week: 6 }
  ];

  const classIds = [];

  // Create class instances
  console.log('Creating class instances:\n');

  for (const { date, week } of fridayDates) {
    const { data, error} = await supabase
      .from('class_instances')
      .insert({
        class_type: `WT1403AM_JL6.${week}`,
        class_date: date,
        start_time: '9:30am',
        end_time: '12:00pm',
        instructor: 'Joyce Lim',
        room: 'Main Studio',
        max_capacity: 8,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error(`❌ Error creating class for ${date}:`, error.message);
    } else {
      console.log(`✅ Created class ${data.id} for ${date} - WT1403AM_JL6.${week}`);
      classIds.push(data.id);
    }
  }

  // Create enrollment
  console.log('\n=== CREATING ENROLLMENT ===\n');

  const { data: enrollment, error: enrollError } = await supabase
    .from('course_enrollments')
    .insert({
      student_id: kevynJessieId,
      course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
      course_identifier: 'WT1403AM_JL6',
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

  console.log(`✅ Created enrollment ${enrollment.id}`);

  // Create bookings
  console.log('\n=== CREATING BOOKINGS ===\n');

  for (const classId of classIds) {
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        student_id: kevynJessieId,
        class_instance_id: classId,
        course_enrollment_id: enrollment.id,
        status: 'attended',
        attended: true,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error(`❌ Error creating booking:`, error.message);
    } else {
      console.log(`✅ Created booking ${data.id} for class ${classId}`);
    }
  }

  console.log('\n=== SUMMARY ===\n');
  console.log(`Kevyn Jessie Yong (ID: 1300) now has:`);
  console.log(`- 1 enrollment: WT1403AM_JL6`);
  console.log(`- 6 bookings for Friday morning classes (9:30am-12:00pm)`);
  console.log(`\nThis represents Jessie Ong's 5th course total, under email kevyn.jessie@gmail.com`);
}

createWT1403AMClassesAndBookings().then(() => process.exit());
