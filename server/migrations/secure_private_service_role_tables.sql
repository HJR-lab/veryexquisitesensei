-- These audit/offer tables are private implementation details. Every application
-- read and write goes through the VES Express server's service-role Supabase
-- client; browser clients must not access them through PostgREST.

BEGIN;

ALTER TABLE public.booking_credit_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.continuation_offers ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies are intentional. Revoke the underlying grants as
-- defense in depth so a future permissive policy cannot expose these tables alone.
REVOKE ALL PRIVILEGES ON TABLE public.booking_credit_adjustments FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.capacity_overrides FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.continuation_offers FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON SEQUENCE public.booking_credit_adjustments_id_seq FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.capacity_overrides_id_seq FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.continuation_offers_id_seq FROM anon, authenticated;

COMMIT;
