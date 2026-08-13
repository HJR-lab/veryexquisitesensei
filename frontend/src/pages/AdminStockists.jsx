import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import AdminPage from '../components/AdminPage';

const TC = '#C4622D', TC_DARK = '#9E4A1E', TC_LIGHT = '#F9EDE6';
const INK = '#282828', MUTED = '#888888', RULE = '#E5E2DD', ALT = '#F5F3F0';

const GRID = '1fr 90px 90px 110px 110px';

const money = (n) => Number(n || 0).toFixed(2);

// A null rate means nobody has confirmed it. Showing "0%" would read as a
// confirmed zero, which is worse than admitting it is unknown.
const pct = (rate) => (rate == null ? '—' : `${Math.round(Number(rate) * 100)}%`);

export default function AdminStockists() {
  const navigate = useNavigate();
  const [stockists, setStockists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', invoice_code: '', margin_rate: '0.5',
    bill_to_name: '', bill_to_address_line1: '', bill_to_address_line2: '',
    invoice_line_description: '', contact_email: '',
  });

  useEffect(() => { loadStockists(); }, []);

  const loadStockists = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/stockists');
      setStockists(data.stockists || []);
    } catch (err) {
      console.error('Failed to load stockists:', err);
    } finally {
      setLoading(false);
    }
  };

  const createStockist = async () => {
    try {
      setSaving(true);
      await api.post('/admin/stockists', form);
      setAdding(false);
      setForm({
        name: '', invoice_code: '', margin_rate: '0.5',
        bill_to_name: '', bill_to_address_line1: '', bill_to_address_line2: '',
        invoice_line_description: '', contact_email: '',
      });
      await loadStockists();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create stockist');
    } finally {
      setSaving(false);
    }
  };

  const outstanding = stockists.reduce((sum, s) => sum + Number(s.outstanding_total || 0), 0);
  const activeCount = stockists.filter(s => s.is_active).length;

  const field = (label, key, opts = {}) => (
    <label style={{ display: 'block', marginBottom: '10px' }}>
      <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '3px' }}>
        {label}
      </span>
      <input
        value={form[key]}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        placeholder={opts.placeholder || ''}
        style={{ width: '100%', padding: '7px 9px', fontSize: '13px', border: `1px solid ${RULE}`, fontFamily: 'inherit', color: INK }}
      />
      {opts.hint && <span style={{ display: 'block', fontSize: '10px', color: MUTED, marginTop: '3px' }}>{opts.hint}</span>}
    </label>
  );

  return (
    <AdminPage
      title="Stockists"
      subtitle={`${activeCount} active · ${money(outstanding)} outstanding`}
      actions={
        <button
          onClick={() => setAdding(!adding)}
          style={{ fontSize: '10px', fontWeight: 700, padding: '8px 16px', backgroundColor: adding ? ALT : TC, color: adding ? INK : '#FFF', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          {adding ? 'Cancel' : 'Add stockist'}
        </button>
      }
    >
      {adding && (
        <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF', padding: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <div>
              {field('Name', 'name', { placeholder: 'IGC' })}
              {field('Invoice code', 'invoice_code', {
                placeholder: 'IGC',
                hint: 'Goes into every invoice number — VI02IGC0226. Cannot be changed later.',
              })}
              {field('VES margin', 'margin_rate', {
                placeholder: '0.5',
                hint: 'Share of the GST-exclusive amount. IGC is 0.5.',
              })}
              {field('Contact email', 'contact_email')}
            </div>
            <div>
              {field('Bill to', 'bill_to_name', { placeholder: "IGC'X Pte Ltd" })}
              {field('Address line 1', 'bill_to_address_line1')}
              {field('Address line 2', 'bill_to_address_line2')}
              {field('Invoice line', 'invoice_line_description', {
                placeholder: 'Consignment - IGC x Ves Charms',
                hint: 'Blank uses "Consignment - <name>".',
              })}
            </div>
          </div>
          <button
            onClick={createStockist}
            disabled={saving}
            style={{ fontSize: '10px', fontWeight: 700, padding: '8px 18px', backgroundColor: TC, color: '#FFF', border: 'none', cursor: saving ? 'default' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : 'Create'}
          </button>
        </div>
      )}

      <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF' }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, backgroundColor: ALT, padding: '8px 16px' }}>
          {['Stockist', 'Margin', 'Invoices', 'Billed', 'Outstanding'].map((h, i) => (
            <span key={h} style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: i === 0 ? 'left' : 'right' }}>
              {h}
            </span>
          ))}
        </div>

        {loading && <div style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>Loading…</div>}

        {!loading && stockists.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>
            No stockists yet.
          </div>
        )}

        {stockists.map(s => (
          <div
            key={s.id}
            onClick={() => navigate(`/admin/stockists/${s.id}`)}
            style={{ display: 'grid', gridTemplateColumns: GRID, padding: '10px 16px', borderTop: `1px solid ${RULE}`, alignItems: 'center', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = TC_LIGHT}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFF'}
          >
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: TC_DARK, textDecoration: 'underline' }}>{s.name}</span>
              {!s.is_active && (
                <span style={{ fontSize: '9px', fontWeight: 700, marginLeft: '8px', padding: '2px 6px', backgroundColor: ALT, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Inactive
                </span>
              )}
              <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px' }}>{s.invoice_code}</div>
            </div>
            <span style={{ fontSize: '12px', textAlign: 'right', color: s.margin_rate == null ? MUTED : INK }}>{pct(s.margin_rate)}</span>
            <span style={{ fontSize: '12px', textAlign: 'right', color: MUTED }}>{s.invoice_count}</span>
            <span style={{ fontSize: '13px', textAlign: 'right' }}>{money(s.billed_total)}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right', color: Number(s.outstanding_total) > 0 ? '#D93025' : MUTED }}>
              {money(s.outstanding_total)}
            </span>
          </div>
        ))}
      </div>
    </AdminPage>
  );
}
