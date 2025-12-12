-- Migration: Add pause usage tracking
-- Created: 2025-11-09
-- Purpose: Track if student has used their one-time pause per course

-- Add field to track if pause has been used for current course
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS pause_used_for_course BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pause_used_date TIMESTAMP;

-- Add comment for clarity
COMMENT ON COLUMN customers.pause_used_for_course IS 'Tracks if the student has used their one-time pause for their current course';
COMMENT ON COLUMN customers.pause_used_date IS 'Date when the student used their pause';
