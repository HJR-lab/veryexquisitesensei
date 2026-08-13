/**
 * Seeds IGC as a consignment stockist and backfills every VES x IGC invoice.
 *
 * Run from server/:  node scripts/seed-igc-stockist.js [--force]
 *
 * Idempotent: re-running skips anything already present. --force deletes the
 * IGC stockist and its invoices first, so the seed can be re-applied cleanly
 * during development.
 *
 * Every amount below is IGC's own "Total Amount to invoice" figure, read out of
 * the statement spreadsheets in ~/Downloads/ves-statements/ (the only copies
 * that exist — they were extracted from Apple Mail). They are NOT recomputed
 * here: IGC's remittances have matched their own figure on every invoice
 * settled so far, so the statement is the source of truth for the money.
 *
 * The arithmetic still reconciles, which is how the 50% rate was confirmed:
 * 3605 gross / 1.09 * 0.50 = 1653.67, the exact total on the sent invoice.
 * Billing at DOE's 70% would have produced 2315.06 and overbilled by 40%.
 */

require('dotenv').config();
const supabaseDb = require('../utils/supabaseDb');

const db = supabaseDb.supabase;

const STOCKIST = {
  name: 'IGC',
  invoice_code: 'IGC',
  margin_rate: 0.5,
  gst_rate: 0.09,
  bill_to_name: "IGC'X Pte Ltd",
  bill_to_address_line1: '38, Jalan Pemimpin, #05-01/02, M38',
  bill_to_address_line2: 'Singapore 577178',
  invoice_line_description: 'Consignment - IGC x Ves Charms',
  notes: 'In Good Company. Monthly consignment sales statement by email from ingoodcompany.asia; VES takes 50% of the GST-exclusive amount.',
};

// The three already sent to IGC, plus the Feb-May'26 catch-up as a draft.
//
// The draft carries no number of its own worth trusting: the route re-mints it
// on the draft -> sent transition, because it has been waiting on the missing
// Jun/Jul statements since June and the number must match the month it finally
// goes out in.
const INVOICES = [
  {
    invoice_number: 'VI01IGC1125',
    issue_date: '2025-11-25',
    status: 'paid',
    lines: [
      // The fair was billed under its own name, which no date formatter would
      // produce from 20-23 Nov — hence the explicit label.
      { period_from: '2025-11-20', period_to: '2025-11-23', period_label: "Boutique's Fair 20-23 Nov'25", gross_sgd: 3605, amount_sgd: 1653.6697 },
    ],
  },
  {
    invoice_number: 'VI01IGC0126',
    issue_date: '2026-01-08',
    status: 'paid',
    // Two periods on one invoice: IGC split November's statement, so the 24-30
    // remainder was settled together with December.
    lines: [
      { period_from: '2025-11-24', period_to: '2025-11-30', gross_sgd: 400, amount_sgd: 183.4862 },
      { period_from: '2025-12-01', period_to: '2025-12-31', gross_sgd: 2095, amount_sgd: 961.0092 },
    ],
  },
  {
    invoice_number: 'VI02IGC0226',
    issue_date: '2026-02-05',
    status: 'paid',
    lines: [
      { period_from: '2026-01-01', period_to: '2026-01-31', gross_sgd: 960, amount_sgd: 440.367 },
    ],
  },
  {
    invoice_number: 'VI03IGC0826',
    issue_date: '2026-08-13',
    status: 'draft',
    notes: "Feb-May'26 catch-up. Jun'26 and Jul'26 statements have not arrived — confirm with IGC that none are coming (or chase them) before sending. The number and date are rebuilt when this is marked sent.",
    lines: [
      { period_from: '2026-02-01', period_to: '2026-02-28', gross_sgd: 540, amount_sgd: 247.7064 },
      { period_from: '2026-03-01', period_to: '2026-03-31', gross_sgd: 1325, amount_sgd: 607.7982 },
      { period_from: '2026-04-01', period_to: '2026-04-30', gross_sgd: 925, amount_sgd: 424.3119 },
      { period_from: '2026-05-01', period_to: '2026-05-31', gross_sgd: 715, amount_sgd: 327.9817 },
    ],
  },
];

const round2 = (n) => Math.round(n * 100) / 100;

async function main() {
  const force = process.argv.includes('--force');

  let { data: stockist, error } = await db
    .from('stockists')
    .select('*')
    .eq('invoice_code', STOCKIST.invoice_code)
    .maybeSingle();
  if (error) throw error;

  if (stockist && force) {
    console.log(`--force: removing stockist ${stockist.id} and its invoices`);
    // Invoices and their lines cascade from the stockist.
    const { error: deleteError } = await db.from('stockists').delete().eq('id', stockist.id);
    if (deleteError) throw deleteError;
    stockist = null;
  }

  if (!stockist) {
    const { data, error: insertError } = await db.from('stockists').insert(STOCKIST).select().single();
    if (insertError) throw insertError;
    stockist = data;
    console.log(`Created stockist ${stockist.name} (id ${stockist.id}) at ${Number(stockist.margin_rate) * 100}% margin`);
  } else {
    console.log(`Stockist ${stockist.name} (id ${stockist.id}) already exists — leaving it alone`);
  }

  for (const spec of INVOICES) {
    const { data: existing, error: existingError } = await db
      .from('stockist_invoices')
      .select('id')
      .eq('stockist_id', stockist.id)
      .eq('invoice_number', spec.invoice_number)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      console.log(`  ${spec.invoice_number} already present — skipped`);
      continue;
    }

    const issuedAt = new Date(spec.issue_date + 'T00:00:00+08:00').toISOString();
    const { data: invoice, error: invoiceError } = await db.from('stockist_invoices').insert({
      stockist_id: stockist.id,
      invoice_number: spec.invoice_number,
      issue_date: spec.issue_date,
      status: spec.status,
      sent_at: spec.status === 'draft' ? null : issuedAt,
      paid_at: spec.status === 'paid' ? issuedAt : null,
      notes: spec.notes || null,
    }).select().single();
    if (invoiceError) throw invoiceError;

    const { error: linesError } = await db.from('stockist_invoice_lines').insert(
      spec.lines.map((line, i) => ({
        invoice_id: invoice.id,
        period_from: line.period_from,
        period_to: line.period_to,
        period_label: line.period_label || null,
        gross_sgd: line.gross_sgd,
        amount_sgd: line.amount_sgd,
        sort_order: i,
      }))
    );
    if (linesError) throw linesError;

    const total = round2(spec.lines.reduce((sum, l) => sum + l.amount_sgd, 0));
    console.log(`  ${spec.invoice_number}  ${spec.issue_date}  ${spec.status.padEnd(5)}  ${spec.lines.length} period(s)  total ${total.toFixed(2)}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Seed failed:', err.message || err);
  process.exit(1);
});
