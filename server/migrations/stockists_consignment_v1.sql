-- Consignment stockists and the invoices VES raises against them.
--
-- VES sells through retail stockists (IGC today) on consignment: the stockist
-- sells the stock, emails a monthly sales statement, and VES invoices them for
-- its share. Until now those invoices were built by hand in Slides and lived
-- only as PDFs in Drive, so nothing in any system knew what had been billed.
--
-- Deliberately NOT modelled here: stock on hand at the stockist, per-SKU sales
-- lines, and reconciliation against VES's own records. VES has no product or
-- inventory tables, so there is nothing to reconcile against — this is an
-- invoice ledger, not a consignment inventory system.

-- =============================================
-- stockists
-- =============================================
CREATE TABLE IF NOT EXISTS stockists (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,

  -- Short uppercase token embedded in invoice numbers: VI02<invoice_code>0226.
  -- Unique so two stockists can never mint each other's numbers.
  invoice_code TEXT NOT NULL UNIQUE,

  -- VES's cut of the GST-exclusive amount. IGC's statements read
  -- "50% Margin to VES", so 0.5000 — NOT the 0.70 DOE takes from the same
  -- stockist. A wrong rate here overbills by 40%, invisibly: 3605 gross at
  -- 70% and 3605/1.09 at 50% both land near the real 1653.67.
  margin_rate NUMERIC(5,4) NOT NULL DEFAULT 0.5000,

  -- GST stripped from gross before the margin applies. Singapore is 9%.
  gst_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0900,

  -- Who the invoice is addressed to. Falls back to name when null.
  bill_to_name TEXT,
  bill_to_address_line1 TEXT,
  bill_to_address_line2 TEXT,

  -- Overrides the default bold line on the invoice ("Consignment - {stockist}").
  -- VES bills IGC as "Consignment - IGC x Ves Charms".
  invoice_line_description TEXT,

  contact_email TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- stockist_invoices — one row per invoice actually raised
-- =============================================
CREATE TABLE IF NOT EXISTS stockist_invoices (
  id BIGSERIAL PRIMARY KEY,
  stockist_id BIGINT NOT NULL REFERENCES stockists(id) ON DELETE CASCADE,

  -- VI<seq><code><MM><YY>, e.g. VI02IGC0226. The sequence RESTARTS each
  -- calendar year, which is why VI01IGC1125 and VI01IGC0126 are both real and
  -- not a duplicate: the first IGC invoice of 2025 and of 2026.
  invoice_number TEXT NOT NULL,

  -- The date printed on the invoice. A real column rather than a created_at
  -- proxy, because the three historical invoices were issued long before this
  -- table existed and must keep the dates IGC already has on file.
  issue_date DATE NOT NULL,

  status TEXT NOT NULL DEFAULT 'draft', -- draft | sent | paid | void
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Link to the filed PDF (Drive) for invoices raised before this ledger, and
  -- for anything filed manually afterwards. The app renders its own HTML
  -- invoice, so this is a reference, not the source of the document.
  pdf_url TEXT,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT stockist_invoices_number_unique UNIQUE (stockist_id, invoice_number),
  CONSTRAINT stockist_invoices_status_check CHECK (status IN ('draft', 'sent', 'paid', 'void'))
);

CREATE INDEX IF NOT EXISTS idx_stockist_invoices_stockist ON stockist_invoices(stockist_id);
CREATE INDEX IF NOT EXISTS idx_stockist_invoices_status ON stockist_invoices(status);

-- =============================================
-- stockist_invoice_lines — one row per billed period
-- =============================================
--
-- An invoice covers one or more periods, and the multi-period case is not an
-- edge case: VI01IGC0126 billed "24 - 30 Nov'25" and "Dec'25" as two priced
-- rows because IGC split November's statement, and the Feb-May'26 catch-up is
-- four rows on one invoice. A one-period-per-invoice model cannot express
-- either, which is why this is a separate table rather than columns above.
CREATE TABLE IF NOT EXISTS stockist_invoice_lines (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES stockist_invoices(id) ON DELETE CASCADE,

  period_from DATE NOT NULL,
  period_to DATE NOT NULL,

  -- Overrides the label derived from the dates. The November fair was billed as
  -- "Boutique's Fair 20-23 Nov'25", which no date formatter would produce.
  period_label TEXT,

  -- Gross sales for the period, inclusive of GST, as the statement reports it.
  gross_sgd NUMERIC(12,4),

  -- What VES bills for this period. Taken from the statement's own
  -- "Total Amount to invoice" figure rather than recomputed: IGC's remittances
  -- have matched that figure to the cent on every invoice settled so far, so
  -- the statement is the source of truth for the money. Full precision is kept
  -- (247.7064, not 247.71) and rounded once at the total, which is how the
  -- already-sent invoices were produced.
  amount_sgd NUMERIC(12,4) NOT NULL,

  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT stockist_invoice_lines_period_check CHECK (period_to >= period_from)
);

CREATE INDEX IF NOT EXISTS idx_stockist_invoice_lines_invoice ON stockist_invoice_lines(invoice_id);

-- Service-role only; every read and write goes through the Express admin API,
-- never PostgREST. Matches student_detail_requests and the other admin tables.
ALTER TABLE stockists ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockist_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockist_invoice_lines ENABLE ROW LEVEL SECURITY;
