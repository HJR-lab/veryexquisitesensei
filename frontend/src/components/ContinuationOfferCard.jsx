import { useState, useEffect } from 'react';
import api from '../utils/api';

const TC = '#C4622D';
const TC_DARK = '#9E4A1E';
const TC_LIGHT = '#F9EDE6';
const INK = '#282828';
const MUTED = '#888888';
const RULE = 'rgba(40,40,40,0.09)';

// The student's open continuation offer, on their own dashboard.
//
// The emailed link does the same job, but a student who asked for more time
// comes back days later without that email to hand — so the decision has to be
// reachable from their account as well.
//
// Renders nothing at all when there is no open offer.
export default function ContinuationOfferCard() {
  const [offer, setOffer] = useState(null);
  const [submitting, setSubmitting] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/my/continuation-offer')
      .then(res => setOffer(res.data.offer))
      .catch(() => {}); // never let this break the dashboard
  }, []);

  const respond = async (action) => {
    if (action === 'pass' && !confirm('Pass on this course? Your remaining courses stay yours — we will offer you the next one.')) return;
    setSubmitting(action);
    setError(null);
    try {
      const res = await api.post('/my/continuation-offer/respond', { action });
      setOffer(res.data.offer);
      if (action !== 'extend') setDone(action);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(null);
    }
  };

  if (!offer) return null;

  const fmtDate = d => d
    ? new Date(`${String(d).split('T')[0]}T00:00:00+08:00`).toLocaleDateString('en-SG', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore' })
    : '';
  const fmtDeadline = iso => iso
    ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', timeZone: 'Asia/Singapore' })
    : '';

  const shell = children => (
    <div style={{ maxWidth: '520px', margin: '0 auto', padding: '16px 20px 0' }}>
      <div style={{ backgroundColor: '#fff', border: `1px solid ${TC}`, borderRadius: '10px', padding: '18px 20px' }}>
        {children}
      </div>
    </div>
  );

  if (done) {
    return shell(
      <>
        <div style={{ fontSize: '13px', fontWeight: 700, color: INK, marginBottom: '4px' }}>
          {done === 'confirm' ? 'Your place is booked' : 'Course released'}
        </div>
        <div style={{ fontSize: '12px', color: MUTED, lineHeight: 1.6 }}>
          {done === 'confirm'
            ? `We will email your class details for ${fmtDate(offer.startDate)}.`
            : 'Your remaining courses stay yours — we will offer you the next date.'}
        </div>
      </>
    );
  }

  const busy = submitting !== null;

  return shell(
    <>
      <div style={{
        fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: '#fff', backgroundColor: TC, padding: '2px 6px', display: 'inline-block', marginBottom: '10px',
      }}>
        Your next course
      </div>

      <div style={{ backgroundColor: TC_LIGHT, borderRadius: '6px', padding: '12px 14px', marginBottom: '12px' }}>
        {offer.startDate ? (
          <>
            <div style={{ fontSize: '14px', fontWeight: 700, color: INK }}>{fmtDate(offer.startDate)}</div>
            <div style={{ fontSize: '12px', color: TC_DARK, marginTop: '2px' }}>{offer.classTime} · 6 weeks</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '14px', fontWeight: 700, color: INK }}>Your usual {(offer.schedulePattern || '').toLowerCase()} slot</div>
            <div style={{ fontSize: '12px', color: TC_DARK, marginTop: '2px' }}>{offer.classTime} · 6 weeks · date to be confirmed</div>
          </>
        )}
      </div>

      <div style={{ fontSize: '12px', color: MUTED, lineHeight: 1.6, marginBottom: '12px' }}>
        Let us know by <strong style={{ color: INK }}>{fmtDeadline(offer.expiresAt)}</strong> or we release the place.
      </div>

      {error && (
        <div style={{ backgroundColor: '#FDF2F2', border: '1px solid #D93025', borderRadius: '6px', padding: '10px', marginBottom: '10px', fontSize: '12px', color: '#D93025' }}>
          {error}
        </div>
      )}

      <button
        onClick={() => respond('confirm')}
        disabled={busy}
        style={{
          width: '100%', padding: '11px', backgroundColor: TC, color: '#fff', border: 'none',
          borderRadius: '6px', fontSize: '13px', fontWeight: 700, fontFamily: 'inherit',
          cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1, marginBottom: '8px',
        }}
      >
        {submitting === 'confirm' ? 'Confirming…' : 'Yes, confirm my place'}
      </button>

      <button
        onClick={() => respond('pass')}
        disabled={busy}
        style={{
          width: '100%', padding: '9px', backgroundColor: '#fff', color: INK,
          border: `1px solid ${RULE}`, borderRadius: '6px', fontSize: '12px', fontWeight: 600,
          fontFamily: 'inherit', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
        }}
      >
        {submitting === 'pass' ? 'Saving…' : 'Not this one'}
      </button>

      {offer.canExtend && (
        <button
          onClick={() => respond('extend')}
          disabled={busy}
          style={{
            width: '100%', padding: '8px', marginTop: '6px', backgroundColor: 'transparent',
            color: MUTED, border: 'none', fontSize: '11px', fontFamily: 'inherit',
            cursor: busy ? 'not-allowed' : 'pointer', textDecoration: 'underline',
          }}
        >
          {submitting === 'extend' ? 'Saving…' : `I need a few more days (+${offer.extensionDays})`}
        </button>
      )}
    </>
  );
}
