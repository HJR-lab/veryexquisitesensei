/**
 * Files IGC's eight sales reports into storage and attaches each to the invoice
 * period it backs.
 *
 * Run from server/:  node scripts/attach-igc-sales-reports.js [--dry-run]
 *
 * Source: ~/Documents/U____U/ves/admin/stockists/IGC/sales-reports/ — the local
 * copies, which until 13/08/26 lived in ~/Downloads after being pulled out of
 * Apple Mail by hand. They exist nowhere else, which is most of the reason for
 * putting them somewhere durable and linked to the money they explain.
 *
 * Matched to periods by date range rather than by filename, so a renamed file
 * still lands on the right line and a file that matches nothing is reported
 * instead of being silently skipped. The fair statement is the one exception:
 * 20-23 Nov'25 is a partial month inside the same period as no other report, so
 * the range match handles it without a special case.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabaseDb = require('../utils/supabaseDb');

const db = supabaseDb.supabase;
const BUCKET = 'stockist-statements';
const SOURCE_DIR = path.join(
  process.env.HOME,
  'Documents/U____U/ves/admin/stockists/IGC/sales-reports'
);

// filename -> the period it reports on. Dates match stockist_invoice_lines.
const REPORTS = [
  { file: "VES Sales_20-23 Nov'25.xlsx", from: '2025-11-20', to: '2025-11-23' },
  { file: "VES Sales_24-30 Nov'25.xlsx", from: '2025-11-24', to: '2025-11-30' },
  { file: "VES Sales_Dec'25.xlsx", from: '2025-12-01', to: '2025-12-31' },
  { file: "VES Sales_Jan'26.xlsx", from: '2026-01-01', to: '2026-01-31' },
  { file: "VES Sales_Feb'26.xlsx", from: '2026-02-01', to: '2026-02-28' },
  { file: "VES Sales_Mar'26.xlsx", from: '2026-03-01', to: '2026-03-31' },
  { file: "VES Sales_Apr'26.xlsx", from: '2026-04-01', to: '2026-04-30' },
  { file: "VES Sales_May'26.xlsx", from: '2026-05-01', to: '2026-05-31' },
];

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const { data: stockist, error: stockistError } = await db
    .from('stockists')
    .select('id, invoice_code')
    .eq('invoice_code', 'IGC')
    .single();
  if (stockistError) throw stockistError;

  const { data: invoices, error: invoicesError } = await db
    .from('stockist_invoices')
    .select('id, invoice_number, stockist_invoice_lines(id, period_from, period_to, statement_filename)')
    .eq('stockist_id', stockist.id);
  if (invoicesError) throw invoicesError;

  const lines = [];
  for (const invoice of invoices) {
    for (const line of invoice.stockist_invoice_lines || []) {
      lines.push({ ...line, invoice_number: invoice.invoice_number });
    }
  }

  let attached = 0;
  const unmatched = [];

  for (const report of REPORTS) {
    const source = path.join(SOURCE_DIR, report.file);
    if (!fs.existsSync(source)) {
      unmatched.push(`${report.file} — file not found at ${SOURCE_DIR}`);
      continue;
    }

    const line = lines.find((l) => l.period_from === report.from && l.period_to === report.to);
    if (!line) {
      unmatched.push(`${report.file} — no invoice period covers ${report.from}..${report.to}`);
      continue;
    }
    if (line.statement_filename) {
      console.log(`  ${report.file.padEnd(30)} already attached to ${line.invoice_number} — skipped`);
      continue;
    }

    const objectPath = `IGC/${line.id}-${report.file.replace(/[^\w.'-]+/g, '_')}`;
    if (dryRun) {
      console.log(`  ${report.file.padEnd(30)} -> ${line.invoice_number} (${report.from}..${report.to})  [dry run]`);
      attached += 1;
      continue;
    }

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(objectPath, fs.readFileSync(source), { contentType: XLSX_MIME, upsert: true });
    if (uploadError) throw uploadError;

    const { error } = await db
      .from('stockist_invoice_lines')
      .update({ statement_path: objectPath, statement_filename: report.file })
      .eq('id', line.id);
    if (error) throw error;

    console.log(`  ${report.file.padEnd(30)} -> ${line.invoice_number} (${report.from}..${report.to})`);
    attached += 1;
  }

  console.log(`\n${attached} report(s) ${dryRun ? 'would be attached' : 'attached'}.`);

  // A period with no report is not an error — Jun'26 and Jul'26 have not
  // arrived yet — but a report with no period means the mapping above is wrong,
  // and that must be loud.
  if (unmatched.length > 0) {
    console.log('\nUNMATCHED:');
    for (const problem of unmatched) console.log('  ' + problem);
    process.exitCode = 1;
  }

  const bare = lines.filter((l) => !l.statement_filename && !REPORTS.some((r) => r.from === l.period_from));
  if (bare.length > 0) {
    console.log('\nPeriods still without a report:');
    for (const l of bare) console.log(`  ${l.invoice_number}  ${l.period_from}..${l.period_to}`);
  }
}

main().catch((err) => {
  console.error('Attach failed:', err.message || err);
  process.exit(1);
});
