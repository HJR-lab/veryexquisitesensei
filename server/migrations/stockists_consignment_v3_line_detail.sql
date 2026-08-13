-- The small line under the bold one varies per stockist, not just per entity.
--
-- The default ("As emailed sales report from {stockist}") is right for IGC,
-- whose invoices are settled against a statement they email every month. The
-- real VI01SKS0126 to Stacked Store reads "For payment of goods" — there is no
-- emailed report behind it. Without an override, re-rendering that invoice
-- describes it as something it is not.
--
-- Mirrors invoice_line_description, which already overrides the bold line for
-- the same reason.

ALTER TABLE stockists ADD COLUMN IF NOT EXISTS invoice_line_detail TEXT;

COMMENT ON COLUMN stockists.invoice_line_detail IS
  'Overrides the smaller line beneath the description. Null = use the default, "As emailed sales report from {stockist}". {stockist} is substituted.';
