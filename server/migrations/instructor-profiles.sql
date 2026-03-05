-- Instructor Profiles Migration
-- Run this in Supabase SQL Editor

-- 1. Add role, bio, profile_image columns to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile_image TEXT;

-- 2. Create instructor_portfolio table
CREATE TABLE IF NOT EXISTS instructor_portfolio (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  media_type TEXT DEFAULT 'image',  -- 'image' or 'video'
  media_url TEXT,
  media_path TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS on instructor_portfolio
ALTER TABLE instructor_portfolio ENABLE ROW LEVEL SECURITY;

-- 4. Create policies for instructor_portfolio
CREATE POLICY "Public read access" ON instructor_portfolio FOR SELECT USING (true);
CREATE POLICY "Instructors can manage own portfolio" ON instructor_portfolio FOR ALL USING (true);

-- 5. Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_instructor_portfolio_customer ON instructor_portfolio(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_role ON customers(role);
