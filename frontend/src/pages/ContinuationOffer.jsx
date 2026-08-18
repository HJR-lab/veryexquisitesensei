import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';

const TC = '#C4622D';
const TC_DARK = '#9E4A1E';
const TC_LIGHT = '#F9EDE6';
const INK = '#282828';
const MUTED = '#888888';
const RULE = '#E8E4DF';

// Public tokenized page: a multi-course package student settles their next
// course here — confirm, pass, or ask for a few more days — instead of
// exchanging emails with the studio.
//
// Deliberately shows dates and a deadline and nothing else. Capacity is an
// admin concern; their place is already held.
export default function ContinuationOffer() {
  const { token } = useParams();

  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(null); // which action is in flight
  const [result, setResult] = useState(null); // 'confirm' | 'pass' | 'extend'

  useEffect(() => {
    api.get(`/continue/${token}`)
      .then(res => setOffer(res.data))
      .catch(err => setError(err.response?.data?.error || 'Unable to load this link.'))
      .finally(() => setLoading(false));
  }, [token]);

  const respond = async (action) => {
    if (action === 'pass' && !confirm('Pass on this course? Your remaining courses stay yours — we will offer you the next one.')) return;
    setSubmitting(action);
    setError(null);
    try {
      const res = await api.post(`/continue/${token}/respond`, { action });
      setOffer(o => ({ ...o, ...res.data }));
      setResult(action);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(null);
    }
  };

  const fmtDate = (d) => d
    ? new Date(`${String(d).split('T')[0]}T00:00:00+08:00`).toLocaleDateString('en-SG', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore' })
    : '';

  const fmtDeadline = (iso) => iso
    ? new Date(iso).toLocaleDateString('en-SG', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore' })
    : '';

  const page = (children) => (
    <div style={{ minHeight: '100vh', backgroundColor: '#F5F3F0', padding: '48px 16px', fontFamily: 'Atak, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', backgroundColor: '#fff', borderRadius: '12px', padding: '32px' }}>
        <div style={{ fontSize: '13px', letterSpacing: '0.3em', color: TC, fontWeight: 700, marginBottom: '24px' }}>V E S</div>
        {children}
      </div>
    </div>
  );

  if (loading) return page(<p style={{ color: MUTED, fontSize: '14px' }}>Loading…</p>);

  if (!offer) {
    return page(
      <>
        <h1 style={{ fontSize: '20px', color: INK, margin: '0 0 12px' }}>This link is not valid</h1>
        <p style={{ fontSize: '14px', color: MUTED, lineHeight: 1.6, margin: 0 }}>
          It may have already been used. Drop us a note at info@ves.sg and we will sort it out.
        </p>
      </>
    );
  }

  // Answered — either just now, or on an earlier visit.
  const settled = result || (offer.state !== 'pending' ? offer.state : null);
  if (settled && settled !== 'pending' && settled !== 'extend') {
    const copy = {
      confirm: { h: 'You are in.', p: `We have booked your place for ${fmtDate(offer.startDate)}. Your class details will follow by email.` },
      confirmed: { h: 'Already confirmed.', p: `Your place for ${fmtDate(offer.startDate)} is booked.` },
      pass: { h: 'No problem.', p: 'We have released this one. Your remaining courses stay yours — we will offer you the next available date.' },
      passed: { h: 'You passed on this course.', p: 'Your remaining courses stay yours — we will be in touch about the next date.' },
      lapsed: { h: 'This offer has closed.', p: 'The place has been released, but your remaining courses stay yours. Email info@ves.sg and we will find you the next date.' },
    }[settled] || { h: 'This offer is no longer open.', p: 'Email info@ves.sg and we will help.' };

    return page(
      <>
        <h1 style={{ fontSize: '20px', color: INK, margin: '0 0 12px' }}>{copy.h}</h1>
        <p style={{ fontSize: '14px', color: MUTED, lineHeight: 1.6, margin: 0 }}>{copy.p}</p>
      </>
    );
  }

  const busy = submitting !== null;

  return page(
    <>
      <h1 style={{ fontSize: '20px', color: INK, margin: '0 0 8px' }}>
        {offer.firstName ? `Hi ${offer.firstName},` : 'Hi,'}
      </h1>
      <p style={{ fontSize: '15px', color: INK, lineHeight: 1.6, margin: '0 0 24px' }}>
        Your next wheelthrowing course is ready, and we have kept your usual slot.
      </p>

      {/* startDate is withheld by the server if its weekday contradicts the
          cohort — better to say nothing than to state the wrong day. */}
      <div style={{ backgroundColor: TC_LIGHT, borderRadius: '8px', padding: '18px 20px', marginBottom: '24px' }}>
        {offer.startDate ? (
          <>
            <div style={{ fontSize: '16px', fontWeight: 700, color: INK }}>{fmtDate(offer.startDate)}</div>
            <div style={{ fontSize: '14px', color: TC_DARK, marginTop: '4px' }}>{offer.classTime} · 6 weeks</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '16px', fontWeight: 700, color: INK }}>Your usual {(offer.schedulePattern || '').toLowerCase()} slot</div>
            <div style={{ fontSize: '14px', color: TC_DARK, marginTop: '4px' }}>{offer.classTime} · 6 weeks · we will confirm the start date by email</div>
          </>
        )}
      </div>

      <p style={{ fontSize: '14px', color: MUTED, lineHeight: 1.6, margin: '0 0 20px' }}>
        Please let us know by <strong style={{ color: INK }}>{fmtDeadline(offer.expiresAt)}</strong>.
        After that we release the place.
      </p>

      {error && (
        <div style={{ backgroundColor: '#FDF2F2', border: '1px solid #D93025', borderRadius: '6px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#D93025' }}>
          {error}
        </div>
      )}

      <button
        onClick={() => respond('confirm')}
        disabled={busy}
        style={{
          width: '100%', padding: '14px', backgroundColor: TC, color: '#fff', border: 'none',
          borderRadius: '8px', fontSize: '15px', fontWeight: 700, fontFamily: 'inherit',
          cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1, marginBottom: '10px',
        }}
      >
        {submitting === 'confirm' ? 'Confirming…' : 'Yes, confirm my place'}
      </button>

      <button
        onClick={() => respond('pass')}
        disabled={busy}
        style={{
          width: '100%', padding: '12px', backgroundColor: '#fff', color: INK,
          border: `1px solid ${RULE}`, borderRadius: '8px', fontSize: '14px', fontWeight: 600,
          fontFamily: 'inherit', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
          marginBottom: '10px',
        }}
      >
        {submitting === 'pass' ? 'Saving…' : 'Not this one'}
      </button>

      {offer.canExtend && (
        <button
          onClick={() => respond('extend')}
          disabled={busy}
          style={{
            width: '100%', padding: '12px', backgroundColor: 'transparent', color: MUTED,
            border: 'none', fontSize: '13px', fontFamily: 'inherit',
            cursor: busy ? 'not-allowed' : 'pointer', textDecoration: 'underline',
          }}
        >
          {submitting === 'extend' ? 'Saving…' : `I need a few more days (+${offer.extensionDays})`}
        </button>
      )}

      {result === 'extend' && (
        <p style={{ fontSize: '13px', color: TC_DARK, textAlign: 'center', marginTop: '12px' }}>
          Done — you have until {fmtDeadline(offer.expiresAt)} to decide.
        </p>
      )}

      <p style={{ fontSize: '12px', color: MUTED, lineHeight: 1.6, margin: '20px 0 0', textAlign: 'center' }}>
        Your remaining courses do not expire.
      </p>
    </>
  );
}
