import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';

const REDEMPTIONS = [
  { label: 'Studio Access (1 hr)', amount: 20, desc: 'Studio access — 1 hr' },
  { label: 'Studio Access (2 hrs)', amount: 40, desc: 'Studio access — 2 hrs' },
  { label: 'Fire Additional Piece', amount: 20, desc: 'Fire additional piece' },
  { label: 'Delivery — Self', amount: 10, desc: 'Delivery — self collection' },
  { label: 'Delivery — Gift', amount: 10, desc: 'Delivery — gift' },
  { label: 'Other', amount: null, desc: '' },
];

export default function AdminCredits() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [log, setLog] = useState([]);
  const [tab, setTab] = useState('students'); // 'students' | 'log'
  const [search, setSearch] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Inline earned edit state
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Adjust modal state
  const [adjustStudent, setAdjustStudent] = useState(null);
  const [adjustType, setAdjustType] = useState('spend');
  const [adjustRedemption, setAdjustRedemption] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDesc, setAdjustDesc] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState('');

  useEffect(() => {
    loadData();
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/credits/overview');
      setStudents(data.students || []);
      setLog(data.log || []);
    } catch (err) {
      console.error('Failed to load credits:', err);
    } finally {
      setLoading(false);
    }
  };

  const startEditEarned = (student, e) => {
    e.stopPropagation();
    setEditingId(student.customerId);
    setEditValue(String(student.earned));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const saveEarned = async (student, e) => {
    e.stopPropagation();
    const newEarned = parseFloat(editValue);
    if (isNaN(newEarned) || newEarned < 0) { cancelEdit(); return; }
    if (newEarned === student.earned) { cancelEdit(); return; }

    setEditSaving(true);
    try {
      await api.post('/admin/credits/set-earned', {
        customerId: student.customerId,
        amount: newEarned,
      });
      cancelEdit();
      loadData();
    } catch (err) {
      console.error('Failed to set earned:', err);
    } finally {
      setEditSaving(false);
    }
  };

  const openAdjust = (student, e) => {
    e.stopPropagation();
    setAdjustStudent(student);
    setAdjustType('spend');
    setAdjustRedemption('');
    setAdjustAmount('');
    setAdjustDesc('');
    setAdjustError('');
  };

  const handleRedemptionChange = (val) => {
    setAdjustRedemption(val);
    const r = REDEMPTIONS.find(r => r.label === val);
    if (r && r.amount != null) {
      setAdjustAmount(String(r.amount));
      setAdjustDesc(r.desc);
    } else {
      setAdjustAmount('');
      setAdjustDesc('');
    }
  };

  const submitAdjust = async () => {
    const amt = parseFloat(adjustAmount);
    if (!amt || amt <= 0) { setAdjustError('Enter a valid amount'); return; }
    if (!adjustDesc.trim()) { setAdjustError('Enter a description'); return; }
    setAdjustSubmitting(true);
    setAdjustError('');
    try {
      await api.post('/credits/adjust', {
        customerId: adjustStudent.customerId,
        amount: amt,
        type: adjustType,
        description: adjustDesc.trim(),
      });
      setAdjustStudent(null);
      loadData();
    } catch (err) {
      setAdjustError(err.response?.data?.error || 'Failed to adjust credits');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const q = search.toLowerCase();
  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
  );
  const filteredLog = log.filter(l =>
    l.name.toLowerCase().includes(q) || (l.description || '').toLowerCase().includes(q)
  );

  const totalBalance = students.reduce((s, r) => s + r.balance, 0);
  const totalEarned = students.reduce((s, r) => s + r.earned, 0);
  const totalSpent = students.reduce((s, r) => s + r.spent, 0);

  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const fmtTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '960px', margin: '0 auto', padding: isMobile ? '20px 16px 60px' : '32px 24px 60px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => navigate('/admin')}
            style={{ background: 'none', border: 'none', color: TC, fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>arrow_back</span>
            Dashboard
          </button>
          <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>
            Credits
          </h1>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}`, marginBottom: '24px' }}>
          {[
            { label: 'Total Earned', value: `$${totalEarned}`, color: '#059669' },
            { label: 'Total Spent', value: `$${totalSpent}`, color: INK },
            { label: 'Outstanding', value: `$${totalBalance}`, color: TC },
          ].map((c) => (
            <div key={c.label} style={{ backgroundColor: '#fff', padding: '18px 20px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '6px' }}>{c.label}</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: c.color, letterSpacing: '-0.5px' }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs + search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '0' }}>
            {['students', 'log'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '8px 20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  border: `1px solid ${RULE}`,
                  borderRight: t === 'students' ? 'none' : `1px solid ${RULE}`,
                  backgroundColor: tab === t ? TC_LIGHT : '#fff',
                  color: tab === t ? TC : MUTED,
                  cursor: 'pointer',
                }}
              >
                {t === 'students' ? 'By Student' : 'Transaction Log'}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: '13px',
              border: `1px solid ${RULE}`,
              backgroundColor: '#fff',
              outline: 'none',
              width: isMobile ? '100%' : '220px',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
        ) : tab === 'students' ? (
          /* Student breakdown table */
          <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#fff', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${RULE}` }}>
                  {['Student', 'Earned', 'Spent', 'Balance', ''].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Student' || h === '' ? 'left' : 'right', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: MUTED }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: MUTED }}>No students with credits</td></tr>
                ) : filteredStudents.map(s => (
                  <tr
                    key={s.customerId}
                    style={{ borderBottom: `1px solid ${RULE}`, cursor: 'pointer' }}
                    onClick={() => navigate(`/admin/students/${encodeURIComponent(s.email)}`)}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: MUTED }}>{s.email}</div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#059669', fontWeight: 600 }} onClick={e => e.stopPropagation()}>
                      {editingId === s.customerId ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '13px' }}>$</span>
                          <input
                            autoFocus
                            type="number"
                            min="0"
                            step="1"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEarned(s, e); if (e.key === 'Escape') cancelEdit(); }}
                            disabled={editSaving}
                            style={{ width: '64px', padding: '4px 6px', fontSize: '13px', fontWeight: 600, textAlign: 'right', border: `1px solid ${TC}`, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                          />
                          <button onClick={e => saveEarned(s, e)} disabled={editSaving} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#059669', display: 'flex' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check</span>
                          </button>
                          <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: MUTED, display: 'flex' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                          </button>
                        </span>
                      ) : (
                        <span
                          onClick={e => startEditEarned(s, e)}
                          title="Click to set correct amount"
                          style={{ cursor: 'pointer', borderBottom: `1px dashed #059669`, paddingBottom: '1px' }}
                        >
                          ${s.earned}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: INK }}>${s.spent}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: s.balance > 0 ? TC : MUTED }}>${s.balance}</td>
                    <td style={{ padding: '12px 8px 12px 0', textAlign: 'right' }}>
                      <button
                        onClick={(e) => openAdjust(s, e)}
                        style={{
                          background: 'none', border: `1px solid ${RULE}`, padding: '5px 12px',
                          fontSize: '11px', fontWeight: 600, color: TC, cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Transaction log */
          <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#fff' }}>
            {filteredLog.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No transactions</div>
            ) : filteredLog.map((tx, i) => (
              <div
                key={tx.id}
                style={{
                  padding: '12px 16px',
                  borderBottom: i < filteredLog.length - 1 ? `1px solid ${RULE}` : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '16px', color: tx.type === 'earn' ? '#059669' : '#DC2626', flexShrink: 0 }}
                >
                  {tx.type === 'earn' ? 'add_circle' : 'remove_circle'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{tx.name}</span>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: tx.type === 'earn' ? '#059669' : '#DC2626',
                    }}>
                      {tx.type === 'earn' ? '+' : '-'}${tx.amount}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: MUTED }}>
                    {tx.description || tx.source || 'Credit transaction'}
                    <span style={{ marginLeft: '8px' }}>{fmtDate(tx.createdAt)} {fmtTime(tx.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Adjust modal */}
        {adjustStudent && (
          <div
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
            onClick={() => setAdjustStudent(null)}
          >
            <div
              style={{ backgroundColor: '#fff', width: '100%', maxWidth: '420px', padding: '28px 24px', position: 'relative' }}
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setAdjustStudent(null)} style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '18px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>

              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC, marginBottom: '4px' }}>Adjust Credits</div>
              <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{adjustStudent.name}</div>
              <div style={{ fontSize: '12px', color: MUTED, marginBottom: '20px' }}>Current balance: <b style={{ color: TC }}>${adjustStudent.balance}</b></div>

              {/* Type toggle */}
              <div style={{ display: 'flex', gap: 0, marginBottom: '16px' }}>
                {['spend', 'earn'].map(t => (
                  <button
                    key={t}
                    onClick={() => setAdjustType(t)}
                    style={{
                      flex: 1, padding: '8px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.06em', border: `1px solid ${RULE}`, cursor: 'pointer',
                      backgroundColor: adjustType === t ? (t === 'spend' ? '#FEE2E2' : '#D1FAE5') : '#fff',
                      color: adjustType === t ? (t === 'spend' ? '#DC2626' : '#059669') : MUTED,
                      borderRight: t === 'spend' ? 'none' : `1px solid ${RULE}`,
                    }}
                  >
                    {t === 'spend' ? 'Redeem / Spend' : 'Add / Earn'}
                  </button>
                ))}
              </div>

              {/* Redemption dropdown (only for spend) */}
              {adjustType === 'spend' && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, display: 'block', marginBottom: '4px' }}>Redemption Type</label>
                  <select
                    value={adjustRedemption}
                    onChange={e => handleRedemptionChange(e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', fontSize: '13px', border: `1px solid ${RULE}`, backgroundColor: '#fff', fontFamily: 'inherit', outline: 'none' }}
                  >
                    <option value="">Select...</option>
                    {REDEMPTIONS.map(r => (
                      <option key={r.label} value={r.label}>{r.label}{r.amount != null ? ` — $${r.amount}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Amount */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, display: 'block', marginBottom: '4px' }}>Amount ($)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', padding: '9px 10px', fontSize: '13px', border: `1px solid ${RULE}`, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, display: 'block', marginBottom: '4px' }}>Description</label>
                <input
                  type="text"
                  value={adjustDesc}
                  onChange={e => setAdjustDesc(e.target.value)}
                  placeholder={adjustType === 'spend' ? 'e.g. Studio access — 2 Apr' : 'e.g. Loyalty bonus'}
                  style={{ width: '100%', padding: '9px 10px', fontSize: '13px', border: `1px solid ${RULE}`, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {adjustError && <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '12px' }}>{adjustError}</div>}

              <button
                onClick={submitAdjust}
                disabled={adjustSubmitting}
                style={{
                  width: '100%', padding: '11px', fontSize: '13px', fontWeight: 700,
                  backgroundColor: adjustType === 'spend' ? '#DC2626' : '#059669',
                  color: '#fff', border: 'none', cursor: adjustSubmitting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', opacity: adjustSubmitting ? 0.6 : 1,
                }}
              >
                {adjustSubmitting ? 'Saving...' : adjustType === 'spend' ? `Spend $${adjustAmount || '0'}` : `Add $${adjustAmount || '0'}`}
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
