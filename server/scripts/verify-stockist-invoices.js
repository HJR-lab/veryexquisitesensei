/* End-to-end test of the stockist invoice ledger against the running local API. */
require('dotenv').config({ path: '/Users/justinlong/Documents/U____U/ves/code/pottery-gallery-app/server/.env' });
const { createClient } = require('@supabase/supabase-js');

// Defaults to the local server. Point it at the deployed API to prove the code
// actually running in production carries a fix, not just the working copy:
//   STOCKIST_API=https://ves-pottery-api-production.up.railway.app node scripts/verify-stockist-invoices.js
// Both targets share one Supabase project, so this writes to the real ledger
// either way — the suite creates throwaway invoices and deletes them again.
const BASE = process.env.STOCKIST_API || 'http://localhost:3001';
const ADMIN_EMAIL = 'info@ves.sg';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '\n          ' + detail : ''}`); }
};

async function adminToken() {
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: ADMIN_EMAIL });
  if (error) throw new Error('generateLink: ' + error.message);

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: session, error: verifyError } = await anon.auth.verifyOtp({
    type: 'magiclink',
    token_hash: data.properties.hashed_token,
  });
  if (verifyError) throw new Error('verifyOtp: ' + verifyError.message);
  return session.session.access_token;
}

async function main() {
  const token = await adminToken();
  const call = async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html or plain text */ }
    return { status: res.status, json, text };
  };

  console.log('\n== list ==');
  const list = await call('GET', '/api/admin/stockists');
  check('200', list.status === 200, `got ${list.status}`);
  const igc = (list.json?.stockists || []).find(s => s.invoice_code === 'IGC');
  check('IGC present', !!igc);
  check('50% margin', igc && Number(igc.margin_rate) === 0.5, igc && `margin_rate=${igc.margin_rate}`);
  check('4 invoices', igc?.invoice_count === 4, `invoice_count=${igc?.invoice_count}`);
  check('billed 4846.34', igc && Number(igc.billed_total) === 4846.34, `billed=${igc?.billed_total}`);
  check('outstanding 1607.80', igc && Number(igc.outstanding_total) === 1607.8, `outstanding=${igc?.outstanding_total}`);

  console.log('\n== detail ==');
  const detail = await call('GET', `/api/admin/stockists/${igc.id}`);
  check('200', detail.status === 200, `got ${detail.status}`);
  const byNumber = Object.fromEntries((detail.json.invoices || []).map(i => [i.invoice_number, i]));

  const expected = {
    VI01IGC1125: { total: 1653.67, lines: 1, status: 'paid' },
    VI01IGC0126: { total: 1144.5, lines: 2, status: 'paid' },
    VI02IGC0226: { total: 440.37, lines: 1, status: 'paid' },
    VI03IGC0826: { total: 1607.8, lines: 4, status: 'draft' },
  };
  for (const [number, want] of Object.entries(expected)) {
    const got = byNumber[number];
    check(`${number} total ${want.total}`, got && Number(got.total_sgd) === want.total, got && `got ${got.total_sgd}`);
    check(`${number} ${want.lines} period(s)`, got && got.lines.length === want.lines, got && `got ${got.lines.length}`);
    check(`${number} ${want.status}`, got && got.status === want.status, got && `got ${got.status}`);
  }
  check('fair label preserved',
    byNumber.VI01IGC1125?.lines[0].label === "Boutique's Fair 20-23 Nov'25",
    byNumber.VI01IGC1125?.lines[0].label);
  check('Nov split labelled by days',
    byNumber.VI01IGC0126?.lines[0].label === '24 – 30 Nov ’25',
    byNumber.VI01IGC0126?.lines[0].label);
  check('whole month labelled by month',
    byNumber.VI03IGC0826?.lines[0].label === 'Feb’26',
    byNumber.VI03IGC0826?.lines[0].label);

  console.log('\n== invoice document ==');
  const html = await call('GET', `/api/admin/stockists/invoices/${byNumber.VI03IGC0826.id}/html`);
  check('200', html.status === 200, `got ${html.status}`);
  check('total 1607.80 printed', html.text.includes('>1607.80<'));
  check('all four periods listed',
    ['Feb’26', 'Mar’26', 'Apr’26', 'May’26'].every(l => html.text.includes(l)));
  check('billed to IGC\'X', html.text.includes("IGC&#039;X Pte Ltd") || html.text.includes("IGC'X Pte Ltd"));
  check('VES bank details', html.text.includes('3413098384') && html.text.includes('T17LL2238C'));
  check('VES legal name', html.text.includes('Ves.Studio LLP'));
  check('no DOE bank details', !html.text.includes('0721340194'));
  check('no dollar sign on figures', !html.text.includes('$1607'));
  check('logo embedded', html.text.includes('data:image/png;base64,'));
  check('line description override', html.text.includes('Consignment - IGC x Ves Charms'));

  const single = await call('GET', `/api/admin/stockists/invoices/${byNumber.VI02IGC0226.id}/html`);
  check('single period reads inline', single.text.includes('As emailed sales report from IGC: Jan’26'));

  console.log('\n== stacked store: periodless invoice, unknown margin ==');
  const sks = (list.json?.stockists || []).find(s => s.invoice_code === 'SKS');
  check('present', !!sks);
  check('margin rate null, not assumed 50%', sks && sks.margin_rate === null, `got ${sks?.margin_rate}`);
  check('billed 1360.80', sks && Number(sks.billed_total) === 1360.8, `got ${sks?.billed_total}`);
  // VI01SKS0126 is sent but unpaid, so Stacked Store's whole ledger is outstanding.
  check('all 1360.80 outstanding', sks && Number(sks.outstanding_total) === 1360.8, `got ${sks?.outstanding_total}`);

  const sksDetail = await call('GET', `/api/admin/stockists/${sks.id}`);
  const sksInvoice = sksDetail.json.invoices[0];
  check('VI01SKS0126', sksInvoice?.invoice_number === 'VI01SKS0126', sksInvoice?.invoice_number);
  check('outstanding, not paid', sksInvoice?.status === 'sent', sksInvoice?.status);
  check('no payment date', !sksInvoice?.paid_at, sksInvoice?.paid_at);
  check('line carries no period', sksInvoice?.lines[0].label === '', `got "${sksInvoice?.lines[0].label}"`);

  const sksHtml = await call('GET', `/api/admin/stockists/invoices/${sksInvoice.id}/html`);
  check('billed to Stacked Store', sksHtml.text.includes('Stacked Store Pte Ltd'));
  check('Alexandra Road address', sksHtml.text.includes('2 Alexandra Road #07-06'));
  check('Ves Products line', sksHtml.text.includes('Consignment - Ves Products'));
  check('detail reads "For payment of goods", not IGC\'s statement wording',
    sksHtml.text.includes('For payment of goods') && !sksHtml.text.includes('As emailed sales report from Stacked Store'));
  check('total 1360.80', sksHtml.text.includes('>1360.80<'));
  // The sent invoice reads "For payment of goods" full stop — no trailing colon.
  check('no dangling colon where a period would go', !sksHtml.text.includes('goods:'));
  // Strip the inlined logo first: base64 of the PNG happens to contain the
  // literal "IGC", which is not a leak of IGC's details into this invoice.
  const sksBody = sksHtml.text.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, '[logo]');
  check('no IGC details leaked', !sksBody.includes('IGC'),
    sksBody.split('\n').filter(l => l.includes('IGC')).join(' | '));

  console.log('\n== sales reports ==');
  const allLines = (detail.json.invoices || []).flatMap(i => i.lines.map(l => ({ ...l, invoice: i.invoice_number })));
  check('every IGC period has a report', allLines.every(l => l.has_statement),
    allLines.filter(l => !l.has_statement).map(l => `${l.invoice} ${l.label}`).join(', '));
  check('8 reports across 4 invoices', allLines.length === 8, `got ${allLines.length}`);
  check('filename kept as the stockist sent it',
    allLines.some(l => l.statement_filename === "VES Sales_Apr'26.xlsx"),
    allLines.map(l => l.statement_filename).join(', '));
  // The path is an internal storage key; the client has no business seeing it.
  check('storage path not exposed to the client', allLines.every(l => l.statement_path === undefined));

  const aprLine = allLines.find(l => l.statement_filename === "VES Sales_Apr'26.xlsx");
  const signed = await call('GET', `/api/admin/stockists/lines/${aprLine.id}/statement`);
  check('signed URL issued', signed.status === 200 && /^https:\/\//.test(signed.json?.url || ''), signed.text?.slice(0, 120));
  // Proves the bucket is genuinely private: the same object without the
  // signature must be refused.
  const bare = (signed.json.url || '').split('?')[0];
  const unsigned = await fetch(bare);
  check('bucket is private — unsigned fetch refused', unsigned.status >= 400, `got ${unsigned.status}`);
  const download = await fetch(signed.json.url);
  check('signed URL downloads the file', download.status === 200, `got ${download.status}`);
  const bytes = Buffer.from(await download.arrayBuffer());
  // xlsx is a zip; "PK" is the signature. Confirms the real spreadsheet came
  // back rather than an error page with a 200.
  check('and it is the real spreadsheet', bytes.length > 5000 && bytes.subarray(0, 2).toString() === 'PK',
    `${bytes.length} bytes, starts ${bytes.subarray(0, 2).toString('hex')}`);

  const sksLineId = sksInvoice.lines[0].id;
  const missing = await call('GET', `/api/admin/stockists/lines/${sksLineId}/statement`);
  check('period with no report 404s rather than erroring', missing.status === 404, `got ${missing.status}`);

  // Attach / fetch / remove through the API, which is the path the admin UI
  // uses — the backfill wrote to storage directly and never exercised it.
  const upload = async (name, body) => {
    const form = new FormData();
    form.append('file', new Blob([body]), name);
    const res = await fetch(`${BASE}/api/admin/stockists/lines/${sksLineId}/statement`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    return { status: res.status, text: await res.text() };
  };

  check('a .txt is rejected', (await upload('notes.txt', 'nope')).status >= 400);
  const attached = await upload('Round Trip.xlsx', 'PKround-trip-test');
  check('an .xlsx is accepted', attached.status === 200, attached.text.slice(0, 140));

  const withReport = await call('GET', `/api/admin/stockists/${sks.id}`);
  check('shows as attached', withReport.json.invoices[0].lines[0].has_statement === true);
  check('filename recorded', withReport.json.invoices[0].lines[0].statement_filename === 'Round Trip.xlsx',
    withReport.json.invoices[0].lines[0].statement_filename);

  const rt = await call('GET', `/api/admin/stockists/lines/${sksLineId}/statement`);
  const rtBody = await (await fetch(rt.json.url)).text();
  check('downloads the bytes that were uploaded', rtBody === 'PKround-trip-test', rtBody.slice(0, 40));

  check('removed', (await call('DELETE', `/api/admin/stockists/lines/${sksLineId}/statement`)).status === 200);
  const cleared = await call('GET', `/api/admin/stockists/${sks.id}`);
  check('back to no report', cleared.json.invoices[0].lines[0].has_statement === false);

  console.log('\n== correcting a paid invoice back to outstanding ==');
  // VI01SKS0126 was recorded as paid when it was actually outstanding. Clearing
  // the status without clearing paid_at would leave the row reading as settled
  // on a date it was not, while the outstanding total (derived from status) said
  // otherwise — right in the list, wrong in the record.
  const corr = await call('POST', `/api/admin/stockists/${sks.id}/invoices`, {
    issue_date: '2026-11-01', status: 'paid', lines: [{ amount_sgd: 5 }],
  });
  check('starts paid with a payment date', !!corr.json?.invoice?.paid_at);
  const backToSent = await call('PUT', `/api/admin/stockists/invoices/${corr.json.invoice.id}`, { status: 'sent' });
  check('payment date cleared on the way back to sent', !backToSent.json?.invoice?.paid_at,
    backToSent.json?.invoice?.paid_at);
  check('sent date kept', !!backToSent.json?.invoice?.sent_at);
  await call('PUT', `/api/admin/stockists/invoices/${corr.json.invoice.id}`, { status: 'draft' });
  await call('DELETE', `/api/admin/stockists/invoices/${corr.json.invoice.id}`);

  console.log('\n== period labels are escaped, not injected ==');
  // period_label is free text an admin types and it lands in the invoice HTML.
  // Admin-to-admin only, but it is still a stored-XSS sink if interpolated raw.
  const xss = await call('POST', `/api/admin/stockists/${sks.id}/invoices`, {
    issue_date: '2026-10-01',
    lines: [{ period_label: '<script>alert(1)</script>&"', amount_sgd: 1 }],
  });
  const xssHtml = await call('GET', `/api/admin/stockists/invoices/${xss.json.invoice.id}/html`);
  check('script tag escaped', !xssHtml.text.includes('<script>alert(1)</script>'));
  check('rendered as visible text', xssHtml.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  check('ampersand and quote escaped', xssHtml.text.includes('&amp;&quot;'));
  // A legitimate apostrophe must survive as itself, not become an entity soup.
  const apos = await call('POST', `/api/admin/stockists/${sks.id}/invoices`, {
    issue_date: '2026-10-02',
    lines: [{ period_label: "Boutique's Fair", amount_sgd: 1 }],
  });
  const aposHtml = await call('GET', `/api/admin/stockists/invoices/${apos.json.invoice.id}/html`);
  check('apostrophe renders literally', aposHtml.text.includes("Boutique's Fair"));
  await call('DELETE', `/api/admin/stockists/invoices/${xss.json.invoice.id}`);
  await call('DELETE', `/api/admin/stockists/invoices/${apos.json.invoice.id}`);

  console.log('\n== per-stockist sequences are independent ==');
  // VI01IGC0126 and VI01SKS0126 are four days apart and both VI01, which is
  // only correct if each stockist counts on its own.
  const sksNext = await call('POST', `/api/admin/stockists/${sks.id}/invoices`, {
    issue_date: '2026-09-01', lines: [{ amount_sgd: 10 }],
  });
  check('Stacked Store continues at VI02, unaffected by IGC',
    sksNext.json?.invoice?.invoice_number === 'VI02SKS0926', sksNext.json?.invoice?.invoice_number);
  check('a line with no dates at all is accepted', sksNext.status === 200, `got ${sksNext.status}`);
  await call('DELETE', `/api/admin/stockists/invoices/${sksNext.json.invoice.id}`);

  console.log('\n== validation ==');
  check('no periods rejected',
    (await call('POST', `/api/admin/stockists/${igc.id}/invoices`, { issue_date: '2026-09-01', lines: [] })).status === 400);
  check('missing amount rejected',
    (await call('POST', `/api/admin/stockists/${igc.id}/invoices`, {
      issue_date: '2026-09-01', lines: [{ period_from: '2026-06-01', period_to: '2026-06-30' }] })).status === 400);
  check('half a date range rejected',
    (await call('POST', `/api/admin/stockists/${igc.id}/invoices`, {
      issue_date: '2026-09-01', lines: [{ period_from: '2026-06-01', amount_sgd: 10 }] })).status === 400);
  check('backwards period rejected',
    (await call('POST', `/api/admin/stockists/${igc.id}/invoices`, {
      issue_date: '2026-09-01', lines: [{ period_from: '2026-06-30', period_to: '2026-06-01', amount_sgd: 10 }] })).status === 400);
  check('duplicate invoice code rejected',
    (await call('POST', '/api/admin/stockists', { name: 'Another IGC', invoice_code: 'IGC' })).status === 409);
  check('missing invoice code rejected',
    (await call('POST', '/api/admin/stockists', { name: 'No Code' })).status === 400);
  check('sent invoice periods locked',
    (await call('PUT', `/api/admin/stockists/invoices/${byNumber.VI02IGC0226.id}`, {
      lines: [{ period_from: '2026-01-01', period_to: '2026-01-31', amount_sgd: 999 }] })).status === 409);
  check('sent invoice cannot be deleted',
    (await call('DELETE', `/api/admin/stockists/invoices/${byNumber.VI02IGC0226.id}`)).status === 409);

  console.log('\n== raise, re-mint on send, void ==');
  const created = await call('POST', `/api/admin/stockists/${igc.id}/invoices`, {
    issue_date: '2026-06-01',
    lines: [{ period_from: '2026-06-01', period_to: '2026-06-30', gross_sgd: 100, amount_sgd: 45.8716 }],
  });
  check('created', created.status === 200, `got ${created.status} ${created.text.slice(0, 200)}`);
  const fresh = created.json?.invoice;
  check('minted VI04...0626 for a June issue', fresh?.invoice_number === 'VI04IGC0626', fresh?.invoice_number);
  check('starts as draft', fresh?.status === 'draft');

  const sent = await call('PUT', `/api/admin/stockists/invoices/${fresh.id}`, { status: 'sent', issue_date: '2026-09-04' });
  check('sent ok', sent.status === 200, `got ${sent.status}`);
  check('number rebuilt for September, not June',
    sent.json?.invoice?.invoice_number === 'VI04IGC0926', sent.json?.invoice?.invoice_number);
  check('sent_at stamped', !!sent.json?.invoice?.sent_at);

  const paid = await call('PUT', `/api/admin/stockists/invoices/${fresh.id}`, { status: 'paid' });
  check('paid ok', paid.status === 200);
  check('number untouched once sent',
    paid.json?.invoice?.invoice_number === 'VI04IGC0926', paid.json?.invoice?.invoice_number);
  check('paid_at stamped', !!paid.json?.invoice?.paid_at);

  // Clean up the throwaway directly — the API deliberately refuses to delete a
  // non-draft, which is the behaviour asserted above.
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  await admin.from('stockist_invoices').delete().eq('id', fresh.id);
  const after = await call('GET', `/api/admin/stockists/${igc.id}`);
  check('cleaned up, back to 4 invoices', (after.json.invoices || []).length === 4, `${(after.json.invoices || []).length}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('\nTest run failed:', e.message); process.exit(1); });
