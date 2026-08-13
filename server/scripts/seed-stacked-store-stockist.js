/**
 * Seeds Stacked Store as VES's second consignment stockist and records the one
 * invoice raised against it.
 *
 * Run from server/:  node scripts/seed-stacked-store-stockist.js [--force]
 *
 * Source: ~/Documents/U____U/ves/admin/VI01SKS0126.pdf — the only record of
 * this invoice. Everything below is read off that document.
 *
 * Two fields are deliberately left null rather than guessed:
 *
 *   margin_rate  — there is no commission rate. Confirmed by Justin 13/08/26:
 *                  Stacked Store is not a margin-share arrangement the way IGC
 *                  is, so the field is genuinely empty rather than unknown.
 *
 *   the period   — VI01SKS0126 bills no period at all. Its line reads
 *                  "Consignment - Ves Products / For payment of goods", where
 *                  every IGC invoice reads "...report from IGC: Apr'26".
 *                  Inventing "Dec'25" from the 12 Jan issue date would put a
 *                  period on a re-rendered invoice that the sent one never had.
 *
 * The period stays editable in the app if it is ever pinned down.
 */

require('dotenv').config();
const supabaseDb = require('../utils/supabaseDb');

const db = supabaseDb.supabase;

const STOCKIST = {
  name: 'Stacked Store',
  invoice_code: 'SKS',
  margin_rate: null,
  gst_rate: 0.09,
  bill_to_name: 'Stacked Store Pte Ltd',
  bill_to_address_line1: '2 Alexandra Road #07-06',
  bill_to_address_line2: 'Singapore 159919',
  invoice_line_description: 'Consignment - Ves Products',
  invoice_line_detail: 'For payment of goods',
  notes: 'No commission rate — this is not a margin-share arrangement, unlike IGC. Its invoices bill no specific period.',
};

const INVOICES = [
  {
    // Outstanding, not settled — confirmed by Justin 13/08/26.
    invoice_number: 'VI01SKS0126',
    issue_date: '2026-01-12',
    status: 'sent',
    lines: [
      // No dates and no label: prints "For payment of goods" with no period,
      // matching the sent document.
      { period_from: null, period_to: null, period_label: null, gross_sgd: null, amount_sgd: 1360.8 },
    ],
  },
];

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
    const { error: deleteError } = await db.from('stockists').delete().eq('id', stockist.id);
    if (deleteError) throw deleteError;
    stockist = null;
  }

  if (!stockist) {
    const { data, error: insertError } = await db.from('stockists').insert(STOCKIST).select().single();
    if (insertError) throw insertError;
    stockist = data;
    console.log(`Created stockist ${stockist.name} (id ${stockist.id}), margin rate not recorded`);
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
      sent_at: issuedAt,
      paid_at: spec.status === 'paid' ? issuedAt : null,
      pdf_url: null,
      notes: spec.notes || null,
    }).select().single();
    if (invoiceError) throw invoiceError;

    const { error: linesError } = await db.from('stockist_invoice_lines').insert(
      spec.lines.map((line, i) => ({ invoice_id: invoice.id, ...line, sort_order: i }))
    );
    if (linesError) throw linesError;

    const total = spec.lines.reduce((sum, l) => sum + l.amount_sgd, 0);
    console.log(`  ${spec.invoice_number}  ${spec.issue_date}  ${spec.status}  total ${total.toFixed(2)}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Seed failed:', err.message || err);
  process.exit(1);
});
