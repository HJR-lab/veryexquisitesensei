CREATE TABLE IF NOT EXISTS inbox_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gmail_message_id text UNIQUE NOT NULL,
  gmail_thread_id text,
  from_email text NOT NULL,
  from_name text,
  subject text,
  body_snippet text,
  received_at timestamptz,
  category text DEFAULT 'general',
  confidence float DEFAULT 0,
  summary text,
  draft_reply text,
  student_id int REFERENCES customers(id) ON DELETE SET NULL,
  status text DEFAULT 'new',
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_inbox_messages_status ON inbox_messages(status);
CREATE INDEX idx_inbox_messages_category ON inbox_messages(category);
CREATE INDEX idx_inbox_messages_gmail_id ON inbox_messages(gmail_message_id);

ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
