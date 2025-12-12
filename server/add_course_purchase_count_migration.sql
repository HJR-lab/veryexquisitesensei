-- Add course_purchase_count column to customers table
ALTER TABLE "customers"
ADD COLUMN IF NOT EXISTS "course_purchase_count" INTEGER NOT NULL DEFAULT 0;
