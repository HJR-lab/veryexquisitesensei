import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const TC = '#C4622D', TC_DARK = '#9E4A1E', TC_LIGHT = '#F9EDE6';
const INK = '#282828', MUTED = '#888888', RULE = '#E5E2DD', ALT = '#F5F3F0';

export default function AdminFees() {
  const navigate = useNavigate();
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // pending | paid | waived | all

  useEffect(() => { loadFees(); }, []);

  const loadFees = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/fees');
      setFees(data.fees || []);
    } catch (err) {
      console.error('Failed to load fees:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateFee = async (feeId, payment_status) => {
    try {
      await api.put(`/admin/fees/${feeId}`, { payment_status });
      await loadFees();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update fee');
    }
  };

  const filtered = filter === 'all' ? fees : fees.filter(f => f.payment_status === filter);
  const pendingCount = fees.filter(f => f.payment_status === 'pending').length;
  const totalOwing = fees.filter(f => f.payment_status === 'pending').reduce((sum, f) => sum + (f.amount || 0), 0);

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px 60px' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>Admin</div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Fees</h1>
          <p style={{ fontSize: '13px', color: MUTED, marginTop: '4px' }}>
            {pendingCount} student{pendingCount !== 1 ? 's' : ''} with fees owing &middot; ${totalOwing} total
          </p>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '20px', borderBottom: `1px solid ${RULE}` }}>
          {[
            { key: 'pending', label: `Pending (${fees.filter(f => f.payment_status === 'pending').length})` },
            { key: 'paid', label: `Paid (${fees.filter(f => f.payment_status === 'paid').length})` },
            { key: 'waived', label: `Waived (${fees.filter(f => f.payment_status === 'waived').length})` },
            { key: 'all', label: `All (${fees.length})` },
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

        {/* Table */}
        <div style={{ border: `1px solid ${RULE}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 120px 120px', backgroundColor: ALT, padding: '8px 16px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Student</span>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Type</span>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'right' }}>Amount</span>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'center' }}>Date</span>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'center' }}>Status</span>
          </div>

          {loading && <div style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>Loading...</div>}

          {!loading && filtered.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>No fees found.</div>
          )}

          {filtered.map(fee => {
            const name = fee.customers ? `${fee.customers.first_name} ${fee.customers.last_name}` : 'Unknown';
            const email = fee.customers?.email;
            const isPending = fee.payment_status === 'pending';
            return (
              <div
                key={fee.id}
                style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 120px 120px', padding: '10px 16px', borderTop: `1px solid ${RULE}`, alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = TC_LIGHT}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFF'}
              >
                <div>
                  <span
                    onClick={() => email && navigate(`/admin/students/${encodeURIComponent(email)}`)}
                    style={{ fontSize: '13px', fontWeight: 600, color: TC_DARK, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {name}
                  </span>
                  {fee.notes && <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px' }}>{fee.notes}</div>}
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'capitalize' }}>{fee.fee_type}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right', color: isPending ? '#D93025' : INK }}>${fee.amount}</span>
                <span style={{ fontSize: '11px', color: MUTED, textAlign: 'center' }}>{fmtDate(fee.fee_date || fee.created_at)}</span>
                <div style={{ textAlign: 'center' }}>
                  {isPending ? (
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      <button
                        onClick={() => updateFee(fee.id, 'paid')}
                        style={{ fontSize: '9px', fontWeight: 700, padding: '3px 8px', backgroundColor: '#E8F5E9', color: '#2E7D32', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                      >
                        Paid
                      </button>
                      <button
                        onClick={() => updateFee(fee.id, 'waived')}
                        style={{ fontSize: '9px', fontWeight: 700, padding: '3px 8px', backgroundColor: '#FFF3E0', color: '#E65100', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                      >
                        Waive
                      </button>
                    </div>
                  ) : (
                    <span style={{
                      fontSize: '9px', fontWeight: 700, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.04em',
                      backgroundColor: fee.payment_status === 'paid' ? '#E8F5E9' : '#FFF3E0',
                      color: fee.payment_status === 'paid' ? '#2E7D32' : '#E65100',
                    }}>
                      {fee.payment_status}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
