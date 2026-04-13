-- Cohort periods: define broad date windows for WT rescheduling.
-- Students can reschedule any WT class to another WT class within the
-- same cohort period (no per-enrollment date check needed).
CREATE TABLE IF NOT EXISTS cohort_periods (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
