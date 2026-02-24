const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'db.fpdbfbxpthmaceuspcrf.supabase.co',
  database: 'postgres',
  password: '34HXi0Kv8X0WJ7gb',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('Checking Carolyn\'s actual bookings (customer ID: 1778)...\n');

    const result = await pool.query(`
      SELECT
        b.id as booking_id,
        ci.class_date,
        ci.instructor,
        ci.class_type,
        ci.start_time,
        b.status
      FROM bookings b
      JOIN class_instances ci ON b.class_instance_id = ci.id
      WHERE b.student_id = 1778
      ORDER BY ci.class_date
    `);

    console.log(`Total bookings found: ${result.rowCount}\n`);

    if (result.rowCount > 0) {
      console.log('Bookings:');
      result.rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.class_date.toISOString().split('T')[0]} - ${row.instructor} - ${row.class_type} - ${row.start_time} - Status: ${row.status}`);
      });

      // Count by instructor
      const byInstructor = {};
      result.rows.forEach(row => {
        byInstructor[row.instructor] = (byInstructor[row.instructor] || 0) + 1;
      });

      console.log('\nBreakdown by instructor:');
      Object.entries(byInstructor).forEach(([instructor, count]) => {
        console.log(`  ${instructor}: ${count} classes`);
      });
    } else {
      console.log('No bookings found for this customer.');
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
