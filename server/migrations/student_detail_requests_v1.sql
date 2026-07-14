-- Student detail requests: when a multi-pax order creates a "+dup" placeholder
-- customer (second spot on one order), we email the purchaser a tokenized form
-- link so they can enter the second student's real details themselves.
CREATE TABLE IF NOT EXISTS student_detail_requests (
  id BIGSERIAL PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  placeholder_customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  purchaser_email TEXT NOT NULL,
  course_title TEXT,
  shopify_order_id TEXT, -- groups multi-spot orders: one email/form covers all spots

  status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | needs_admin
  submitted_first_name TEXT,
  submitted_last_name TEXT,
  submitted_email TEXT,
  submitted_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sdr_placeholder ON student_detail_requests(placeholder_customer_id);
CREATE INDEX IF NOT EXISTS idx_sdr_status ON student_detail_requests(status);
CREATE INDEX IF NOT EXISTS idx_sdr_order ON student_detail_requests(shopify_order_id);

-- Service-role only; the public form goes through the Express API, never PostgREST.
ALTER TABLE student_detail_requests ENABLE ROW LEVEL SECURITY;
