import { useState, useEffect } from 'react';
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function Credits() {
  const { user } = useAuth();

  const [balance, setBalance]     = useState(null);
  const [history, setHistory]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => {
    const customerId = user?.dbCustomerId;
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
          setBalance(balRes.data);
          setHistory(histRes.data || []);
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
  }, [user?.dbCustomerId]);

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

        {/* Page header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>Credits</h1>
          <p style={{ fontSize: '12px', color: MUTED, margin: '4px 0 0' }}>Your VES studio credit balance and history</p>
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
                {balance?.balance ?? 0}
                <span style={{ fontSize: '16px', fontWeight: 400, color: TC_DARK, marginLeft: '6px' }}>credits</span>
              </div>
              <div style={{ fontSize: '11px', color: TC_DARK, opacity: 0.7 }}>
                Expires 31 Dec 2026
              </div>
            </div>

            {/* ── "Use your credits for" card ──────────────────────────────── */}
            <div style={{
              border: `1px solid ${RULE}`,
              padding: '18px 20px',
              marginBottom: '28px',
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '14px' }}>
                Use your credits for
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {[
                  { label: 'Studio access fees',           note: 'automatic' },
                  { label: 'Extra firing pieces',          note: 'automatic' },
                  { label: 'Piece delivery (self / gift)', note: 'automatic' },
                  { label: 'Reschedule fees',              note: 'automatic' },
                  { label: 'Course discount',              note: 'contact us' },
                ].map(({ label, note }, i, arr) => (
                  <li
                    key={label}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: i < arr.length - 1 ? `1px solid ${RULE}` : 'none',
                    }}
                  >
                    <span style={{ fontSize: '13px', color: INK }}>{label}</span>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: note === 'contact us' ? TC : MUTED,
                      backgroundColor: note === 'contact us' ? TC_LIGHT : 'transparent',
                      padding: note === 'contact us' ? '2px 8px' : '0',
                    }}>
                      {note}
                    </span>
                  </li>
                ))}
              </ul>
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
                  const isEarn = tx.amount > 0;
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
                            Balance: {tx.balance_after} credits
                          </div>
                        )}
                      </div>

                      {/* Amount */}
                      <div style={{
                        fontSize: '14px', fontWeight: 700, flexShrink: 0,
                        color: isEarn ? '#2E7D32' : INK,
                      }}>
                        {isEarn ? `+${tx.amount}` : tx.amount}
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
