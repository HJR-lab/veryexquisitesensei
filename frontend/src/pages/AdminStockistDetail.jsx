import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import AdminPage from '../components/AdminPage';

const TC = '#C4622D', TC_DARK = '#9E4A1E';
const INK = '#282828', MUTED = '#888888', RULE = '#E5E2DD', ALT = '#F5F3F0';

const STATUS_STYLE = {
  draft: { bg: ALT, fg: MUTED },
  sent: { bg: '#FFF3E0', fg: '#E65100' },
  paid: { bg: '#E8F5E9', fg: '#2E7D32' },
  void: { bg: '#FFEBEE', fg: '#C62828' },
};

const money = (n) => Number(n || 0).toFixed(2);
const today = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const blankLine = () => ({ period_from: '', period_to: '', period_label: '', gross_sgd: '', amount_sgd: '' });

export default function AdminStockistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [stockist, setStockist] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [uploadLine, setUploadLine] = useState(null);
  const fileInput = useRef(null);
  const [draft, setDraft] = useState({ issue_date: today(), lines: [blankLine()] });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/admin/stockists/${id}`);
      setStockist(data.stockist);
      setInvoices(data.invoices || []);
    } catch (err) {
      console.error('Failed to load stockist:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (invoice, status) => {
    const verb = { sent: 'Mark as sent', paid: 'Mark as paid', void: 'Void', draft: 'Move back to draft' }[status];
    if (status === 'void' && !confirm(`Void ${invoice.invoice_number}? Its number stays used and cannot be reissued.`)) return;
    if (status === 'sent' && invoice.status === 'draft') {
      if (!confirm(`${verb} ${invoice.invoice_number}?\n\nThe number and date are rebuilt now, for today's month.`)) return;
    }
    try {
      setBusy(true);
      const body = { status };
      // A draft's number belongs to the month it actually goes out in, so the
      // issue date is stamped at the moment of sending, not when it was drafted.
      if (status === 'sent' && invoice.status === 'draft') body.issue_date = today();
      await api.put(`/admin/stockists/invoices/${invoice.id}`, body);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update invoice');
    } finally {
      setBusy(false);
    }
  };

  const deleteInvoice = async (invoice) => {
    if (!confirm(`Delete draft ${invoice.invoice_number}?`)) return;
    try {
      setBusy(true);
      await api.delete(`/admin/stockists/invoices/${invoice.id}`);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete invoice');
    } finally {
      setBusy(false);
    }
  };

  // The sales report behind a billed period. The bucket is private, so the app
  // asks for a short-lived signed URL at click time rather than holding a link.
  const openStatement = async (line) => {
    try {
      const { data } = await api.get(`/admin/stockists/lines/${line.id}/statement`);
      window.open(data.url, '_blank');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to open the sales report');
    }
  };

  const pickStatement = (line) => {
    setUploadLine(line);
    fileInput.current.value = ''; // so re-picking the same file still fires onChange
    fileInput.current.click();
  };

  const uploadStatement = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !uploadLine) return;
    try {
      setBusy(true);
      const form = new FormData();
      form.append('file', file);
      await api.post(`/admin/stockists/lines/${uploadLine.id}/statement`, form);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to attach the sales report');
    } finally {
      setUploadLine(null);
      setBusy(false);
    }
  };

  const removeStatement = async (line) => {
    if (!confirm('Remove the sales report from this period?')) return;
    try {
      setBusy(true);
      await api.delete(`/admin/stockists/lines/${line.id}/statement`);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove the sales report');
    } finally {
      setBusy(false);
    }
  };

  const openInvoice = async (invoice) => {
    try {
      const { data } = await api.get(`/admin/stockists/invoices/${invoice.id}/html`);
      // The endpoint is admin-gated, so the document is fetched with the app's
      // token rather than linked to directly — a bare URL would arrive without
      // an Authorization header and 401. Handed to the new tab as a blob so the
      // markup is parsed as its own document instead of written into one.
      const url = URL.createObjectURL(new Blob([data], { type: 'text/html' }));
      const win = window.open(url, '_blank');
      if (!win) {
        URL.revokeObjectURL(url);
        return alert('Allow pop-ups to view the invoice.');
      }
      // Revoked once the tab has loaded it; revoking immediately would leave
      // the new window with nothing to render.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to render invoice');
    }
  };

  const saveDraft = async () => {
    try {
      setBusy(true);
      await api.post(`/admin/stockists/${id}/invoices`, {
        issue_date: draft.issue_date,
        status: 'draft',
        lines: draft.lines,
      });
      setDrafting(false);
      setDraft({ issue_date: today(), lines: [blankLine()] });
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create invoice');
    } finally {
      setBusy(false);
    }
  };

  const updateLine = (i, key, value) => {
    setDraft(d => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, [key]: value } : l)) }));
  };

  const draftTotal = draft.lines.reduce((sum, l) => sum + (Number(l.amount_sgd) || 0), 0);

  const billed = invoices.filter(i => i.status !== 'void').reduce((s, i) => s + Number(i.total_sgd), 0);
  const outstanding = invoices.filter(i => i.status !== 'void' && i.status !== 'paid').reduce((s, i) => s + Number(i.total_sgd), 0);

  if (loading) {
    return <AdminPage title="Stockist"><div style={{ color: MUTED, fontSize: '12px' }}>Loading…</div></AdminPage>;
  }
  if (!stockist) {
    return <AdminPage title="Stockist"><div style={{ color: MUTED, fontSize: '12px' }}>Not found.</div></AdminPage>;
  }

  const cell = { padding: '6px 8px', fontSize: '12px', border: `1px solid ${RULE}`, fontFamily: 'inherit', color: INK, width: '100%' };

  return (
    <AdminPage
      title={stockist.name}
      subtitle={`${stockist.margin_rate == null
        ? 'no commission rate'
        : `${Math.round(Number(stockist.margin_rate) * 100)}% of the GST-exclusive amount`} · ${money(billed)} billed · ${money(outstanding)} outstanding`}
      actions={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => navigate('/admin/stockists')}
            style={{ fontSize: '10px', fontWeight: 700, padding: '8px 14px', backgroundColor: ALT, color: INK, border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            Back
          </button>
          <button
            onClick={() => setDrafting(!drafting)}
            style={{ fontSize: '10px', fontWeight: 700, padding: '8px 16px', backgroundColor: drafting ? ALT : TC, color: drafting ? INK : '#FFF', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            {drafting ? 'Cancel' : 'New invoice'}
          </button>
        </div>
      }
    >
      {drafting && (
        <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF', padding: '16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: MUTED, marginBottom: '12px' }}>
            Saved as a draft. The invoice number is minted when you mark it sent, so a draft that waits on a late
            statement still goes out numbered for the month it actually leaves in.
          </div>

          <label style={{ display: 'inline-block', marginBottom: '12px' }}>
            <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '3px' }}>
              Issue date
            </span>
            <input
              type="date"
              value={draft.issue_date}
              onChange={e => setDraft({ ...draft, issue_date: e.target.value })}
              style={{ ...cell, width: 'auto' }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '130px 130px 1fr 100px 110px 30px', gap: '6px', alignItems: 'end', marginBottom: '6px' }}>
            {['From', 'To', 'Label (optional)', 'Gross', 'Amount', ''].map((h, i) => (
              <span key={i} style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>{h}</span>
            ))}
          </div>

          {draft.lines.map((line, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '130px 130px 1fr 100px 110px 30px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
              <input type="date" value={line.period_from} onChange={e => updateLine(i, 'period_from', e.target.value)} style={cell} />
              <input type="date" value={line.period_to} onChange={e => updateLine(i, 'period_to', e.target.value)} style={cell} />
              <input value={line.period_label} onChange={e => updateLine(i, 'period_label', e.target.value)} placeholder="From the dates" style={cell} />
              <input value={line.gross_sgd} onChange={e => updateLine(i, 'gross_sgd', e.target.value)} placeholder="540" style={{ ...cell, textAlign: 'right' }} />
              <input value={line.amount_sgd} onChange={e => updateLine(i, 'amount_sgd', e.target.value)} placeholder="247.7064" style={{ ...cell, textAlign: 'right' }} />
              {draft.lines.length > 1 ? (
                <button
                  onClick={() => setDraft(d => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))}
                  style={{ fontSize: '14px', padding: '4px', backgroundColor: 'transparent', color: MUTED, border: 'none', cursor: 'pointer' }}
                >
                  ×
                </button>
              ) : <span />}
            </div>
          ))}

          <div style={{ fontSize: '10px', color: MUTED, margin: '4px 0 14px' }}>
            Amount is the statement&rsquo;s own &ldquo;Total Amount to invoice&rdquo; figure &mdash; paste it in full
            ({(540 / 1.09 * 0.5).toFixed(4)}, not 247.71). It is rounded once, at the total.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setDraft(d => ({ ...d, lines: [...d.lines, blankLine()] }))}
              style={{ fontSize: '10px', fontWeight: 700, padding: '7px 14px', backgroundColor: ALT, color: INK, border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              Add period
            </button>
            <button
              onClick={saveDraft}
              disabled={busy}
              style={{ fontSize: '10px', fontWeight: 700, padding: '7px 18px', backgroundColor: TC, color: '#FFF', border: 'none', cursor: busy ? 'default' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: busy ? 0.6 : 1 }}
            >
              {busy ? 'Saving…' : 'Save draft'}
            </button>
            <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700 }}>{money(draftTotal)}</span>
          </div>
        </div>
      )}

      {/* One hidden input serves every period; pickStatement records which. */}
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls,.csv,.pdf"
        onChange={uploadStatement}
        style={{ display: 'none' }}
      />

      <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 110px 90px 210px', backgroundColor: ALT, padding: '8px 16px' }}>
          {[['Invoice', 'left'], ['Periods', 'left'], ['Issued', 'left'], ['Total', 'right'], ['', 'right']].map(([h, align], i) => (
            <span key={i} style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: align }}>{h}</span>
          ))}
        </div>

        {invoices.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>No invoices yet.</div>
        )}

        {invoices.map(invoice => {
          const style = STATUS_STYLE[invoice.status] || STATUS_STYLE.draft;
          return (
            <div
              key={invoice.id}
              style={{ display: 'grid', gridTemplateColumns: '150px 1fr 110px 90px 210px', padding: '10px 16px', borderTop: `1px solid ${RULE}`, alignItems: 'center' }}
            >
              <div>
                <span
                  onClick={() => openInvoice(invoice)}
                  style={{ fontSize: '12px', fontWeight: 700, color: TC_DARK, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {invoice.invoice_number}
                </span>
                <div style={{ marginTop: '3px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', backgroundColor: style.bg, color: style.fg, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {invoice.status}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: '11px', color: INK }}>
                {invoice.lines.map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'baseline', gap: '10px', maxWidth: '360px', color: MUTED }}>
                    <span style={{ flex: 1, ...(l.label ? {} : { fontStyle: 'italic' }) }}>
                      {l.label || 'No period'}
                    </span>
                    <span style={{ width: '70px', textAlign: 'right' }}>{money(l.amount_sgd)}</span>
                    {/* The statement each figure came from. Without it, checking
                        an amount meant going back to the mailbox it arrived in. */}
                    <span style={{ width: '80px', textAlign: 'right' }}>
                      {l.has_statement ? (
                        <>
                          <button
                            onClick={() => openStatement(l)}
                            title={l.statement_filename || 'Sales report'}
                            style={{ fontSize: '10px', fontWeight: 700, padding: 0, background: 'none', border: 'none', color: TC_DARK, cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            Report
                          </button>
                          <button
                            onClick={() => removeStatement(l)}
                            disabled={busy}
                            title="Remove this sales report"
                            style={{ fontSize: '11px', marginLeft: '6px', padding: 0, background: 'none', border: 'none', color: MUTED, cursor: 'pointer' }}
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => pickStatement(l)}
                          disabled={busy}
                          style={{ fontSize: '10px', padding: 0, background: 'none', border: 'none', color: MUTED, cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Attach
                        </button>
                      )}
                    </span>
                  </div>
                ))}
                {invoice.notes && (
                  <div style={{ fontSize: '10px', color: '#E65100', marginTop: '4px', maxWidth: '420px' }}>{invoice.notes}</div>
                )}
              </div>

              <span style={{ fontSize: '11px', color: MUTED }}>{fmtDate(invoice.issue_date)}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right' }}>{money(invoice.total_sgd)}</span>

              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {invoice.status === 'draft' && (
                  <>
                    <button onClick={() => setStatus(invoice, 'sent')} disabled={busy}
                      style={{ fontSize: '9px', fontWeight: 700, padding: '3px 8px', backgroundColor: '#FFF3E0', color: '#E65100', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Sent
                    </button>
                    <button onClick={() => deleteInvoice(invoice)} disabled={busy}
                      style={{ fontSize: '9px', fontWeight: 700, padding: '3px 8px', backgroundColor: '#FFEBEE', color: '#C62828', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Delete
                    </button>
                  </>
                )}
                {invoice.status === 'sent' && (
                  <>
                    <button onClick={() => setStatus(invoice, 'paid')} disabled={busy}
                      style={{ fontSize: '9px', fontWeight: 700, padding: '3px 8px', backgroundColor: '#E8F5E9', color: '#2E7D32', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Paid
                    </button>
                    <button onClick={() => setStatus(invoice, 'void')} disabled={busy}
                      style={{ fontSize: '9px', fontWeight: 700, padding: '3px 8px', backgroundColor: '#FFEBEE', color: '#C62828', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Void
                    </button>
                  </>
                )}
                {invoice.pdf_url && (
                  <a href={invoice.pdf_url} target="_blank" rel="noreferrer"
                    style={{ fontSize: '9px', fontWeight: 700, padding: '3px 8px', backgroundColor: ALT, color: INK, textTransform: 'uppercase', letterSpacing: '0.04em', textDecoration: 'none' }}>
                    Filed PDF
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '16px', fontSize: '11px', color: MUTED, lineHeight: 1.6 }}>
        <div><strong style={{ color: INK }}>Bill to</strong> · {stockist.bill_to_name || stockist.name}
          {stockist.bill_to_address_line1 ? `, ${stockist.bill_to_address_line1}` : ''}
          {stockist.bill_to_address_line2 ? `, ${stockist.bill_to_address_line2}` : ''}</div>
        <div><strong style={{ color: INK }}>Invoice line</strong> · {stockist.invoice_line_description || `Consignment - ${stockist.name}`}</div>
        <div><strong style={{ color: INK }}>Numbering</strong> · VI&lt;seq&gt;{stockist.invoice_code}&lt;MMYY&gt;, sequence restarts each January</div>
      </div>
    </AdminPage>
  );
}
