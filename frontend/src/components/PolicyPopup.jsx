import { useState } from 'react';
import api from '../utils/api';
import { STUDIO_POLICIES } from '../utils/courseDetails';

const TC = '#C4622D';
const INK = '#282828';
const MUTED = '#888888';

function PolicySection({ section }) {
  if (section.items) {
    return (
      <>
        <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>{section.title}</h3>
        <ul style={{ paddingLeft: '20px', margin: '0 0 8px' }}>
          {section.items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      </>
    );
  }
  return (
    <>
      <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px', color: INK }}>{section.title}</h3>
      <p>{section.content}</p>
    </>
  );
}

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
          {Object.values(STUDIO_POLICIES).map((section, i) => (
            <PolicySection key={i} section={section} />
          ))}
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
              I have read and agree to the Ves Studio policies
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
