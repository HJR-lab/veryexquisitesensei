-- The sales report behind each billed period.
--
-- Every amount on a consignment invoice comes from a spreadsheet the stockist
-- emails ("VES Sales_Apr'26.xlsx"). Those files existed in exactly one place —
-- an Apple Mail mailbox — and were pulled out by hand. Nothing linked a figure
-- on an invoice to the document it came from, so checking "where did 424.31
-- come from" meant going back to the mailbox.
--
-- Stored per LINE, not per invoice, because the relationship is per period: one
-- statement per month billed. VI01IGC0126 bills two periods and has two
-- statements behind it; the Feb-May'26 catch-up has four.
--
-- The file lives in the private `stockist-statements` bucket and the path, not
-- a URL, is stored — the app mints a short-lived signed URL on demand. A stored
-- URL would either expire in the database or, if the bucket were public, hand
-- out permanent unauthenticated access to commercial documents.

ALTER TABLE stockist_invoice_lines ADD COLUMN IF NOT EXISTS statement_path TEXT;
ALTER TABLE stockist_invoice_lines ADD COLUMN IF NOT EXISTS statement_filename TEXT;

COMMENT ON COLUMN stockist_invoice_lines.statement_path IS
  'Object path in the private stockist-statements bucket. Signed on demand; never stored as a URL.';

COMMENT ON COLUMN stockist_invoice_lines.statement_filename IS
  'Original filename as the stockist sent it, e.g. "VES Sales_Apr''26.xlsx". Shown in the UI and used for download.';
