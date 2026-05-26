-- Add mobile + date_of_birth columns to customers
-- The PUT /api/auth/profile handler and the Account form already exchange
-- these fields; the columns were missing so writes failed with Postgres 42703.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS date_of_birth DATE;
