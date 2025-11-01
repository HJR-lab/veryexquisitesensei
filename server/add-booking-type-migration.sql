-- Add booking_type field to distinguish regular vs make-up bookings
-- Also add course_enrollment_id to group all 6 weeks together

ALTER TABLE "bookings"
ADD COLUMN "booking_type" TEXT NOT NULL DEFAULT 'regular',
ADD COLUMN "course_enrollment_id" TEXT;

-- Create index for course_enrollment_id
CREATE INDEX "bookings_course_enrollment_id_idx" ON "bookings"("course_enrollment_id");

-- Update comment
COMMENT ON COLUMN "bookings"."booking_type" IS 'Type of booking: regular (enrolled in this schedule) or makeup (rescheduled from another time)';
COMMENT ON COLUMN "bookings"."course_enrollment_id" IS 'Groups all 6 weeks of a course together. Format: studentId_scheduleKey_timestamp';
