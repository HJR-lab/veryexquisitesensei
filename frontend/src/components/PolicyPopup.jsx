import { useState } from 'react';
import api from '../utils/api';

const TC = '#C4622D';
const INK = '#282828';
const MUTED = '#888888';

export default function PolicyPopup({ onAccepted }) {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      await api.post('/user/accept-policies');
      onAccepted();
    } catch (err) {
      console.error('Failed to accept policies:', err);
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: '12px', maxWidth: '560px', width: '100%',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 32px 16px', textAlign: 'center', flexShrink: 0 }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES" style={{ height: '40px', marginBottom: '12px' }}
          />
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: INK }}>Studio Policies</h2>
          <p style={{ margin: '8px 0 0', fontSize: '14px', color: MUTED }}>Please review and accept before continuing</p>
        </div>

        {/* Scrollable Policy Content */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '0 32px 16px',
          fontSize: '13px', lineHeight: '1.7', color: INK,
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>Class Size and Policies</h3>
          <p>To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.</p>

          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>Make-Up Classes</h3>
          <p>While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for the final week (glazing), subject to our schedule and availability. Please inform us in advance if you need to schedule a make-up class.</p>

          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>Punctuality</h3>
          <p>As this is a structured course, please be punctual. The studio opens for entry 10 minutes before class begins. Class will begin and end on time.</p>

          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>Items Required</h3>
          <ul style={{ paddingLeft: '20px', margin: '0 0 8px' }}>
            <li>Tools — available for purchase ($15, $12 for advanced trimming tool) or bring your own</li>
            <li>Apron — required, not provided (available for $18)</li>
            <li>Carry bag — not provided (tote bags available for $12)</li>
          </ul>

          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>Studio Rules</h3>
          <ul style={{ paddingLeft: '20px', margin: '0 0 8px' }}>
            <li>Press the doorbell on the wall to enter</li>
            <li>Initial your work clearly in 3 text/numbers to avoid mix-ups</li>
            <li>Clean up after yourself and wipe your seat and wheels</li>
            <li>Wear a mask if you are unwell</li>
            <li>Wear comfortable clothes and closed-toe shoes</li>
            <li>Cut your nails appropriately</li>
            <li>Eating is not allowed in the studio</li>
            <li>If you are under 16, please notify us in advance</li>
          </ul>

          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>Collection &amp; Disposal</h3>
          <p>Collection of finished pieces is by appointment only, within 1 month after your final class. We reserve the right to dispose of uncollected pieces after 3 months. Please contact us to arrange collection.</p>

          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>General</h3>
          <p>We reserve the right to blacklist and ban students that do not comply with the rules or conduct any illegal or inappropriate activity in our premises.</p>
        </div>

        {/* Footer — Checkbox + Button */}
        <div style={{
          padding: '16px 32px 24px', borderTop: '1px solid rgba(40,40,40,0.09)', flexShrink: 0,
        }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '16px' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: '2px', accentColor: TC }}
            />
            <span style={{ fontSize: '13px', color: INK, lineHeight: '1.5' }}>
              I have read and agree to the VES Clay Studio policies
            </span>
          </label>
          <button
            onClick={handleAccept}
            disabled={!agreed || submitting}
            style={{
              width: '100%', padding: '14px', borderRadius: '8px', border: 'none',
              backgroundColor: agreed ? TC : '#ccc', color: '#fff',
              fontSize: '15px', fontWeight: 600, cursor: agreed ? 'pointer' : 'default',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
