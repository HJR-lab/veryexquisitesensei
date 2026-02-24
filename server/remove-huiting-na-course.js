require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('Finding Huiting...');

    // Find Huiting's customer record
    const custResult = await pool.query(
      "SELECT * FROM customers WHERE first_name ILIKE '%huiting%'"
    );

    if (custResult.rows.length === 0) {
      console.log('Customer not found');
      await pool.end();
      return;
    }

    const customer = custResult.rows[0];
    console.log('Customer found:', {
      db_customer_id: customer.db_customer_id,
      name: `${customer.first_name} ${customer.last_name}`,
      email: customer.email
    });

    // Find all enrollments for Huiting
    const enrollResult = await pool.query(
      'SELECT * FROM course_enrollments WHERE db_customer_id = $1 ORDER BY created_at DESC',
      [customer.db_customer_id]
    );

    console.log(`\nFound ${enrollResult.rows.length} enrollments:`);
    enrollResult.rows.forEach((e, i) => {
      console.log(`${i + 1}. ID: ${e.course_enrollment_id}, Course: ${e.course_identifier || 'N/A'}, Instructor: ${e.instructor_name || 'N/A'}, Status: ${e.status}`);
    });

    // Find the N/A enrollment
    const naEnrollment = enrollResult.rows.find(e =>
      (!e.course_identifier || e.course_identifier === 'N/A') &&
      (!e.instructor_name || e.instructor_name === 'VES Instructor')
    );

    if (!naEnrollment) {
      console.log('\nNo N/A enrollment found');
      await pool.end();
      return;
    }

    console.log('\nN/A enrollment to delete:', {
      course_enrollment_id: naEnrollment.course_enrollment_id,
      course_identifier: naEnrollment.course_identifier,
      instructor_name: naEnrollment.instructor_name,
      status: naEnrollment.status
    });

    // Delete the N/A enrollment
    const deleteResult = await pool.query(
      'DELETE FROM course_enrollments WHERE course_enrollment_id = $1 RETURNING *',
      [naEnrollment.course_enrollment_id]
    );

    console.log('\n✅ Deleted enrollment:', deleteResult.rows[0].course_enrollment_id);

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
})();
