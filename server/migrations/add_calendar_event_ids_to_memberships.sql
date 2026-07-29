-- Membership term markers on the studio Google Calendar (info@ves.sg).
-- Each active membership gets two all-day events: a START marker on start_date
-- and an END/expiry marker on end_date. These columns hold their event ids so
-- syncMembership() can update in place (and delete on cancel/transfer) instead
-- of creating duplicates.
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS google_calendar_start_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_end_event_id text;

COMMENT ON COLUMN memberships.google_calendar_start_event_id IS 'Google Calendar event id for the all-day membership START marker on info@ves.sg';
COMMENT ON COLUMN memberships.google_calendar_end_event_id IS 'Google Calendar event id for the all-day membership END/expiry marker on info@ves.sg';
