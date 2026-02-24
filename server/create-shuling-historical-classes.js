require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createShulingHistoricalClasses() {
  const studentId = 1631; // Shuling Tan

  console.log('Creating historical class instances and bookings for Shuling...\n');

  // Order #1745 - Feb 16, 2024 - Course: Sundays 7 April–12 May (9:30am–12:00nn)
  // 6 weeks: Apr 7, 14, 21, 28, May 5, 12, 2024
  const course1Dates = [
    '2024-04-07',
    '2024-04-14',
    '2024-04-21',
    '2024-04-28',
    '2024-05-05',
    '2024-05-12'
  ];

  // Order #1936 - Jul 7, 2024 - Course: Sundays 11 August–15 September (9:30–12:00nn)
  // 6 weeks: Aug 11, 18, 25, Sep 1, 8, 15, 2024
  const course2Dates = [
    '2024-08-11',
    '2024-08-18',
    '2024-08-25',
    '2024-09-01',
    '2024-09-08',
    '2024-09-15'
  ];

  const allDates = [...course1Dates, ...course2Dates];

  console.log('Creating 12 historical class instances for Shuling...\n');

  let bookingsCreated = 0;

  for (let i = 0; i < allDates.length; i++) {
    const classDate = allDates[i];
    const courseNum = i < 6 ? 1 : 2;
    const weekNum = (i % 6) + 1;

    // Try to find existing class instance first
    let { data: classInstance, error: findError } = await supabase
      .from('class_instances')
      .select('*')
      .eq('class_date', classDate)
      .eq('start_time', '9:30am')
      .eq('room', 'Main Studio')
      .single();

    // If not found, create it
    if (findError || !classInstance) {
      const { data: newClass, error: classError } = await supabase
        .from('class_instances')
        .insert({
          class_type: 'Wheelthrowing Beginner',
          class_date: classDate,
          start_time: '9:30am',
          end_time: '12:00pm',
          instructor: 'VES Instructor',
          room: 'Main Studio',
          max_capacity: 8,
          current_enrollment: 1,
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (classError) {
        console.error(`Error creating class for ${classDate}:`, classError);
        continue;
      }

      classInstance = newClass;
      console.log(`✅ Created class instance ${classInstance.id} for ${classDate}`);
    } else {
      console.log(`✅ Found existing class instance ${classInstance.id} for ${classDate}`);
    }

    // Create booking for Shuling with 'attended' status
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        student_id: studentId,
        class_instance_id: classInstance.id,
        status: 'attended',
        attended: true,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (bookingError) {
      console.error(`Error creating booking for ${classDate}:`, bookingError);
      continue;
    }

    console.log(`✅ Created attended booking ${booking.id} for course ${courseNum}, week ${weekNum}`);
    bookingsCreated++;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Created ${bookingsCreated} historical attended bookings`);
  console.log('\nShuling now has:');
  console.log('  - 12 attended bookings (from 2 completed 2024 courses)');
  console.log('  - 6 booked bookings (current Jan-Mar 2026 course)');
  console.log('  - Total: 18 bookings');
  console.log('='.repeat(60));
}

createShulingHistoricalClasses().then(() => process.exit());
