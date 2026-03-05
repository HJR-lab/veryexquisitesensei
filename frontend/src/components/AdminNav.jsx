import { useState } from 'react';
import api from '../utils/api';

const TC   = '#C4622D';
const INK  = '#282828';
const MUTED = '#888888';
const RULE = 'rgba(40,40,40,0.09)';

const NAV_LINKS = [
  { id: 'classes',     label: 'Classes',   href: '/admin/classes' },
  { id: 'students',    label: 'Students',  href: '/admin/students' },
  { id: 'memberships', label: 'Members',   href: '/admin/memberships' },
];

export default function AdminNav({ active, onSyncComplete }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncMessage(null);
      await api.post('/admin/sync-shopify-customers');
      const ordersResponse = await api.post('/admin/sync-shopify-orders');
      await api.post('/admin/backfill-hb-credits');
      const n = ordersResponse.data.enrollmentsCreated || 0;
      const expired = ordersResponse.data.membershipsExpired || 0;
      let text = n > 0 ? `Synced — ${n} new enrollment${n !== 1 ? 's' : ''}` : 'Synced — no new enrollments';
      if (expired > 0) text += `, ${expired} membership${expired !== 1 ? 's' : ''} expired`;
      setSyncMessage({ type: 'ok', text });
      if (onSyncComplete) onSyncComplete();
    } catch (error) {
      setSyncMessage({ type: 'err', text: 'Sync failed' });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '24px', overflowX: 'auto' }}>
        <a href="/admin" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES"
            style={{ height: '22px', width: 'auto' }}
          />
        </a>
        <nav style={{ display: 'flex', flex: 1 }}>
          {NAV_LINKS.map(link => (
            <a
              key={link.id}
              href={link.href}
              style={{
                padding: '0 14px', height: '52px', display: 'flex', alignItems: 'center',
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: active === link.id ? TC : MUTED,
                textDecoration: 'none', whiteSpace: 'nowrap',
                borderBottom: `2px solid ${active === link.id ? TC : 'transparent'}`,
              }}
            >
              {link.label}
            </a>
          ))}
        </nav>
        {syncMessage && (
          <span style={{ fontSize: '11px', fontWeight: 600, color: syncMessage.type === 'ok' ? '#1E6B1E' : '#C0392B', flexShrink: 0 }}>
            {syncMessage.text}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', backgroundColor: 'transparent', border: `1px solid ${RULE}`, color: syncing ? MUTED : INK, fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: syncing ? 'default' : 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>sync</span>
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
          <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', backgroundColor: INK, color: '#FFF' }}>
            Admin
          </span>
        </div>
      </div>
    </header>
  );
}
