require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

const JAN2026_STUDENTS = [
  'sarahcherwh1011@gmail.com',
  'shine2starry@gmail.com',
  'charmaine.lauhuiqi@gmail.com',
  'liyiantai@gmail.com',
  'graceleeern@gmail.com', // Handbuilding
  'soojitag@me.com',
  'sfoo9940@gmail.com',
  'joey.lee2302@gmail.com' // Already enrolled
];

async function enrollJan2026Students() {
  try {
    console.log('\n📚 Enrolling January 2026 students...\n');

    // Define cohort period
    const cohortStartDate = '2026-01-17';
    const cohortEndDate = '2026-03-03';

    // Get all WT classes in the cohort period
    const { data: allClasses, error: classError } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', cohortStartDate)
      .lte('class_date', cohortEndDate)
      .order('class_date', { ascending: true });

    if (classError) {
      console.error('❌ Error fetching classes:', classError);
      return;
    }

    // Group classes by course identifier (base identifier without week number)
    const courseGroups = {};
    allClasses.forEach(cls => {
      const classType = cls.class_type.toUpperCase();

      // Skip Kids classes
      if (classType.includes('KD')) return;

      // Get base identifier (remove .X week number)
      const baseIdentifier = cls.class_type.split('.')[0];

      if (!courseGroups[baseIdentifier]) {
        courseGroups[baseIdentifier] = {
          identifier: baseIdentifier,
          classes: [],
          isHandbuilding: classType.includes('HB'),
          isWheelthrowing: classType.includes('WT')
        };
      }

      courseGroups[baseIdentifier].classes.push(cls);
    });

    // Get available courses
    const wtCourses = Object.values(courseGroups).filter(c => c.isWheelthrowing);
    const hbClasses = allClasses.filter(cls => cls.class_type.toUpperCase().includes('HB'));

    console.log(`\n📊 Found ${wtCourses.length} WT courses and ${hbClasses.length} HB classes\n`);

    // Display available WT courses
    console.log('Available WT Courses:');
    wtCourses.forEach((course, idx) => {
      const firstClass = course.classes[0];
      const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(firstClass.class_date).getDay()];
      console.log(`  ${idx + 1}. ${course.identifier} - ${dayOfWeek} ${firstClass.start_time}-${firstClass.end_time} (${course.classes.length} weeks)`);
    });

    // Process each student
    for (const email of JAN2026_STUDENTS) {
      console.log(`\n\n${'='.repeat(60)}`);
      console.log(`Processing: ${email}`);
      console.log('='.repeat(60));

      // Get customer
      const { data: customer, error: custError } = await supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('email', email)
        .single();

      if (custError || !customer) {
        console.log(`❌ Customer not found`);
        continue;
      }

      console.log(`✅ Found customer: ${customer.first_name} ${customer.last_name} (ID: ${customer.id})`);
      console.log(`   Classes allocated: ${customer.classes_allocated}`);

      // Check if already enrolled
      const { data: existingBookings } = await supabaseDb.supabase
        .from('bookings')
        .select('id, class_instances!bookings_class_instance_id_fkey(class_type, class_date)')
        .eq('student_id', customer.id)
        .gte('class_instances.class_date', cohortStartDate)
        .lte('class_instances.class_date', cohortEndDate);

      if (existingBookings && existingBookings.length > 0) {
        console.log(`   ✓ Already enrolled in ${existingBookings.length} classes`);
        existingBookings.forEach(b => {
          console.log(`      - ${b.class_instances?.class_type} on ${b.class_instances?.class_date}`);
        });
        continue;
      }

      // Determine course type based on classes_allocated
      const isHandbuilding = customer.classes_allocated === 4;
      const isWheelthrowing = customer.classes_allocated >= 6;

      if (isHandbuilding) {
        console.log(`\n   📝 Handbuilding student - will be enrolled manually as drop-in`);
        console.log(`   Available HB classes: ${hbClasses.length}`);
        continue;
      }

      if (!isWheelthrowing) {
        console.log(`   ⚠️  Unknown course type (classes_allocated: ${customer.classes_allocated})`);
        continue;
      }

      // For WT students, find a course with availability
      console.log(`\n   🔍 Finding available WT course...`);

      let assignedCourse = null;
      for (const course of wtCourses) {
        // Check enrollment for each class in this course
        let hasCapacity = true;

        for (const cls of course.classes) {
          const { count } = await supabaseDb.supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('class_instance_id', cls.id)
            .in('status', ['booked', 'completed']);

          if (count >= (cls.max_capacity || 8)) {
            hasCapacity = false;
            break;
          }
        }

        if (hasCapacity) {
          assignedCourse = course;
          break;
        }
      }

      if (!assignedCourse) {
        console.log(`   ❌ No available WT courses found`);
        continue;
      }

      const firstClass = assignedCourse.classes[0];
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(firstClass.class_date).getDay()];

      console.log(`\n   ✅ Assigning to: ${assignedCourse.identifier}`);
      console.log(`      Day: ${dayOfWeek} ${firstClass.start_time}-${firstClass.end_time}`);
      console.log(`      Weeks: ${assignedCourse.classes.length}`);
      console.log(`      Instructor: ${firstClass.instructor}`);

      // Enroll in all weeks
      let enrolled = 0;
      for (const classInstance of assignedCourse.classes) {
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
            console.log(`      ⏭️  Week ${weekNumber} (${classDate}) - Already enrolled`);
          } else {
            console.error(`      ❌ Week ${weekNumber} (${classDate}) - Error:`, bookingError.message);
          }
        } else {
          console.log(`      ✅ Week ${weekNumber} (${classDate}) - Enrolled`);
          enrolled++;
        }
      }

      // Update classes_used
      if (enrolled > 0) {
        const { error: updateError } = await supabaseDb.supabase
          .from('customers')
          .update({
            classes_used: enrolled,
            updated_at: new Date().toISOString()
          })
          .eq('id', customer.id);

        if (updateError) {
          console.error(`   ❌ Error updating classes_used:`, updateError.message);
        } else {
          console.log(`\n   ✅ Enrolled in ${enrolled}/${assignedCourse.classes.length} weeks`);
          console.log(`   ✅ Updated classes_used to ${enrolled}`);
        }
      }
    }

    console.log(`\n\n${'='.repeat(60)}`);
    console.log('✨ Enrollment complete!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

enrollJan2026Students();
