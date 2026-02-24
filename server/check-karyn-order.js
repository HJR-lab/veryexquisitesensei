require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkKarynOrder() {
  try {
    // Find Mitchell and Sarah
    const { data: students } = await supabase
      .from('customers')
      .select('*')
      .in('email', ['Mitchell.chandx@gmail.com', 'Mitchell.chandx+dup@gmail.com']);

    console.log('=== Students ===');
    students.forEach(s => {
      console.log(`${s.first_name} ${s.last_name} - ${s.email} (ID: ${s.id})`);
      console.log(`  course_purchase_count: ${s.course_purchase_count}`);
      console.log(`  classes_allocated: ${s.classes_allocated}`);
      console.log('');
    });

    // Check their enrollments
    for (const student of students) {
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('*')
        .eq('student_id', student.id);

      console.log(`${student.first_name} ${student.last_name} - Enrollments (${enrollments?.length || 0}):`);

      if (enrollments && enrollments.length > 0) {
        enrollments.forEach(e => {
          console.log(`  - ${e.course_identifier || e.course_title}`);
          console.log(`    Shopify Order ID: ${e.shopify_order_id}`);
          console.log(`    Course Title: ${e.course_title}`);
          console.log(`    Variant Title: ${e.course_variant_title || 'N/A'}`);
          console.log(`    Status: ${e.status}`);
          console.log(`    Credits: ${e.class_credits_allocated || 0}`);
          console.log('');
        });
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkKarynOrder();
