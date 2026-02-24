require('dotenv').config();
const { Pool } = require('pg');

async function addPackageColumns() {
  // Create a PostgreSQL client using direct connection
  const pool = new Pool({
    host: 'db.fpdbfbxpthmaceuspcrf.supabase.co',
    port: 5432,
    user: 'postgres',
    password: '34HXi0Kv8X0WJ7gb',
    database: 'postgres',
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('=== Adding Package Columns to course_enrollments ===\n');
    console.log('Connecting to database...');

    const sql = `
      ALTER TABLE course_enrollments
      ADD COLUMN IF NOT EXISTS package_total_courses INT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS package_total_classes INT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS package_courses_remaining INT DEFAULT NULL;
    `;

    await pool.query(sql);
    console.log('✅ Columns added successfully!');

    // Verify the columns were added
    const verifyResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'course_enrollments'
      AND column_name IN ('package_total_courses', 'package_total_classes', 'package_courses_remaining')
      ORDER BY column_name;
    `);

    console.log('\nVerified columns:');
    verifyResult.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

addPackageColumns();
