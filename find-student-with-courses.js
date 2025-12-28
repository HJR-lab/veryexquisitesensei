const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fpdbfbxpthmaceuspcrf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ2MDcyMTgsImV4cCI6MjA1MDE4MzIxOH0.iiUHlebjo_Vh3LDkKPEuL8fCPFRTyUEzW2ycW_MoLKc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function findStudentWithCourses() {
  try {
    // Get all course enrollments with student details
    const { data: enrollments, error } = await supabase
      .from('course_enrollments')
      .select(`
        id,
        course_title,
        course_start_date,
        course_end_date,
        instructor,
        number_of_weeks,
        student_id,
        customers!inner (
          email,
          first_name,
          last_name
        )
      `)
      .order('course_start_date', { ascending: false });

    if (error) throw error;

    // Group by student
    const studentCourses = {};
    enrollments.forEach(enrollment => {
      const studentId = enrollment.student_id;
      const email = enrollment.customers.email;
      
      if (!studentCourses[studentId]) {
        studentCourses[studentId] = {
          email: email,
          firstName: enrollment.customers.first_name,
          lastName: enrollment.customers.last_name,
          courses: []
        };
      }
      
      studentCourses[studentId].courses.push({
        title: enrollment.course_title,
        startDate: enrollment.course_start_date,
        endDate: enrollment.course_end_date,
        instructor: enrollment.instructor,
        weeks: enrollment.number_of_weeks
      });
    });

    // Find students with at least 2 courses
    const studentsWithMultipleCourses = Object.entries(studentCourses)
      .filter(([_, student]) => student.courses.length >= 2)
      .map(([id, student]) => ({
        studentId: id,
        ...student
      }))
      .sort((a, b) => b.courses.length - a.courses.length);

    console.log('\n=== STUDENTS WITH AT LEAST 2 COURSES ===\n');
    
    studentsWithMultipleCourses.slice(0, 5).forEach(student => {
      console.log(`Email: ${student.email}`);
      console.log(`Name: ${student.firstName} ${student.lastName}`);
      console.log(`Total Courses: ${student.courses.length}`);
      console.log('Courses:');
      student.courses.forEach((course, idx) => {
        console.log(`  ${idx + 1}. ${course.title} (${course.weeks} weeks)`);
        console.log(`     ${course.startDate} to ${course.endDate}`);
        console.log(`     Instructor: ${course.instructor}`);
      });
      console.log('\n---\n');
    });

    // Also get login credentials for test account
    const { data: testUser } = await supabase
      .from('customers')
      .select('email, first_name, last_name')
      .eq('email', 'admin@pottery.com')
      .single();

    if (testUser) {
      console.log('=== TEST LOGIN ACCOUNT ===');
      console.log(`Email: admin@pottery.com`);
      console.log(`Password: admin123`);
      console.log(`(This is the admin account - you can use it to test)\n`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

findStudentWithCourses();
