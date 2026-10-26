-- Paid continuation offers: a current single-course WT student is offered the
-- next course in their slot as soon as it is listed on Shopify, with a
-- checkout link and their seat held while they decide.
--
-- Reuses continuation_offers (same token page, deadline, extension and sweep).
-- Existing rows are package offers, so kind defaults to 'package'.
BEGIN;

ALTER TABLE public.continuation_offers
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'package',
  ADD COLUMN IF NOT EXISTS shopify_variant_id text,
  ADD COLUMN IF NOT EXISTS shopify_draft_order_id text,
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS price numeric(10,2),
  ADD COLUMN IF NOT EXISTS course_title text;

ALTER TABLE public.continuation_offers
  DROP CONSTRAINT IF EXISTS continuation_offers_kind_check;
ALTER TABLE public.continuation_offers
  ADD CONSTRAINT continuation_offers_kind_check CHECK (kind IN ('package', 'paid'));

COMMIT;
