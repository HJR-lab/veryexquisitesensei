const supabaseDb = require('../utils/supabaseDb');
const inv = require('../utils/stockistInvoice');

// Consignment stockists and the invoices VES raises against them.
//
// VES sells through retail stockists on consignment; they email a monthly sales
// statement and VES invoices for its share. This is an invoice ledger — it
// records what was billed, for which periods, and whether it was paid. It does
// NOT parse statements or track stock at the stockist; VES has no product
// tables here, so there would be nothing to reconcile against.
module.exports = function (app, { authenticateToken, requireAdmin, asyncHandler }) {

const db = () => supabaseDb.supabase;

// Full precision is kept in the database (247.7064) and rounded once, here, so
// a four-line invoice totals the way the already-sent ones did.
const round2 = (n) => Math.round(Number(n) * 100) / 100;

const invoiceTotal = (lines) => round2((lines || []).reduce((sum, l) => sum + Number(l.amount_sgd), 0));

// What a billed period is called on the invoice: an explicit label if the
// admin set one, otherwise derived from the dates, otherwise nothing at all —
// a line with neither is an invoice that bills no particular period.
const lineLabel = (line) =>
  line.period_label || (line.period_from && line.period_to
    ? inv.formatPeriodLabel(line.period_from, line.period_to)
    : '');

async function loadStockist(id) {
  const { data, error } = await db().from('stockists').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadInvoiceWithLines(invoiceId) {
  const { data: invoice, error } = await db()
    .from('stockist_invoices')
    .select('*, stockists(*)')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw error;
  if (!invoice) return null;

  const { data: lines, error: linesError } = await db()
    .from('stockist_invoice_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: true })
    .order('period_from', { ascending: true });
  if (linesError) throw linesError;

  return { ...invoice, lines: lines || [] };
}

// Validate and normalise the period rows a client sends when creating or
// replacing an invoice's lines. Rejects rather than coerces: a line with a
// missing amount is a mistake worth surfacing, not one worth defaulting to 0.
function normaliseLines(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'An invoice needs at least one period.' };
  }
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i] || {};
    const from = String(line.period_from || '').trim();
    const to = String(line.period_to || '').trim();

    // Both dates absent is allowed and means "this invoice bills no particular
    // period", as VI01SKS0126 does. One of the two absent is a half-filled
    // form, not an intention.
    const dated = Boolean(from || to);
    if (dated) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return { error: `Period ${i + 1} needs both a start and an end date, or neither.` };
      }
      if (to < from) {
        return { error: `Period ${i + 1} ends before it starts.` };
      }
    }
    const amount = Number(line.amount_sgd);
    if (!Number.isFinite(amount)) {
      return { error: `Period ${i + 1} needs an amount to invoice.` };
    }
    const gross = line.gross_sgd === '' || line.gross_sgd == null ? null : Number(line.gross_sgd);
    if (gross !== null && !Number.isFinite(gross)) {
      return { error: `Period ${i + 1} has an invalid gross figure.` };
    }
    lines.push({
      period_from: dated ? from : null,
      period_to: dated ? to : null,
      period_label: (line.period_label || '').trim() || null,
      gross_sgd: gross,
      amount_sgd: amount,
      sort_order: i,
    });
  }
  return { lines };
}

// ============================================
// STOCKISTS
// ============================================

app.get('/api/admin/stockists', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { data: stockists, error } = await db()
    .from('stockists')
    .select('*')
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });
  if (error) throw error;

  // Each stockist's ledger position, so the list answers "who owes what"
  // without opening every one of them.
  const { data: invoices, error: invoicesError } = await db()
    .from('stockist_invoices')
    .select('id, stockist_id, status, stockist_invoice_lines(amount_sgd)');
  if (invoicesError) throw invoicesError;

  const summary = {};
  for (const invoice of invoices || []) {
    const bucket = (summary[invoice.stockist_id] ||= { invoice_count: 0, billed_total: 0, outstanding_total: 0 });
    if (invoice.status === 'void') continue;
    const total = invoiceTotal(invoice.stockist_invoice_lines);
    bucket.invoice_count += 1;
    bucket.billed_total = round2(bucket.billed_total + total);
    if (invoice.status !== 'paid') {
      bucket.outstanding_total = round2(bucket.outstanding_total + total);
    }
  }

  res.json({
    stockists: (stockists || []).map((s) => ({
      ...s,
      ...(summary[s.id] || { invoice_count: 0, billed_total: 0, outstanding_total: 0 }),
    })),
  });
}));

app.post('/api/admin/stockists', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { name, invoice_code, margin_rate, gst_rate, bill_to_name, bill_to_address_line1,
          bill_to_address_line2, invoice_line_description, invoice_line_detail,
          contact_email, notes } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  const code = String(invoice_code || '').trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ error: 'Invoice code is required — it is embedded in every invoice number.' });
  }
  if (!/^[A-Z0-9]+$/.test(code)) {
    return res.status(400).json({ error: 'Invoice code must be letters and digits only.' });
  }

  const { data, error } = await db().from('stockists').insert({
    name: String(name).trim(),
    invoice_code: code,
    // Left blank means "not confirmed", not "assume IGC's 50%" — the rate is
    // displayed, and a made-up one reads as fact.
    margin_rate: margin_rate == null || margin_rate === '' ? null : Number(margin_rate),
    gst_rate: gst_rate == null || gst_rate === '' ? 0.09 : Number(gst_rate),
    bill_to_name: (bill_to_name || '').trim() || null,
    bill_to_address_line1: (bill_to_address_line1 || '').trim() || null,
    bill_to_address_line2: (bill_to_address_line2 || '').trim() || null,
    invoice_line_description: (invoice_line_description || '').trim() || null,
    invoice_line_detail: (invoice_line_detail || '').trim() || null,
    contact_email: (contact_email || '').trim() || null,
    notes: (notes || '').trim() || null,
  }).select().single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: `Invoice code ${code} is already used by another stockist.` });
    }
    throw error;
  }
  res.json({ success: true, stockist: data });
}));

app.get('/api/admin/stockists/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const stockist = await loadStockist(req.params.id);
  if (!stockist) return res.status(404).json({ error: 'Stockist not found.' });

  const { data: invoices, error } = await db()
    .from('stockist_invoices')
    .select('*, stockist_invoice_lines(*)')
    .eq('stockist_id', stockist.id)
    .order('issue_date', { ascending: false });
  if (error) throw error;

  res.json({
    stockist,
    invoices: (invoices || []).map((i) => {
      const lines = (i.stockist_invoice_lines || []).sort(
        (a, b) => a.sort_order - b.sort_order || String(a.period_from).localeCompare(String(b.period_from))
      );
      return {
        ...i,
        stockist_invoice_lines: undefined,
        lines: lines.map((l) => ({ ...l, label: lineLabel(l) })),
        total_sgd: invoiceTotal(lines),
      };
    }),
  });
}));

app.put('/api/admin/stockists/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const stockist = await loadStockist(req.params.id);
  if (!stockist) return res.status(404).json({ error: 'Stockist not found.' });

  const patch = { updated_at: new Date().toISOString() };
  const textFields = ['name', 'bill_to_name', 'bill_to_address_line1', 'bill_to_address_line2',
                      'invoice_line_description', 'invoice_line_detail', 'contact_email', 'notes'];
  for (const field of textFields) {
    if (field in req.body) patch[field] = (req.body[field] || '').trim() || null;
  }
  if ('margin_rate' in req.body) {
    patch.margin_rate = req.body.margin_rate === '' || req.body.margin_rate == null
      ? null
      : Number(req.body.margin_rate);
  }
  if ('gst_rate' in req.body) patch.gst_rate = Number(req.body.gst_rate);
  if ('is_active' in req.body) patch.is_active = Boolean(req.body.is_active);

  // invoice_code is intentionally not editable: it is baked into every invoice
  // number already sent, and changing it would break the sequence lookup that
  // stops the next invoice reusing a number IGC has on file.
  if (!patch.name) delete patch.name;

  const { data, error } = await db().from('stockists').update(patch).eq('id', stockist.id).select().single();
  if (error) throw error;
  res.json({ success: true, stockist: data });
}));

// ============================================
// INVOICES
// ============================================

// Raise an invoice. The number is minted here from the issue month and the
// numbers already on this stockist's ledger — never supplied by the client,
// except when backfilling an invoice that was sent before this ledger existed.
app.post('/api/admin/stockists/:id/invoices', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const stockist = await loadStockist(req.params.id);
  if (!stockist) return res.status(404).json({ error: 'Stockist not found.' });

  const issueDate = String(req.body.issue_date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    return res.status(400).json({ error: 'An issue date is required.' });
  }

  const { lines, error: linesError } = normaliseLines(req.body.lines);
  if (linesError) return res.status(400).json({ error: linesError });

  const { data: existing, error: existingError } = await db()
    .from('stockist_invoices')
    .select('invoice_number')
    .eq('stockist_id', stockist.id);
  if (existingError) throw existingError;

  const token = inv.stockistInvoiceToken(stockist.invoice_code, stockist.name);
  const { mm, yy } = inv.issueMonthParts(issueDate);

  // A backfilled invoice keeps the number IGC already has; a new one is minted.
  const supplied = String(req.body.invoice_number || '').trim().toUpperCase();
  const invoiceNumber = supplied || inv.buildInvoiceNumber({
    existingNumbers: (existing || []).map((e) => e.invoice_number),
    token,
    mm,
    yy,
  });

  const status = ['draft', 'sent', 'paid', 'void'].includes(req.body.status) ? req.body.status : 'draft';

  const { data: invoice, error } = await db().from('stockist_invoices').insert({
    stockist_id: stockist.id,
    invoice_number: invoiceNumber,
    issue_date: issueDate,
    status,
    // Both dates fall back to the issue date when an already-settled invoice is
    // backfilled. paid_at used to be left null here while sent_at was derived,
    // so an invoice created as paid recorded no payment date but one moved to
    // paid later did — same end state, different record.
    sent_at: req.body.sent_at || (status === 'sent' || status === 'paid' ? new Date(issueDate).toISOString() : null),
    paid_at: req.body.paid_at || (status === 'paid' ? new Date(issueDate).toISOString() : null),
    pdf_url: (req.body.pdf_url || '').trim() || null,
    notes: (req.body.notes || '').trim() || null,
  }).select().single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: `Invoice ${invoiceNumber} already exists for this stockist.` });
    }
    throw error;
  }

  const { error: insertLinesError } = await db()
    .from('stockist_invoice_lines')
    .insert(lines.map((l) => ({ ...l, invoice_id: invoice.id })));
  if (insertLinesError) {
    // Without its periods the invoice bills nothing, so it must not survive a
    // half-written insert.
    await db().from('stockist_invoices').delete().eq('id', invoice.id);
    throw insertLinesError;
  }

  res.json({ success: true, invoice: await loadInvoiceWithLines(invoice.id) });
}));

app.put('/api/admin/stockists/invoices/:invoiceId', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const invoice = await loadInvoiceWithLines(req.params.invoiceId);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

  const patch = { updated_at: new Date().toISOString() };

  if ('status' in req.body) {
    const status = req.body.status;
    if (!['draft', 'sent', 'paid', 'void'].includes(status)) {
      return res.status(400).json({ error: 'Unknown status.' });
    }
    patch.status = status;
    // Stamp the transition the first time it happens; an invoice moved back to
    // draft and re-sent keeps its original sent date unless explicitly cleared.
    if (status === 'sent' && !invoice.sent_at) patch.sent_at = new Date().toISOString();
    if (status === 'paid') {
      if (!invoice.sent_at) patch.sent_at = new Date().toISOString();
      if (!invoice.paid_at) patch.paid_at = new Date().toISOString();
    }
    // Moving OFF paid must clear the payment date, or an invoice corrected back
    // to outstanding still reads as settled on a date it was not. The outstanding
    // total is derived from status, so the row would look right in the list while
    // carrying a paid_at that contradicts it.
    if (status !== 'paid' && invoice.paid_at && !('paid_at' in req.body)) {
      patch.paid_at = null;
    }
  }
  if ('issue_date' in req.body && /^\d{4}-\d{2}-\d{2}$/.test(req.body.issue_date)) {
    patch.issue_date = req.body.issue_date;
  }

  // A draft's number is provisional. The month and sequence belong to the month
  // the invoice is actually ISSUED in, and a draft can sit for weeks waiting on
  // a missing statement — the Feb-May'26 catch-up has been waiting on Jun/Jul
  // since June. Re-minting on the draft -> sent transition is what stops a
  // September invoice going out numbered as an August one.
  //
  // Only drafts are re-numbered. Once sent, the number is on a document IGC
  // holds and is never touched again.
  if (invoice.status === 'draft' && (patch.status === 'sent' || patch.status === 'paid')) {
    const effectiveIssueDate = patch.issue_date || invoice.issue_date;
    const { data: siblings, error: siblingsError } = await db()
      .from('stockist_invoices')
      .select('invoice_number')
      .eq('stockist_id', invoice.stockist_id)
      .neq('id', invoice.id);
    if (siblingsError) throw siblingsError;

    const { mm, yy } = inv.issueMonthParts(effectiveIssueDate);
    patch.invoice_number = inv.buildInvoiceNumber({
      existingNumbers: (siblings || []).map((s) => s.invoice_number),
      token: inv.stockistInvoiceToken(invoice.stockists?.invoice_code, invoice.stockists?.name),
      mm,
      yy,
    });
  }

  if ('pdf_url' in req.body) patch.pdf_url = (req.body.pdf_url || '').trim() || null;
  if ('notes' in req.body) patch.notes = (req.body.notes || '').trim() || null;
  if ('sent_at' in req.body) patch.sent_at = req.body.sent_at || null;
  if ('paid_at' in req.body) patch.paid_at = req.body.paid_at || null;

  const { error } = await db().from('stockist_invoices').update(patch).eq('id', invoice.id);
  if (error) throw error;

  // Replacing the periods is only offered on a draft. Once an invoice has been
  // sent, IGC holds a document with those figures on it; changing them silently
  // would put the ledger and the customer's copy out of step.
  if ('lines' in req.body) {
    if (invoice.status !== 'draft') {
      return res.status(409).json({ error: 'Periods can only be changed while the invoice is a draft.' });
    }
    const { lines, error: linesError } = normaliseLines(req.body.lines);
    if (linesError) return res.status(400).json({ error: linesError });

    const { error: deleteError } = await db().from('stockist_invoice_lines').delete().eq('invoice_id', invoice.id);
    if (deleteError) throw deleteError;
    const { error: insertError } = await db()
      .from('stockist_invoice_lines')
      .insert(lines.map((l) => ({ ...l, invoice_id: invoice.id })));
    if (insertError) throw insertError;
  }

  res.json({ success: true, invoice: await loadInvoiceWithLines(invoice.id) });
}));

app.delete('/api/admin/stockists/invoices/:invoiceId', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const invoice = await loadInvoiceWithLines(req.params.invoiceId);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

  // Deleting a sent invoice would free its number for reuse, and IGC already
  // holds a document carrying it. Void instead — the number stays spent.
  if (invoice.status !== 'draft') {
    return res.status(409).json({ error: 'Only a draft can be deleted. Void the invoice instead so its number stays used.' });
  }

  const { error } = await db().from('stockist_invoices').delete().eq('id', invoice.id);
  if (error) throw error;
  res.json({ success: true });
}));

// The invoice document. Returns HTML the admin prints to PDF — the same route
// the sent PDFs were produced from. Admin-gated like every other endpoint here,
// so the client fetches it with its token rather than opening a bare URL.
app.get('/api/admin/stockists/invoices/:invoiceId/html', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const invoice = await loadInvoiceWithLines(req.params.invoiceId);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

  const stockist = invoice.stockists || {};
  const { description, detail } = inv.resolveInvoiceLine({
    stockistName: stockist.name || '',
    descriptionOverride: stockist.invoice_line_description,
    detailOverride: stockist.invoice_line_detail,
  });

  const html = inv.renderInvoiceHtml({
    invoiceNumber: invoice.invoice_number,
    invoiceDate: inv.formatIssueDate(invoice.issue_date),
    billToName: (stockist.bill_to_name || '').trim() || stockist.name || '',
    billToLines: [stockist.bill_to_address_line1, stockist.bill_to_address_line2]
      .filter((l) => l && String(l).trim()),
    lineDescription: description,
    lineDetail: detail,
    periods: invoice.lines.map((l) => ({ label: lineLabel(l), amount: Number(l.amount_sgd) })),
  });

  res.type('html').send(html);
}));

};
