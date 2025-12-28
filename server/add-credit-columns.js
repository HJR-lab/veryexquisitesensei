require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('\n📊 CREDIT SYSTEM MIGRATION\n');
  console.log('==========================================\n');

  console.log('⚠️  Database schema migration required!');
  console.log('\nPlease run the following SQL in your Supabase dashboard:\n');
  console.log('1. Go to: https://supabase.com/dashboard/project/fpdbfbxpthmaceuspcrf/editor');
  console.log('2. Click on "SQL Editor" in the left sidebar');
  console.log('3. Create a new query and paste the contents of:');
  console.log('   migrations/add-credit-system.sql\n');

  const migrationFile = path.join(__dirname, 'migrations', 'add-credit-system.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('Or copy and paste this SQL:\n');
  console.log('---START SQL---');
  console.log(sql);
  console.log('---END SQL---\n');

  console.log('After running the migration, the following changes will be made:');
  console.log('  ✓ Add class_credits_allocated to course_enrollments');
  console.log('  ✓ Add class_credits_used to course_enrollments');
  console.log('  ✓ Add class_credits_remaining to course_enrollments');
  console.log('  ✓ Add glazing_class_used to course_enrollments');
  console.log('  ✓ Add class_technique to class_instances');
  console.log('  ✓ Update all week 6 glazing classes to capacity 15');
  console.log('  ✓ Tag all week 6 classes with technique="glazing"\n');

  process.exit(0);
}

runMigration().catch(console.error);
