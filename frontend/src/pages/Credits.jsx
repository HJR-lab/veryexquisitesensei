import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import ImpersonationBanner from '../components/ImpersonationBanner';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';

// ─── Date helper ──────────────────────────────────────────────────────────────
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Delivery form (self) ─────────────────────────────────────────────────────
function DeliveryForm({ customerId, balance, onSuccess }) {
  const [address, setAddress] = useState('');
  const [pieces, setPieces]   = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  const canSubmit = address.trim() && pieces >= 1 && balance >= 10 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await api.post('/credits/delivery', {
        customerId,
        deliveryType: 'self',
        recipientAddress: address.trim(),
        pieces,
      });
      setSuccess(`Order placed! $${data.creditApplied} credit applied.`);
      setAddress('');
      setPieces(1);
      onSuccess();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: '16px', backgroundColor: TC_LIGHT, borderTop: `1px solid ${RULE}` }}>
      {success && (
        <div style={{ padding: '8px 12px', backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: '12px', fontWeight: 600, marginBottom: '12px', borderRadius: '4px' }}>
          {success}
        </div>
      )}
      <label style={labelStyle}>Delivery address</label>
      <input
        value={address}
        onChange={e => setAddress(e.target.value)}
        placeholder="e.g. 123 Main St, Singapore 123456"
        style={inputStyle}
      />
      <label style={labelStyle}>Number of pieces</label>
      <input
        type="number"
        min="1"
        value={pieces}
        onChange={e => setPieces(Math.max(1, parseInt(e.target.value) || 1))}
        style={{ ...inputStyle, width: '80px' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: INK }}>Total: $10</div>
        <button onClick={handleSubmit} disabled={!canSubmit} style={btnStyle(canSubmit)}>
          {submitting ? 'Placing order...' : balance < 10 ? 'Insufficient credits' : 'Pay with Ves Credits'}
        </button>
      </div>
    </div>
  );
}

// ─── Gift form ────────────────────────────────────────────────────────────────
function GiftForm({ customerId, balance, onSuccess }) {
  const [name, setName]       = useState('');
  const [phone, setPhone]     = useState('');
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [pieces, setPieces]   = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  const canSubmit = name.trim() && phone.trim() && address.trim() && pieces >= 1 && balance >= 10 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await api.post('/credits/delivery', {
        customerId,
        deliveryType: 'gift',
        recipientName: name.trim(),
        recipientPhone: phone.trim(),
        recipientAddress: address.trim(),
        giftMessage: message.trim() || null,
        pieces,
      });
      setSuccess(`Gift order placed! $${data.creditApplied} credit applied.`);
      setName(''); setPhone(''); setAddress(''); setMessage(''); setPieces(1);
      onSuccess();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: '16px', backgroundColor: TC_LIGHT, borderTop: `1px solid ${RULE}` }}>
      {success && (
        <div style={{ padding: '8px 12px', backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: '12px', fontWeight: 600, marginBottom: '12px', borderRadius: '4px' }}>
          {success}
        </div>
      )}
      <label style={labelStyle}>Recipient name</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Their full name" style={inputStyle} />
      <label style={labelStyle}>Recipient phone</label>
      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 9123 4567" style={inputStyle} />
      <label style={labelStyle}>Delivery address</label>
      <input value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. 123 Main St, Singapore 123456" style={inputStyle} />
      <label style={labelStyle}>Gift message <span style={{ fontWeight: 400, color: MUTED }}>(optional)</span></label>
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Write a message to include..."
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
      />
      <label style={labelStyle}>Number of pieces</label>
      <input
        type="number"
        min="1"
        value={pieces}
        onChange={e => setPieces(Math.max(1, parseInt(e.target.value) || 1))}
        style={{ ...inputStyle, width: '80px' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: INK }}>Total: $10</div>
        <button onClick={handleSubmit} disabled={!canSubmit} style={btnStyle(canSubmit)}>
          {submitting ? 'Placing order...' : balance < 10 ? 'Insufficient credits' : 'Pay with Ves Credits'}
        </button>
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 600, color: TC_DARK, marginBottom: '4px', marginTop: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const inputStyle = { width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${RULE}`, borderRadius: '4px', boxSizing: 'border-box', outline: 'none', backgroundColor: '#FFFFFF' };
const btnStyle = (enabled) => ({
  padding: '10px 20px', fontSize: '12px', fontWeight: 700, border: 'none', borderRadius: '6px', cursor: enabled ? 'pointer' : 'default',
  backgroundColor: enabled ? TC : '#CCCCCC', color: enabled ? '#FFFFFF' : '#888888',
});

// ─── Service items config ─────────────────────────────────────────────────────
const SERVICES = [
  { id: 'studio',   title: 'Studio Access',                  desc: '$20/hr · min 2 hrs · full hours only', icon: 'door_open',            href: '/studio-access' },
  { id: 'firing',   title: 'Fire an Additional Piece',       desc: '$20/piece · logged by instructor',     icon: 'local_fire_department', info: true },
  { id: 'delivery', title: 'Delivery of Finished Work',      desc: '$10 per location',                     icon: 'local_shipping',        form: 'delivery' },
  { id: 'gift',     title: 'Send to a Friend or Loved One',  desc: '$10 per location',                     icon: 'card_giftcard',         form: 'gift' },
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function Credits() {
  const { user } = useAuth();

  const [balance, setBalance]     = useState(null);
  const [history, setHistory]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [expanded, setExpanded]   = useState(null); // 'delivery' | 'gift' | null

  const customerId = user?.dbCustomerId;

  const refreshData = useCallback(async () => {
    if (!customerId) return;
    try {
      const [balRes, histRes] = await Promise.all([
        api.get(`/credits/balance/${customerId}`),
        api.get(`/credits/history/${customerId}`),
      ]);
      setBalance(balRes.data?.balance ?? balRes.data ?? 0);
      setHistory(histRes.data?.history || histRes.data || []);
    } catch {}
  }, [customerId]);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [balRes, histRes] = await Promise.all([
          api.get(`/credits/balance/${customerId}`),
          api.get(`/credits/history/${customerId}`),
        ]);
        if (!cancelled) {
          setBalance(balRes.data?.balance ?? balRes.data ?? 0);
          setHistory(histRes.data?.history || histRes.data || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to load credits');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [customerId]);

  function handleFormSuccess() {
    setExpanded(null);
    refreshData();
  }

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>
      <ImpersonationBanner />

      {/* TopBar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}`,
      }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES"
            style={{ height: '26px', width: 'auto' }}
          />
        </div>
      </header>

      {/* Scrollable body */}
      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '20px 20px 100px' }}>

        {/* Ves is 10 banner */}
        <div style={{
          background: `linear-gradient(135deg, ${INK} 0%, #3D3D3D 100%)`,
          padding: '20px',
          marginBottom: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: '-8px', right: '16px', fontSize: '72px', fontWeight: 800, color: 'rgba(255,255,255,0.06)', lineHeight: 1 }}>10</div>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>
            New — Celebrating 10 Years
          </div>
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.3, marginBottom: '6px' }}>
            Ves is 10 Credits
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
            To celebrate 10 years of Ves, every returning student earns <span style={{ color: '#FFFFFF', fontWeight: 600 }}>$20 Ves Credits</span> with each new course. Use them for studio access, firing, delivery and more.
          </div>
        </div>

        {/* Page header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>Ves Credits</h1>
          <p style={{ fontSize: '12px', color: MUTED, margin: '4px 0 0' }}>Your Ves studio credit balance and history</p>
        </div>

        {/* Error state */}
        {error && (
          <div style={{
            padding: '12px 16px', backgroundColor: '#FFEBEE', color: '#C62828',
            fontSize: '12px', marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: MUTED, fontSize: '13px' }}>
            Loading...
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Balance card ─────────────────────────────────────────────── */}
            <div style={{
              backgroundColor: TC_LIGHT,
              border: `1px solid rgba(196,98,45,0.2)`,
              padding: '24px 20px',
              marginBottom: '16px',
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC_DARK, marginBottom: '8px' }}>
                Available Balance
              </div>
              <div style={{ fontSize: '48px', fontWeight: 700, color: TC, lineHeight: 1, marginBottom: '8px' }}>
                <span style={{ fontSize: '28px', fontWeight: 400, verticalAlign: 'top', marginRight: '2px' }}>$</span>{balance ?? 0}
                <span style={{ fontSize: '16px', fontWeight: 400, color: TC_DARK, marginLeft: '6px' }}>Ves Credits</span>
              </div>
              <div style={{ fontSize: '11px', color: TC_DARK, opacity: 0.7 }}>
                Expires 31 Dec 2026
              </div>
            </div>

            {/* ── How you earn ─────────────────────────────────────────── */}
            <div style={{
              border: `1px solid ${RULE}`,
              padding: '20px',
              marginBottom: '24px',
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '14px' }}>
                How you earn credits
              </div>

              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: TC_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px', color: TC }}>school</span>
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: INK, marginBottom: '2px' }}>$20 for every course you take</div>
                  <div style={{ fontSize: '12px', color: MUTED, lineHeight: 1.5 }}>
                    From your second course onwards, you automatically receive $20 in Ves Credits each time you sign up. Our way of saying thank you for being part of the Ves family.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: TC_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px', color: TC }}>auto_awesome</span>
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: INK, marginBottom: '2px' }}>Credits stack and never expire*</div>
                  <div style={{ fontSize: '12px', color: MUTED, lineHeight: 1.5 }}>
                    The more you create with us, the more you earn. Your credits accumulate across courses and can be used anytime.
                  </div>
                  <div style={{ fontSize: '10px', color: MUTED, marginTop: '6px', fontStyle: 'italic' }}>
                    *Valid through 31 Dec 2026 as part of our 10th anniversary programme.
                  </div>
                </div>
              </div>
            </div>

            {/* ── Use your credits ─────────────────────────────────────── */}
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '14px' }}>
                Use your credits
              </div>
              {SERVICES.map(({ id, title, desc, icon, href, info, form }, i) => {
                const isExpanded = expanded === form;
                const isClickable = href || form;
                const isFirst = i === 0;
                const isLast = i === SERVICES.length - 1 && !isExpanded;

                return (
                  <div key={id}>
                    {/* Service row */}
                    <div
                      onClick={() => {
                        if (href) { window.location.href = href; return; }
                        if (form) setExpanded(isExpanded ? null : form);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '14px',
                        padding: '14px 16px',
                        border: `1px solid ${RULE}`,
                        borderRadius: isFirst ? '8px 8px 0 0' : (isLast && !isExpanded) ? '0 0 8px 8px' : '0',
                        borderTop: i > 0 ? 'none' : undefined,
                        cursor: isClickable ? 'pointer' : 'default',
                        backgroundColor: isExpanded ? TC_LIGHT : '#FFFFFF',
                        transition: 'background-color 0.15s',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '22px', color: info ? MUTED : TC, fontVariationSettings: "'FILL' 0, 'wght' 400" }}>{icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: info ? MUTED : INK }}>{title}</div>
                        <div style={{ fontSize: '12px', color: MUTED, marginTop: '1px' }}>{desc}</div>
                      </div>
                      {href && <span className="material-symbols-outlined" style={{ fontSize: '18px', color: MUTED }}>chevron_right</span>}
                      {form && <span className="material-symbols-outlined" style={{ fontSize: '18px', color: TC, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>expand_more</span>}
                    </div>

                    {/* Expanded form */}
                    {isExpanded && form === 'delivery' && (
                      <div style={{ border: `1px solid ${RULE}`, borderTop: 'none', borderRadius: i === SERVICES.length - 1 ? '0 0 8px 8px' : '0', overflow: 'hidden' }}>
                        <DeliveryForm customerId={customerId} balance={balance} onSuccess={handleFormSuccess} />
                      </div>
                    )}
                    {isExpanded && form === 'gift' && (
                      <div style={{ border: `1px solid ${RULE}`, borderTop: 'none', borderRadius: i === SERVICES.length - 1 ? '0 0 8px 8px' : '0', overflow: 'hidden' }}>
                        <GiftForm customerId={customerId} balance={balance} onSuccess={handleFormSuccess} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Transaction history ──────────────────────────────────────── */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '14px' }}>
                Transaction History
              </div>

              {history.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
                  No transactions yet
                </div>
              ) : (
                history.map((tx, i) => {
                  const isEarn = tx.type === 'earn' || tx.amount > 0;
                  return (
                    <div
                      key={tx.id ?? i}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '12px 0',
                        borderBottom: i < history.length - 1 ? `1px solid ${RULE}` : 'none',
                      }}
                    >
                      {/* Date */}
                      <div style={{ width: '52px', flexShrink: 0 }}>
                        <div style={{ fontSize: '11px', color: MUTED, lineHeight: 1.4 }}>
                          {fmtDate(tx.created_at || tx.date)}
                        </div>
                      </div>

                      {/* Divider */}
                      <div style={{ width: '1px', height: '32px', backgroundColor: RULE, flexShrink: 0 }} />

                      {/* Description + balance */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: INK }}>{tx.description}</div>
                        {tx.balance_after != null && (
                          <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>
                            Balance: ${tx.balance_after}
                          </div>
                        )}
                      </div>

                      {/* Amount */}
                      <div style={{
                        fontSize: '14px', fontWeight: 700, flexShrink: 0,
                        color: isEarn ? '#2E7D32' : INK,
                      }}>
                        {isEarn ? `+$${tx.amount}` : `-$${Math.abs(tx.amount)}`}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
