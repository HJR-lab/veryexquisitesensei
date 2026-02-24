require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkWeekend7pmClasses() {
  const client = await pool.connect();
  try {
    // Check for weekend classes at 7pm or later
    const result = await client.query(`
      SELECT
        class_id,
        class_type,
        class_date,
        start_time,
        end_time,
        instructor,
        EXTRACT(DOW FROM class_date) as day_of_week,
        CASE
          WHEN EXTRACT(DOW FROM class_date) = 0 THEN 'Sunday'
          WHEN EXTRACT(DOW FROM class_date) = 6 THEN 'Saturday'
          ELSE 'Weekday'
        END as day_name
      FROM classes
      WHERE EXTRACT(DOW FROM class_date) IN (0, 6)
        AND start_time >= '19:00:00'
      ORDER BY class_date, start_time
      LIMIT 50;
    `);

    console.log(`\nFound ${result.rows.length} weekend 7pm+ classes:\n`);

    if (result.rows.length > 0) {
      console.log('These classes violate the schedule rules:');
      console.log('- Joyce Lim: Only weekdays (Tue, Thu, Fri) at 7pm');
      console.log('- Dillon Lin: Weekends only but only 9:30am & 1pm (NO 7pm)\n');

      result.rows.forEach(row => {
        console.log(`${row.day_name} ${row.class_date} | ${row.start_time}-${row.end_time} | ${row.instructor} | ${row.class_type} | ID: ${row.class_id}`);
      });
    } else {
      console.log('✓ No weekend 7pm classes found - schedule is correct!');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

checkWeekend7pmClasses().catch(console.error);
