require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function addPackageColumns() {
  try {
    console.log('=== Adding Package Columns to course_enrollments ===\n');

    const sql = `
      -- Add package tracking columns to course_enrollments table
      ALTER TABLE course_enrollments
      ADD COLUMN IF NOT EXISTS package_total_courses INT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS package_total_classes INT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS package_courses_remaining INT DEFAULT NULL;
    `;

    // Use supabase.rpc or raw query
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // If RPC doesn't exist, try using raw client
      console.log('⚠️  RPC method not available. Please run this SQL manually in Supabase SQL Editor:');
      console.log('\n' + sql + '\n');
      console.log('Go to: https://supabase.com/dashboard/project/fpdbfbxpthmaceuspcrf/sql/new');
    } else {
      console.log('✅ Columns added successfully');
    }

  } catch (error) {
    console.error('Error:', error);
    console.log('\n⚠️  Please run this SQL manually in Supabase SQL Editor:');
    console.log('\nALTER TABLE course_enrollments');
    console.log('ADD COLUMN IF NOT EXISTS package_total_courses INT DEFAULT NULL,');
    console.log('ADD COLUMN IF NOT EXISTS package_total_classes INT DEFAULT NULL,');
    console.log('ADD COLUMN IF NOT EXISTS package_courses_remaining INT DEFAULT NULL;');
    console.log('\nGo to: https://supabase.com/dashboard/project/fpdbfbxpthmaceuspcrf/sql/new');
  } finally {
    process.exit(0);
  }
}

addPackageColumns();
