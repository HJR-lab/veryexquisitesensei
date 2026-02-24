-- Create verification_codes table for student email verification
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

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_verification_codes_customer_id ON verification_codes(customer_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);

-- Add comment to table
COMMENT ON TABLE verification_codes IS 'Stores 6-digit PIN codes for student email verification';
