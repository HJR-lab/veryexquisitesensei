-- CRM Campaign System Tables

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'manual' CHECK (type IN ('manual', 'automated')),
  subject TEXT,
  html_body TEXT,
  segment TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'active', 'paused')),
  scheduled_at TIMESTAMPTZ,
  trigger_type TEXT CHECK (trigger_type IN ('post_course', 'lapsed', 'credit_expiry', 'welcome')),
  trigger_days INT DEFAULT 7,
  created_by INT REFERENCES customers(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_sends (
  id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id INT NOT NULL REFERENCES customers(id),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  resend_message_id TEXT,
  UNIQUE(campaign_id, customer_id)
);

CREATE TABLE IF NOT EXISTS campaign_events (
  id SERIAL PRIMARY KEY,
  campaign_send_id INT NOT NULL REFERENCES campaign_sends(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('delivered', 'opened', 'clicked', 'bounced')),
  event_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  location TEXT DEFAULT 'VES Pottery Studio, 75 Jalan Kelabu Asap, Singapore 278268',
  max_capacity INT,
  rsvp_deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  target_segment TEXT,
  campaign_id INT REFERENCES campaigns(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  customer_id INT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'attending', 'declined')),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE(event_id, customer_id)
);

INSERT INTO campaigns (name, type, subject, html_body, segment, status, trigger_type, trigger_days) VALUES
  ('Post-Course Follow-up', 'automated', 'We miss you at VES!', '', 'returning', 'paused', 'post_course', 7),
  ('Lapsed Student Re-engagement', 'automated', 'It''s been a while — come back to VES!', '', 'lapsed_60', 'paused', 'lapsed', 60),
  ('Credit Expiry Reminder', 'automated', 'Your VES credits are expiring soon', '', 'has_credits', 'paused', 'credit_expiry', 30),
  ('Welcome Series', 'automated', 'Welcome to VES Pottery Studio!', '', 'all', 'paused', 'welcome', 1)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_customer ON campaign_sends(customer_id);
CREATE INDEX IF NOT EXISTS idx_campaign_events_send ON campaign_events(campaign_send_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps(event_id);
