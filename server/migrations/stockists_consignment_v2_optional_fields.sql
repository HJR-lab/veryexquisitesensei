-- Three fields turned out to be genuinely unknown for real invoices, and a
-- NOT NULL forces a guess to be recorded as if it were a fact.
--
-- VI01SKS0126 (Stacked Store, 12 Jan 2026, 1360.80) carries no period at all —
-- its line reads "Consignment - Ves Products / For payment of goods" with no
-- month, unlike every IGC invoice. Inventing "Dec'25" to satisfy the schema
-- would put a period on a re-rendered invoice that the sent one never had.
--
-- Stacked Store's margin rate is likewise not on the invoice and not recorded
-- anywhere; defaulting it to IGC's 50% would display a rate nobody confirmed.

ALTER TABLE stockists ALTER COLUMN margin_rate DROP NOT NULL;
ALTER TABLE stockists ALTER COLUMN margin_rate DROP DEFAULT;

ALTER TABLE stockist_invoice_lines ALTER COLUMN period_from DROP NOT NULL;
ALTER TABLE stockist_invoice_lines ALTER COLUMN period_to DROP NOT NULL;

COMMENT ON COLUMN stockists.margin_rate IS
  'VES share of the GST-exclusive amount (IGC = 0.5000). Null means not confirmed — display it as unknown rather than assuming a default.';

COMMENT ON COLUMN stockist_invoice_lines.period_from IS
  'Null when the invoice bills no specific period, as VI01SKS0126 does. Null dates with a null label print no period at all.';
