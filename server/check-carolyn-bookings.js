const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:34HXi0Kv8X0WJ7gb@db.fpdbfbxpthmaceuspcrf.supabase.co:5432/postgres'
});

(async () => {
  try {
    const result = await pool.query(`
      SELECT
        b.id as booking_id,
        b.status,
        ci.id as class_id,
        ci.class_date,
        ci.class_type,
        ci.start_time,
        ci.instructor
      FROM bookings b
      JOIN class_instances ci ON b.class_instance_id = ci.id
      JOIN customers c ON b.customer_id = c.id
      WHERE c.email = 'carolyn.wee@gmail.com'
      ORDER BY ci.class_date
    `);

    console.log('Total bookings for Carolyn:', result.rows.length);
    console.log('\nBookings:');
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.class_date} - ${row.class_type} - ${row.instructor} - Status: ${row.status} - Booking ID: ${row.booking_id}`);
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
