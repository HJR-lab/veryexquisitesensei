-- Clay Club memberships: term starts on the member's FIRST STUDIO VISIT,
-- not on the purchase date. On purchase the membership is created as 'pending'
-- (reserved) with no start/end date; the studio manager activates it on the
-- member's first visit, which sets start_date = visit date and
-- end_date = start_date + N months.
--
-- This migration:
--   1. Adds purchase_date (the Shopify order date) so we can still show
--      "Purchased on ..." while the term is unstarted.
--   2. Makes start_date / end_date nullable (pending memberships have neither).

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS purchase_date DATE;

ALTER TABLE memberships ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE memberships ALTER COLUMN end_date   DROP NOT NULL;

COMMENT ON COLUMN memberships.purchase_date IS 'Shopify order date. Term does not start here — it starts on first studio visit (see status=pending -> active activation).';
