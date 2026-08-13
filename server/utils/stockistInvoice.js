/**
 * The VES consignment invoice: numbering, period labels, and markup.
 *
 * Ported from the DOE app (`src/lib/settlement-invoice.ts`, `issuing-entity.ts`,
 * `invoice-data.ts`, `invoice-html.ts`, commits cf5b505 + 72afdf5), trimmed to
 * VES only. DOE's app carries both brands because it was the only deployment
 * that existed; this one is VES's, so the DOE branch is dropped rather than
 * carried as dead config.
 *
 * Server-side PDF rendering is deliberately absent. DOE removed it after
 * Chromium never resolved on Railway; the invoice is HTML the viewer prints,
 * which is also what produced the PDFs already sent.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// The issuing entity: VES, as its invoices have always been formatted.
// ---------------------------------------------------------------------------

const VES = {
  invoice_prefix: 'VI',

  legal_name: 'Ves.Studio LLP',
  uen: 'T17LL2238C',
  bank_name: 'UOB Bank',
  bank_account: '3413098384',

  logo_width_px: 66,
  logo_alt: 'ves',

  // VES invoices read a bare "1144.50" — two decimals, no currency symbol, no
  // thousands separator. DOE's read "$1,144.500". Matching the sent invoices
  // matters: a figure formatted differently from the last one invites a query.
  amount_decimals: 2,
  currency_prefix: '',
  thousands_separator: false,

  footer_address: '75 Jalan Kelabu Asap, S278268',
  footer_email: 'info@ves.sg',

  line_description: 'Consignment - {stockist}',
  line_detail: 'As emailed sales report from {stockist}',
};

/** Format money the way VES invoices have always shown it. */
function formatAmount(amount) {
  const figure = Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: VES.amount_decimals,
    maximumFractionDigits: VES.amount_decimals,
    useGrouping: VES.thousands_separator,
  });
  return `${VES.currency_prefix}${figure}`;
}

// ---------------------------------------------------------------------------
// Invoice numbering
// ---------------------------------------------------------------------------

/**
 * Token for a stockist. Falls back to a slug of the name so a stockist saved
 * without an explicit code still gets its own number rather than IGC's.
 */
function stockistInvoiceToken(invoiceCode, name) {
  const explicit = (invoiceCode ?? '').trim();
  if (explicit) return explicit.toUpperCase();
  const fromName = (name ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return fromName || 'UNK';
}

function invoicePattern(token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${VES.invoice_prefix}(\\d+)${escaped}(\\d{2})(\\d{2})$`);
}

/**
 * Next sequence for this stockist: one past the highest already issued in the
 * same calendar year.
 *
 * VES's sequence restarts each January (DOE's runs unbroken forever). That is
 * why VI01IGC1125 and VI01IGC0126 both exist and neither is a mistake — the
 * first IGC invoice of 2025 and the first of 2026.
 *
 * Continuing from the maximum rather than counting rows matters because the
 * back-history was issued by hand: gaps and repeats exist, and counting would
 * mint a number IGC has already been sent.
 */
function nextInvoiceSequence(existingNumbers, token, yy) {
  const pattern = invoicePattern(token);
  let highest = 0;

  for (const raw of existingNumbers) {
    const match = (raw ?? '').trim().toUpperCase().match(pattern);
    if (!match) continue;
    if (match[3] !== yy) continue; // different calendar year — its own sequence
    highest = Math.max(highest, parseInt(match[1], 10));
  }

  return highest + 1;
}

/**
 * Build the number for a new invoice. `mm`/`yy` are the month the invoice is
 * RAISED in, not the month it bills for — VI02IGC0226 covers Jan'26 and was
 * issued in February.
 */
function buildInvoiceNumber({ existingNumbers, token, mm, yy }) {
  const seq = nextInvoiceSequence(existingNumbers, token, yy);
  return `${VES.invoice_prefix}${String(seq).padStart(2, '0')}${token}${mm}${yy}`;
}

/** The MM/YY an invoice issued on `issueDate` (a YYYY-MM-DD string) carries. */
function issueMonthParts(issueDate) {
  const [year, month] = issueDate.split('-');
  return { mm: month, yy: year.slice(-2) };
}

// ---------------------------------------------------------------------------
// Period labels
// ---------------------------------------------------------------------------

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Typographic characters as literal text, not HTML entities.
//
// These used to be emitted as &rsquo; / &ndash;, which meant labels could only
// be interpolated into the invoice unescaped — and `period_label` is free text
// an admin types, so that was a stored-XSS sink. It also leaked markup into a
// plain-data field: the admin UI had to decode the entities back out to display
// a period. Real characters are escapable and need no decoding; the document
// declares UTF-8 and Express serves it as such.
const RSQUO = '’'; // ’
const NDASH = '–'; // –

/**
 * How a billed period is printed. A whole calendar month reads "Apr’26", which
 * is how every invoice sent so far is worded. A partial range spells out the
 * days — "24 – 30 Nov ’25" — because IGC sometimes split a month and the
 * invoice has to say which part it covers.
 */
function formatPeriodLabel(dateFrom, dateTo) {
  const from = new Date(dateFrom + 'T00:00:00');
  const to = new Date(dateTo + 'T00:00:00');
  const yy = String(to.getFullYear()).slice(-2);

  const sameMonth = from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
  const lastDayOfMonth = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
  const isWholeMonth = sameMonth && from.getDate() === 1 && to.getDate() === lastDayOfMonth;

  if (isWholeMonth) {
    return `${MONTHS_SHORT[to.getMonth()]}${RSQUO}${yy}`;
  }
  if (sameMonth) {
    return `${from.getDate()} ${NDASH} ${to.getDate()} ${MONTHS_SHORT[to.getMonth()]} ${RSQUO}${yy}`;
  }
  const fromYY = String(from.getFullYear()).slice(-2);
  return `${from.getDate()} ${MONTHS_SHORT[from.getMonth()]} ${RSQUO}${fromYY} ${NDASH} ${to.getDate()} ${MONTHS_SHORT[to.getMonth()]} ${RSQUO}${yy}`;
}

/** "8 January 2026" — the long form the sent invoices use. */
function formatIssueDate(issueDate) {
  return new Date(issueDate + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Singapore',
  });
}

/**
 * The two lines of the invoice's line item. A stockist may override either.
 *
 * VES bills IGC as "Consignment - IGC x Ves Charms" but Stacked Store as
 * "Consignment - Ves Products"; and IGC's detail points at the statement they
 * email each month ("As emailed sales report from IGC") where Stacked Store's
 * reads simply "For payment of goods", there being no such report.
 */
function resolveInvoiceLine({ stockistName, descriptionOverride, detailOverride }) {
  const fill = (template) =>
    template.replace(/\{stockist\}/g, stockistName).replace(/\s{2,}/g, ' ').trim();

  return {
    description: (descriptionOverride ?? '').trim() || fill(VES.line_description),
    detail: fill(((detailOverride ?? '').trim() || VES.line_detail)),
  };
}

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The logo is inlined as a data URI rather than linked. The invoice HTML is
// served by the API, which hosts no static assets, and a printed invoice with
// a broken image is worse than one with none. Read once, not per request.
let logoDataUri = null;
function vesLogoDataUri() {
  if (logoDataUri !== null) return logoDataUri;
  try {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ves-logo.png'));
    logoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
  } catch (err) {
    console.error('[stockistInvoice] ves-logo.png missing, rendering without it:', err.message);
    logoDataUri = '';
  }
  return logoDataUri;
}

/**
 * Render the invoice.
 *
 * `periods` is `[{ label, amount }]`. Labels are plain text — either from
 * formatPeriodLabel or typed by an admin — and are escaped here like every
 * other value on the invoice.
 *
 * A label may be empty, meaning the invoice bills no particular period. The
 * real VI01SKS0126 reads "For payment of goods" full stop, where every IGC
 * invoice reads "...report from IGC: Apr&rsquo;26" — so an empty label drops
 * the trailing ": period" rather than printing a dangling colon.
 */
function renderInvoiceHtml({
  invoiceNumber,
  invoiceDate,
  billToName,
  billToLines,
  lineDescription,
  lineDetail,
  periods,
  includePrintButton = true,
}) {
  const total = periods.reduce((sum, p) => sum + Number(p.amount), 0);
  const detail = escapeHtml(lineDetail);
  const logo = vesLogoDataUri();

  const priceCells = (amount) =>
    `<div style="flex: 0.7; text-align: center;">1</div>
    <div style="flex: 1; text-align: right;">${formatAmount(amount)}</div>
    <div style="flex: 1; text-align: right;">${formatAmount(amount)}</div>`;

  // A single period reads inline ("...report from IGC: Apr&rsquo;26"), which is
  // how every invoice sent so far is worded, with its amount on the same row.
  //
  // Several periods each get their own row, label alongside its own amount. The
  // sent invoices stacked labels under the description while the amounts began
  // higher up, so the columns did not line up; survivable across two rows, but
  // a four-row invoice has to say unambiguously which figure is which month.
  const lineItem =
    periods.length === 1
      ? `<div style="display: flex; padding-bottom: 60px;">
    <div style="flex: 3;">
      <div style="font-weight: 600; margin-bottom: 2px;">${escapeHtml(lineDescription)}</div>
      <div style="font-size: 12px;">${detail}${periods[0].label ? `: ${escapeHtml(periods[0].label)}` : ''}</div>
    </div>
    ${priceCells(periods[0].amount)}
  </div>`
      : `<div style="padding-bottom: 60px;">
    <div style="margin-bottom: 6px;">
      <div style="font-weight: 600; margin-bottom: 2px;">${escapeHtml(lineDescription)}</div>
      <div style="font-size: 12px;">${detail}</div>
    </div>
    ${periods
      .map(
        (p) => `<div style="display: flex; padding: 1px 0;">
      <div style="flex: 3; font-size: 12px;">${escapeHtml(p.label)}</div>
      ${priceCells(p.amount)}
    </div>`
      )
      .join('\n    ')}
  </div>`;

  const printButton = includePrintButton
    ? `
  <div class="no-print" style="margin-top: 40px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 28px; background: #1a1a1a; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Print / Save as PDF</button>
  </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${escapeHtml(invoiceNumber)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    /* Arial matches the Slides-produced invoices already sent. */
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 60px 60px 40px; max-width: 800px; margin: 0 auto; font-size: 13px; background: white; line-height: 1.5; }
    @media print {
      body { padding: 40px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div style="text-align: center; margin-bottom: 8px;">
    ${logo ? `<img src="${logo}" alt="${escapeHtml(VES.logo_alt)}" style="width: ${VES.logo_width_px}px;" />` : ''}
  </div>

  <div style="margin-bottom: 4px;">
    <div style="font-size: 16px; font-weight: 700; letter-spacing: 0.5px;">INVOICE</div>
  </div>
  <div style="margin-bottom: 4px;">${escapeHtml(invoiceNumber)}</div>
  <div style="margin-bottom: 32px;">${escapeHtml(invoiceDate)}</div>

  <div style="margin-bottom: 80px;">
    <div style="font-weight: 700; margin-bottom: 4px;">${escapeHtml(billToName)}</div>
    ${billToLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('\n    ')}
  </div>

  <div style="display: flex; padding-bottom: 12px; font-size: 12px; letter-spacing: 0.04em;">
    <div style="flex: 3;">DESCRIPTION</div>
    <div style="flex: 0.7; text-align: center;">QTY</div>
    <div style="flex: 1; text-align: right;">RATE</div>
    <div style="flex: 1; text-align: right;">AMOUNT</div>
  </div>

  <hr style="border: none; border-top: 1.5px solid #1a1a1a; margin-bottom: 16px;" />

  ${lineItem}

  <hr style="border: none; border-top: 1.5px solid #1a1a1a; margin-bottom: 12px;" />

  <div style="display: flex; justify-content: space-between; margin-bottom: 100px;">
    <div style="font-size: 13px;">TOTAL</div>
    <div style="font-weight: 700; font-size: 14px;">${formatAmount(total)}</div>
  </div>

  <div style="margin-bottom: 32px;">
    <div style="font-weight: 700; margin-bottom: 8px;">PAYMENT</div>
    <div>Company Name: ${escapeHtml(VES.legal_name)}</div>
    <div>UEN: ${escapeHtml(VES.uen)}</div>
    <div>Bank Name: ${escapeHtml(VES.bank_name)}</div>
    <div>Bank Account: ${escapeHtml(VES.bank_account)}</div>
  </div>

  <div>
    <div>${escapeHtml(VES.footer_address)}</div>
    <div>${escapeHtml(VES.footer_email)}</div>
  </div>
${printButton}
</body>
</html>`;
}

module.exports = {
  VES,
  formatAmount,
  stockistInvoiceToken,
  nextInvoiceSequence,
  buildInvoiceNumber,
  issueMonthParts,
  formatPeriodLabel,
  formatIssueDate,
  resolveInvoiceLine,
  escapeHtml,
  renderInvoiceHtml,
};
