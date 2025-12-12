require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createBookingsForActiveStudents() {
  try {
    // Get all active students (course hasn't expired)
    const today = new Date().toISOString().split('T')[0];
    const { data: activeStudents, error: studentsError } = await supabase
      .from('customers')
      .select('id, email, first_name, last_name, course_purchase_date, course_expiry_date')
      .eq('customer_type', 'student')
      .gte('course_expiry_date', today);

    if (studentsError) throw studentsError;

    console.log(`Found ${activeStudents.length} active students`);

    // Get all wheelthrowing classes (these are the 6-week courses)
    const { data: classes, error: classesError } = await supabase
      .from('class_instances')
      .select('*')
      .ilike('class_type', '%wheelthrowing%')
      .order('class_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (classesError) throw classesError;

    console.log(`Found ${classes.length} wheelthrowing classes`);

    // Group classes by course (same time/instructor = same course)
    const courseGroups = {};
    classes.forEach(cls => {
      const key = `${cls.start_time}_${cls.instructor}`;
      if (!courseGroups[key]) {
        courseGroups[key] = [];
      }
      courseGroups[key].push(cls);
    });

    // Each course is 6 weeks
    const courses = [];
    Object.values(courseGroups).forEach(group => {
      for (let i = 0; i < group.length; i += 6) {
        const courseClasses = group.slice(i, i + 6);
        if (courseClasses.length === 6) {
          courses.push(courseClasses);
        }
      }
    });

    console.log(`Identified ${courses.length} complete 6-week courses`);

    // For each course, book 8 students (they're all sold out with 8/8)
    let totalBookingsCreated = 0;

    for (let courseIndex = 0; courseIndex < courses.length && courseIndex < activeStudents.length / 8; courseIndex++) {
      const course = courses[courseIndex];
      const studentsForCourse = activeStudents.slice(courseIndex * 8, (courseIndex + 1) * 8);

      console.log(`\n📚 Course ${courseIndex + 1}: ${course[0].start_time} with ${course[0].instructor}`);
      console.log(`   First class: ${course[0].class_date}`);
      console.log(`   Last class: ${course[5].class_date}`);

      // Book each student into all 6 classes
      for (const student of studentsForCourse) {
        for (const classInstance of course) {
          const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .insert({
              student_id: student.id,
              class_instance_id: classInstance.id,
              status: new Date(classInstance.class_date) < new Date() ? 'completed' : 'booked',
              attended: new Date(classInstance.class_date) < new Date() ? true : null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();

          if (bookingError) {
            console.error(`   ❌ Error booking ${student.email} for class ${classInstance.class_date}:`, bookingError.message);
          } else {
            totalBookingsCreated++;
          }
        }
        console.log(`   ✅ Booked ${student.first_name} ${student.last_name} (${student.email}) into all 6 classes`);
      }
    }

    console.log(`\n🎉 Created ${totalBookingsCreated} bookings for ${courses.length} courses`);
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createBookingsForActiveStudents();
