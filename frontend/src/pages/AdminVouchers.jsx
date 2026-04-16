import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const TC = '#C4622D', TC_DARK = '#9E4A1E', TC_LIGHT = '#F9EDE6';
const INK = '#282828', MUTED = '#888888', RULE = '#E5E2DD', ALT = '#F5F3F0';

export default function AdminVouchers() {
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ purchaser_name: '', purchaser_email: '', shopify_order_name: '', product_title: 'Pottery Course Voucher', amount: '', notes: ''});
  const [assigningId, setAssigningId] = useState(null);
  const [assignForm, setAssignForm] = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadVouchers(); }, []);

  const loadVouchers = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/vouchers');
      setVouchers(data.vouchers || data || []);
    } catch (err) {
      console.error('Failed to load vouchers:', err);
    } finally {
      setLoading(false);
    }
  };

  const createVoucher = async () => {
    try {
      setSaving(true);
      await api.post('/admin/vouchers', {
        ...addForm,
        amount: addForm.amount ? Number(addForm.amount) : null,
      });
      setShowAddForm(false);
      setAddForm({ purchaser_name: '', purchaser_email: '', shopify_order_name: '', product_title: 'Pottery Course Voucher', amount: '', notes: ''});
      await loadVouchers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create voucher');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/admin/vouchers/${id}`, { status });
      await loadVouchers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update voucher');
    }
  };

  const assignRecipient = async (id) => {
    try {
      setSaving(true);
      await api.post(`/admin/vouchers/${id}/assign-recipient`, assignForm);
      setAssigningId(null);
      setAssignForm({ first_name: '', last_name: '', email: '', phone: '' });
      await loadVouchers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to assign recipient');
    } finally {
      setSaving(false);
    }
  };

  const filtered = filter === 'all' ? vouchers : vouchers.filter(v => v.status === filter);
  const pendingCount = vouchers.filter(v => v.status === 'pending').length;
  const redeemedCount = vouchers.filter(v => v.status === 'redeemed').length;

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const statusBadge = (status) => {
    const styles = {
      pending: { backgroundColor: '#FFF8E1', color: '#F57F17' },
      redeemed: { backgroundColor: '#E8F5E9', color: '#2E7D32' },
      cancelled: { backgroundColor: '#F5F5F5', color: '#9E9E9E' },
    };
    const s = styles[status] || styles.pending;
    return (
      <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.04em', ...s }}>
        {status}
      </span>
    );
  };

  const inputStyle = { fontSize: '13px', fontFamily: 'Atak, sans-serif', padding: '6px 10px', border: `1px solid ${RULE}`, color: INK, width: '100%', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '4px', display: 'block' };
  const btnPrimary = { fontSize: '11px', fontWeight: 700, padding: '6px 16px', backgroundColor: TC, color: '#FFF', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' };
  const btnSecondary = { fontSize: '11px', fontWeight: 700, padding: '6px 16px', backgroundColor: ALT, color: MUTED, border: `1px solid ${RULE}`, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' };

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px 60px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>Admin</div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Vouchers</h1>
          <p style={{ fontSize: '13px', color: MUTED, marginTop: '4px' }}>
            {pendingCount} pending &middot; {redeemedCount} redeemed
          </p>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '20px', borderBottom: `1px solid ${RULE}` }}>
          {[
            { key: 'pending', label: `Pending (${vouchers.filter(v => v.status === 'pending').length})` },
            { key: 'redeemed', label: `Redeemed (${vouchers.filter(v => v.status === 'redeemed').length})` },
            { key: 'cancelled', label: `Cancelled (${vouchers.filter(v => v.status === 'cancelled').length})` },
            { key: 'all', label: `All (${vouchers.length})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                padding: '8px 16px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                border: 'none', borderBottom: filter === tab.key ? `2px solid ${TC}` : '2px solid transparent',
                backgroundColor: 'transparent', color: filter === tab.key ? TC_DARK : MUTED,
                cursor: 'pointer', textTransform: 'uppercase',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Add Voucher button */}
        {!showAddForm && (
          <div style={{ marginBottom: '16px' }}>
            <button onClick={() => setShowAddForm(true)} style={btnPrimary}>+ Add Voucher</button>
          </div>
        )}

        {/* Add Voucher inline form */}
        {showAddForm && (
          <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF', padding: '20px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TC_DARK, marginBottom: '16px' }}>New Voucher</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>Purchaser Name</label>
                <input style={inputStyle} value={addForm.purchaser_name} onChange={e => setAddForm({ ...addForm, purchaser_name: e.target.value })} placeholder="Full name" />
              </div>
              <div>
                <label style={labelStyle}>Purchaser Email</label>
                <input style={inputStyle} value={addForm.purchaser_email} onChange={e => setAddForm({ ...addForm, purchaser_email: e.target.value })} placeholder="email@example.com" />
              </div>
              <div>
                <label style={labelStyle}>Shopify Order # (optional)</label>
                <input style={inputStyle} value={addForm.shopify_order_name} onChange={e => setAddForm({ ...addForm, shopify_order_number: e.target.value })} placeholder="#1234" />
              </div>
              <div>
                <label style={labelStyle}>Product / Course</label>
                <input style={inputStyle} value={addForm.product_title} onChange={e => setAddForm({ ...addForm, product_title: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Amount (optional)</label>
                <input style={inputStyle} type="number" value={addForm.amount} onChange={e => setAddForm({ ...addForm, amount: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={addForm.notes} onChange={e => setAddForm({ ...addForm, notes: e.target.value })} placeholder="Any additional notes..." />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={createVoucher} disabled={saving || !addForm.purchaser_name || !addForm.purchaser_email} style={{ ...btnPrimary, opacity: saving || !addForm.purchaser_name || !addForm.purchaser_email ? 0.5 : 1 }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => { setShowAddForm(false); setAddForm({ purchaser_name: '', purchaser_email: '', shopify_order_name: '', product_title: 'Pottery Course Voucher', amount: '', notes: ''}); }} style={btnSecondary}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Voucher list */}
        {loading && <div style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>Loading...</div>}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>No vouchers found.</div>
        )}

        {!loading && filtered.map(v => (
          <div key={v.id} style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF', padding: '16px', marginBottom: '8px' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = TC_LIGHT}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFF'}
          >
            {/* Top row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: INK }}>{v.product_title || 'Pottery Course Voucher'}{v.variant_title ? ` — ${v.variant_title}` : ''}</div>
                <div style={{ fontSize: '12px', color: MUTED, marginTop: '2px' }}>
                  Purchased by <span style={{ fontWeight: 600, color: TC_DARK }}>{v.purchaser_name || '—'}</span>
                  {v.purchaser_email && <span> ({v.purchaser_email})</span>}
                  {v.shopify_order_name && <span> &middot; Order {v.shopify_order_name}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {statusBadge(v.status)}
                <span style={{ fontSize: '11px', color: MUTED }}>{fmtDate(v.created_at)}</span>
              </div>
            </div>

            {/* Amount + Notes */}
            {v.amount && <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>${v.amount}</div>}
            {v.notes && <div style={{ fontSize: '11px', color: MUTED, marginBottom: '8px' }}>{v.notes}</div>}

            {/* Recipient section */}
            <div style={{ borderTop: `1px solid ${RULE}`, paddingTop: '8px', marginTop: '4px' }}>
              {v.recipient_name || v.recipient_email ? (
                <div style={{ fontSize: '12px', color: INK }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginRight: '8px' }}>Recipient</span>
                  <span style={{ fontWeight: 600 }}>{v.recipient_name || '—'}</span>
                  {v.recipient_email && <span style={{ color: MUTED }}> ({v.recipient_email})</span>}
                  {v.recipient_phone && <span style={{ color: MUTED }}> &middot; {v.recipient_phone}</span>}
                </div>
              ) : (
                assigningId === v.id ? (
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TC_DARK, marginBottom: '8px' }}>Assign Recipient</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <div>
                        <label style={labelStyle}>First Name</label>
                        <input style={inputStyle} value={assignForm.first_name} onChange={e => setAssignForm({ ...assignForm, first_name: e.target.value })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Last Name</label>
                        <input style={inputStyle} value={assignForm.last_name} onChange={e => setAssignForm({ ...assignForm, last_name: e.target.value })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Email</label>
                        <input style={inputStyle} value={assignForm.email} onChange={e => setAssignForm({ ...assignForm, email: e.target.value })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Phone</label>
                        <input style={inputStyle} value={assignForm.phone} onChange={e => setAssignForm({ ...assignForm, phone: e.target.value })} />
                      </div>
                    </div>
                    <div style={{ fontSize: '10px', color: MUTED, marginBottom: '8px', fontStyle: 'italic' }}>This will create a new customer account if one doesn't exist.</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => assignRecipient(v.id)} disabled={saving || !assignForm.first_name || !assignForm.email} style={{ ...btnPrimary, fontSize: '9px', padding: '4px 12px', opacity: saving || !assignForm.first_name || !assignForm.email ? 0.5 : 1 }}>
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => { setAssigningId(null); setAssignForm({ first_name: '', last_name: '', email: '', phone: '' }); }} style={{ ...btnSecondary, fontSize: '9px', padding: '4px 12px' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setAssigningId(v.id); setAssignForm({ first_name: '', last_name: '', email: '', phone: '' }); }} style={{ fontSize: '10px', fontWeight: 700, padding: '4px 10px', backgroundColor: TC_LIGHT, color: TC_DARK, border: `1px solid ${TC}`, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Assign Recipient
                  </button>
                )
              )}
            </div>

            {/* Status actions */}
            {v.status === 'pending' && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                <button onClick={() => updateStatus(v.id, 'redeemed')} style={{ fontSize: '9px', fontWeight: 700, padding: '3px 8px', backgroundColor: '#E8F5E9', color: '#2E7D32', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Mark Redeemed
                </button>
                <button onClick={() => updateStatus(v.id, 'cancelled')} style={{ fontSize: '9px', fontWeight: 700, padding: '3px 8px', backgroundColor: '#F5F5F5', color: '#9E9E9E', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Cancel
                </button>
              </div>
            )}
            {v.status === 'redeemed' && v.redeemed_at && (
              <div style={{ fontSize: '10px', color: MUTED, marginTop: '8px' }}>Redeemed on {fmtDate(v.redeemed_at)}</div>
            )}
            {v.status === 'cancelled' && (
              <div style={{ marginTop: '10px' }}>
                <button onClick={() => updateStatus(v.id, 'pending')} style={{ fontSize: '9px', fontWeight: 700, padding: '3px 8px', backgroundColor: '#FFF8E1', color: '#F57F17', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Reactivate
                </button>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
