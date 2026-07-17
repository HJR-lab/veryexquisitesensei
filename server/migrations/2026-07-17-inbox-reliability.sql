-- Inbox reliability fixes (code review 2026-07-17). Safe to run repeatedly.
--
-- WR-01: durable idempotent reply-send.
--   - sending_started_at    : set when a request claims the message for sending.
--   - gmail_sent_message_id  : the Gmail message id of the sent reply. Its presence
--                              is the durable "already sent" record — a retry after a
--                              partial failure reconciles instead of resending.
--   - status 'sending'       : the in-progress claim state, added to the CHECK.
--
-- WR-05: urgency-correct ordering before the 100-row limit.
--   - priority_rank : numeric rank derived from priority (urgent=0 .. low=3) so the
--                     DB can ORDER BY it and the limit keeps the most urgent rows.

ALTER TABLE inbox_messages
  ADD COLUMN IF NOT EXISTS sending_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_sent_message_id text;

-- Numeric priority rank (STORED generated column backfills existing rows automatically).
ALTER TABLE inbox_messages
  ADD COLUMN IF NOT EXISTS priority_rank smallint
  GENERATED ALWAYS AS (
    CASE priority
      WHEN 'urgent' THEN 0
      WHEN 'high'   THEN 1
      WHEN 'normal' THEN 2
      WHEN 'low'    THEN 3
      ELSE 2
    END
  ) STORED;

-- Add 'sending' to the status CHECK constraint (drop-then-add is safe to re-run).
ALTER TABLE inbox_messages DROP CONSTRAINT IF EXISTS inbox_messages_status_check;
ALTER TABLE inbox_messages ADD CONSTRAINT inbox_messages_status_check
  CHECK (status IN ('new', 'triaged', 'draft_ready', 'waiting_on_human', 'waiting_on_customer', 'sending', 'resolved', 'dismissed', 'sent'));

-- Ordering index: urgent-first, then newest within a priority.
CREATE INDEX IF NOT EXISTS idx_inbox_messages_priority_rank ON inbox_messages(priority_rank, received_at DESC);

-- Reconciliation lookups by the durable sent-message id.
CREATE INDEX IF NOT EXISTS idx_inbox_messages_gmail_sent ON inbox_messages(gmail_sent_message_id);
