-- Add password_hash column to customers table for student authentication
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Add comment to explain the column
COMMENT ON COLUMN customers.password_hash IS 'bcrypt hashed password for student authentication (NULL = needs verification)';
