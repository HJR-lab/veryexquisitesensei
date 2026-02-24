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
    console.log('Connecting to database...');

    // Delete the Joyce Lim bookings
    const result = await pool.query(`
      DELETE FROM bookings
      WHERE customer_id = (SELECT id FROM customers WHERE email = 'carolyn.wee@gmail.com')
      AND class_instance_id IN (
        SELECT ci.id
        FROM class_instances ci
        WHERE ci.instructor = 'Joyce Lim'
        AND ci.class_date IN (
          '2026-01-19',
          '2026-01-26',
          '2026-02-02',
          '2026-02-09',
          '2026-02-16'
        )
      )
      RETURNING id
    `);

    console.log(`✅ Deleted ${result.rowCount} Joyce Lim bookings`);

    // Show remaining bookings
    const remaining = await pool.query(`
      SELECT
        ci.class_date,
        ci.instructor,
        ci.class_type
      FROM bookings b
      JOIN class_instances ci ON b.class_instance_id = ci.id
      JOIN customers c ON b.customer_id = c.id
      WHERE c.email = 'carolyn.wee@gmail.com'
      ORDER BY ci.class_date
    `);

    console.log(`\nCarolyn now has ${remaining.rowCount} bookings remaining:`);
    remaining.rows.forEach(row => {
      console.log(`  - ${row.class_date.toISOString().split('T')[0]} with ${row.instructor}`);
    });

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
