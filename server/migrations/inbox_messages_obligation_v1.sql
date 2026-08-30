-- VES Obligation v1: make Gmail inbox agent-operable without creating a parallel surface.
-- Safe to run repeatedly.

ALTER TABLE inbox_messages
  ADD COLUMN IF NOT EXISTS body_full text,
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'gmail',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS priority_rank int DEFAULT 3,
  ADD COLUMN IF NOT EXISTS owner text DEFAULT 'studio',
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS risk_flags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS needs_human_review boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_context jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS gmail_message_id_header text,
  ADD COLUMN IF NOT EXISTS gmail_sent_message_id text,
  ADD COLUMN IF NOT EXISTS gmail_label_state jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS action_history jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sending_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

UPDATE inbox_messages
SET priority_rank = CASE priority
  WHEN 'urgent' THEN 1
  WHEN 'high' THEN 2
  WHEN 'normal' THEN 3
  WHEN 'low' THEN 4
  ELSE 3
END
WHERE priority_rank IS NULL OR priority_rank = 3;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inbox_messages_status_check'
  ) THEN
    ALTER TABLE inbox_messages ADD CONSTRAINT inbox_messages_status_check
      CHECK (status IN ('new', 'triaged', 'draft_ready', 'waiting_on_human', 'waiting_on_customer', 'sending', 'resolved', 'dismissed', 'sent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inbox_messages_priority_check'
  ) THEN
    ALTER TABLE inbox_messages ADD CONSTRAINT inbox_messages_priority_check
      CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_priority ON inbox_messages(priority);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_priority_rank ON inbox_messages(priority_rank);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_needs_human_review ON inbox_messages(needs_human_review);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread ON inbox_messages(gmail_thread_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_messages_gmail_sent_message_id
  ON inbox_messages(gmail_sent_message_id)
  WHERE gmail_sent_message_id IS NOT NULL AND gmail_sent_message_id <> 'sent';
