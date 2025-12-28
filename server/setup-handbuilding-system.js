require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function setupHandbuildingSystem() {
  console.log('\n🎨 HANDBUILDING CREDIT SYSTEM SETUP\n');
  console.log('==========================================\n');

  console.log('This script will set up the Handbuilding credit-based system.\n');
  console.log('Steps:');
  console.log('  1. Run database migration (add credit columns)');
  console.log('  2. Create recurring Wednesday HB classes (Sept 17, 2025 - Dec 31, 2026)');
  console.log('  3. Convert existing HB students to credit system');
  console.log('  4. Verify setup\n');

  console.log('⚠️  IMPORTANT: You must run the database migration first!\n');

  // Step 1: Show migration instructions
  console.log('=== STEP 1: DATABASE MIGRATION ===\n');

  const migrationFile = path.join(__dirname, 'migrations', 'add-credit-system.sql');

  if (!fs.existsSync(migrationFile)) {
    console.error('❌ Migration file not found:', migrationFile);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('Please run this SQL in your Supabase dashboard:');
  console.log('https://supabase.com/dashboard/project/fpdbfbxpthmaceuspcrf/editor\n');
  console.log('SQL Editor > New Query > Paste the following:\n');
  console.log('---START SQL---');
  console.log(sql);
  console.log('---END SQL---\n');

  console.log('Once you have run the migration, press Ctrl+C to exit this script,');
  console.log('then run the following commands separately:\n');
  console.log('  node create-hb-classes.js              # Create recurring HB classes');
  console.log('  node convert-hb-students-to-credits.js # Convert existing students\n');

  console.log('\nOr if the migration is already complete, you can run:');
  console.log('  node create-hb-classes.js && node convert-hb-students-to-credits.js\n');

  console.log('After setup, the system will:');
  console.log('  ✓ Track HB student credits (4 or 8 classes)');
  console.log('  ✓ Allow students to self-register for Wednesday HB classes');
  console.log('  ✓ Let students use 1 credit for WT glazing classes');
  console.log('  ✓ Show technique type for each HB class (set by instructor)');
  console.log('  ✓ Automatically handle new HB Shopify orders with credits\n');

  process.exit(0);
}

setupHandbuildingSystem().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
