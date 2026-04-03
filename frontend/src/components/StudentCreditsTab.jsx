import { useState } from 'react';
import api from '../utils/api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';

function formatDate(dateString) {
  if (!dateString) return '—';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function StudentCreditsTab({ studentId, balance, history, onRefresh }) {
  const [showForm, setShowForm]   = useState(false);
  const [type, setType]           = useState('add');
  const [amount, setAmount]       = useState('');
  const [note, setNote]           = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);
  const [success, setSuccess]     = useState(null);

  // Inline balance edit
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceValue, setBalanceValue]     = useState('');
  const [balanceSaving, setBalanceSaving]   = useState(false);

  const handleAdjust = async () => {
    if (!note.trim()) {
      setError('Note is required.');
      return;
    }
    const parsed = parseInt(amount, 10);
    if (!parsed || parsed <= 0) {
      setError('Enter a valid positive amount.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.post('/credits/adjust', {
        customerId:  studentId,
        type,
        amount:      parsed,
        description: note.trim(),
      });
      setSuccess('Credits adjusted.');
      setAmount('');
      setNote('');
      setShowForm(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to adjust credits.');
    } finally {
      setSaving(false);
    }
  };

  const startEditBalance = () => {
    setEditingBalance(true);
    setBalanceValue(String(balance ?? 0));
  };

  const saveBalance = async () => {
    const val = parseFloat(balanceValue);
    if (isNaN(val) || val < 0) { setEditingBalance(false); return; }
    if (val === (balance ?? 0)) { setEditingBalance(false); return; }
    setBalanceSaving(true);
    try {
      await api.post('/admin/credits/set-earned', {
        customerId: studentId,
        amount: val,
      });
      setEditingBalance(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to set credits:', err);
    } finally {
      setBalanceSaving(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>

      {/* ── Balance header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px', borderBottom: `1px solid ${RULE}`, backgroundColor: '#FAFAFA',
      }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '4px' }}>
            Credit Balance
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            {editingBalance ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '36px', fontWeight: 700, color: TC, lineHeight: 1 }}>$</span>
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step="1"
                  value={balanceValue}
                  onChange={e => setBalanceValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveBalance(); if (e.key === 'Escape') setEditingBalance(false); }}
                  disabled={balanceSaving}
                  style={{ width: '100px', padding: '4px 8px', fontSize: '28px', fontWeight: 700, color: TC, border: `2px solid ${TC}`, borderRadius: '4px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
                <button onClick={saveBalance} disabled={balanceSaving} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#059669', display: 'flex' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>check</span>
                </button>
                <button onClick={() => setEditingBalance(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: MUTED, display: 'flex' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
                </button>
              </span>
            ) : (
              <span
                onClick={startEditBalance}
                title="Click to set credit amount"
                style={{ fontSize: '36px', fontWeight: 700, color: TC, lineHeight: 1, cursor: 'pointer', borderBottom: `2px dashed ${TC}`, paddingBottom: '2px' }}
              >
                ${balance ?? 0}
              </span>
            )}
            <span style={{ fontSize: '13px', color: MUTED }}>credits</span>
          </div>
          <div style={{ fontSize: '12px', color: MUTED, marginTop: '4px' }}>
            Expires 31 Dec 2026
          </div>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setError(null); setSuccess(null); }}
          style={{
            padding: '9px 18px', border: `1px solid ${TC}`, borderRadius: '4px',
            background: showForm ? TC : 'transparent', color: showForm ? '#fff' : TC,
            fontSize: '12px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em',
            transition: 'all 0.15s',
          }}
        >
          {showForm ? 'Cancel' : 'Adjust Credits'}
        </button>
      </div>

      {/* ── Adjust form ── */}
      {showForm && (
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${RULE}`, backgroundColor: TC_LIGHT }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {/* Type */}
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '5px' }}>
                Type
              </label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                style={{ padding: '8px 10px', border: `1px solid ${RULE}`, borderRadius: '3px', fontSize: '13px', color: INK, background: '#fff', cursor: 'pointer' }}
              >
                <option value="add">Add</option>
                <option value="deduct">Deduct</option>
              </select>
            </div>

            {/* Amount */}
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '5px' }}>
                Amount
              </label>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                style={{ width: '80px', padding: '8px 10px', border: `1px solid ${RULE}`, borderRadius: '3px', fontSize: '13px', color: INK }}
              />
            </div>

            {/* Note */}
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '5px' }}>
                Note <span style={{ color: TC }}>*</span>
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Reason for adjustment"
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${RULE}`, borderRadius: '3px', fontSize: '13px', color: INK, boxSizing: 'border-box' }}
              />
            </div>

            {/* Save */}
            <button
              onClick={handleAdjust}
              disabled={saving}
              style={{
                padding: '9px 20px', border: 'none', borderRadius: '3px',
                background: TC, color: '#fff', fontSize: '12px', fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                letterSpacing: '0.05em', whiteSpace: 'nowrap',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {error   && <div style={{ marginTop: '10px', fontSize: '12px', color: '#C03030' }}>{error}</div>}
          {success && <div style={{ marginTop: '10px', fontSize: '12px', color: TC_DARK }}>{success}</div>}
        </div>
      )}

      {/* ── Transaction history ── */}
      <div>
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1.2fr 2fr 1.2fr 0.6fr',
          gap: '8px', padding: '10px 24px', borderBottom: `1px solid ${RULE}`,
          backgroundColor: '#FAFAFA',
        }}>
          {['Date', 'Description', 'Source', 'Amount'].map(h => (
            <span key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>
              {h}
            </span>
          ))}
        </div>

        {/* Rows */}
        {!history || history.length === 0 ? (
          <div style={{ padding: '36px 24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
            No credit transactions yet
          </div>
        ) : (
          history.map((tx, i) => {
            const isEarn    = tx.transaction_type === 'earn' || tx.amount > 0;
            const amountNum = tx.amount ?? 0;
            const sign      = amountNum >= 0 ? '+' : '';
            const amtColor  = isEarn ? '#2E7D32' : '#C03030';
            return (
              <div
                key={tx.id ?? i}
                style={{
                  display: 'grid', gridTemplateColumns: '1.2fr 2fr 1.2fr 0.6fr',
                  gap: '8px', padding: '12px 24px',
                  borderBottom: i < history.length - 1 ? `1px solid ${RULE}` : 'none',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '12px', color: MUTED }}>
                  {formatDate(tx.created_at)}
                </span>
                <span style={{ fontSize: '13px', color: INK }}>
                  {tx.description || tx.notes || '—'}
                </span>
                <span style={{ fontSize: '12px', color: MUTED, textTransform: 'capitalize' }}>
                  {tx.source || tx.transaction_type || '—'}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: amtColor }}>
                  {sign}{amountNum}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
