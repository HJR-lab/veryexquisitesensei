-- Create course_config table for admin-configurable course settings
CREATE TABLE IF NOT EXISTS course_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_type_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('wheelthrowing', 'handbuilding')),
  number_of_weeks INTEGER NOT NULL,
  max_capacity INTEGER NOT NULL DEFAULT 10,
  min_students_to_activate INTEGER NOT NULL DEFAULT 4,
  max_makeups INTEGER NOT NULL DEFAULT 3,
  makeup_fee NUMERIC(10,2) NOT NULL DEFAULT 40.00,
  noshow_fee NUMERIC(10,2) NOT NULL DEFAULT 20.00,
  reschedule_notice_hours INTEGER NOT NULL DEFAULT 24,
  finished_pieces INTEGER NOT NULL DEFAULT 7,
  clay_weight_limit_g INTEGER,
  additional_piece_fee NUMERIC(10,2) NOT NULL DEFAULT 20.00,
  email_auto_send BOOLEAN NOT NULL DEFAULT false,
  email_send_days_before INTEGER NOT NULL DEFAULT 5,
  email_template_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed existing course types with current hardcoded values
INSERT INTO course_config (course_type_key, display_name, category, number_of_weeks, max_capacity, min_students_to_activate, max_makeups, makeup_fee, noshow_fee, reschedule_notice_hours, finished_pieces, clay_weight_limit_g, additional_piece_fee, email_auto_send, email_send_days_before, email_template_key)
VALUES
  ('wt-6week', 'Wheelthrowing 6-Week', 'wheelthrowing', 6, 10, 4, 3, 40.00, 20.00, 24, 7, NULL, 20.00, false, 5, 'wt-6week'),
  ('wt-7week-inter', 'Wheelthrowing 7-Week Intermediate', 'wheelthrowing', 7, 10, 4, 3, 40.00, 20.00, 24, 8, NULL, 20.00, false, 5, 'wt-7week-inter'),
  ('wt-10class', 'Wheelthrowing 10-Class Package', 'wheelthrowing', 10, 10, 4, 3, 40.00, 20.00, 24, 11, NULL, 20.00, false, 5, 'wt-10class'),
  ('wt-3x6week', 'Wheelthrowing 3-Course Package', 'wheelthrowing', 18, 10, 4, 3, 40.00, 20.00, 24, 21, NULL, 20.00, false, 5, 'wt-3x6week'),
  ('hb-4credit', 'Handbuilding 4-Credit', 'handbuilding', 4, 10, 4, 0, 0.00, 0.00, 24, 5, 3000, 20.00, true, 0, 'hb-4credit'),
  ('hb-8credit', 'Handbuilding 8-Credit', 'handbuilding', 8, 10, 4, 0, 0.00, 0.00, 24, 9, 4500, 20.00, true, 0, 'hb-8credit')
ON CONFLICT (course_type_key) DO NOTHING;
