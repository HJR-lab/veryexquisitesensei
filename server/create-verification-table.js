require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function createVerificationTable() {
  try {
    console.log('\n📋 Creating verification_codes table...\n');

    // Create verification_codes table using Supabase SQL
    const { data, error } = await supabaseDb.supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS verification_codes (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          email VARCHAR(255) NOT NULL,
          code VARCHAR(6) NOT NULL,
          verified BOOLEAN DEFAULT FALSE,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- Create index on customer_id for faster lookups
        CREATE INDEX IF NOT EXISTS idx_verification_codes_customer_id ON verification_codes(customer_id);

        -- Create index on email for faster lookups
        CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);

        -- Add unique constraint to prevent multiple active codes
        CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_codes_unique_active
        ON verification_codes(customer_id, email)
        WHERE verified = FALSE;
      `
    });

    if (error) {
      console.error('❌ Error creating table:', error);
      console.log('\nTrying alternative approach with direct SQL execution...\n');

      // Alternative: Create table structure info for manual creation
      console.log('Please create the verification_codes table manually in Supabase with:');
      console.log(`
CREATE TABLE verification_codes (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_verification_codes_customer_id ON verification_codes(customer_id);
CREATE INDEX idx_verification_codes_email ON verification_codes(email);
      `);
      return;
    }

    console.log('✅ verification_codes table created successfully!');
    console.log('\nTable structure:');
    console.log('  - id: Primary key');
    console.log('  - customer_id: Foreign key to customers table');
    console.log('  - email: Customer email address');
    console.log('  - code: 6-digit verification code');
    console.log('  - verified: Whether code has been verified');
    console.log('  - expires_at: When the code expires');
    console.log('  - created_at: Timestamp of creation');
    console.log('  - updated_at: Timestamp of last update');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createVerificationTable();
