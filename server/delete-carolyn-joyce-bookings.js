const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:34HXi0Kv8X0WJ7gb@db.fpdbfbxpthmaceuspcrf.supabase.co:5432/postgres'
});

(async () => {
  try {
    // First, find all bookings for Carolyn with Joyce Lim as instructor
    const findResult = await pool.query(`
      SELECT
        b.id as booking_id,
        ci.class_date,
        ci.class_type,
        ci.instructor
      FROM bookings b
      JOIN class_instances ci ON b.class_instance_id = ci.id
      JOIN customers c ON b.customer_id = c.id
      WHERE c.email = 'carolyn.wee@gmail.com'
        AND ci.instructor = 'Joyce Lim'
      ORDER BY ci.class_date
    `);

    console.log('Found', findResult.rows.length, 'bookings with Joyce Lim to delete:');
    findResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.class_date} - ${row.class_type} - Booking ID: ${row.booking_id}`);
    });

    if (findResult.rows.length === 0) {
      console.log('No bookings to delete.');
      await pool.end();
      return;
    }

    // Delete these bookings
    const bookingIds = findResult.rows.map(row => row.booking_id);
    const deleteResult = await pool.query(`
      DELETE FROM bookings
      WHERE id = ANY($1::int[])
      RETURNING id
    `, [bookingIds]);

    console.log('\n✅ Successfully deleted', deleteResult.rows.length, 'bookings');

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
})();
