import { useState, useRef, useEffect } from 'react';
import api from '../utils/api';

const TC   = '#C4622D';
const INK  = '#282828';
const MUTED = '#888888';
const RULE = 'rgba(40,40,40,0.09)';

const NAV_LINKS = [
  { id: 'classes',     label: 'Classes',   href: '/admin/classes' },
  { id: 'students',    label: 'Users',     href: '/admin/students' },

  { id: 'studio-access', label: 'Studio',  href: '/admin/studio-access' },
];

export default function AdminNav({ active, onSyncComplete }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowSettings(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch inbox count for the notification badge
  useEffect(() => {
    let cancelled = false;
    const fetchCount = () => {
      api.get('/admin/inbox/stats')
        .then(({ data }) => { if (!cancelled) setInboxCount(data?.total || 0); })
        .catch(() => { /* silent */ });
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60 * 1000); // refresh every minute
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

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
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      setSyncMessage({ type: 'err', text: 'Sync failed' });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 10px', height: '40px', display: 'flex', alignItems: 'center' }}>
        {/* Left: nav links */}
        <nav style={{ display: 'flex', flex: 1, gap: '0px' }}>
          {NAV_LINKS.map(link => (
            <a
              key={link.id}
              href={link.href}
              style={{
                padding: '0 8px', height: '40px', display: 'flex', alignItems: 'center',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: active === link.id ? TC : MUTED,
                textDecoration: 'none', whiteSpace: 'nowrap',
                borderBottom: `2px solid ${active === link.id ? TC : 'transparent'}`,
              }}
            >
              {link.label}
            </a>
          ))}
        </nav>
        {/* Center: logo */}
        <a href="/admin" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES"
            style={{ height: '16px', width: 'auto' }}
          />
        </a>
        {/* Right: sync + admin badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'flex-end' }}>
          {syncMessage && (
            <span style={{ fontSize: '10px', fontWeight: 600, color: syncMessage.type === 'ok' ? '#1E6B1E' : '#C0392B', flexShrink: 0 }}>
              {syncMessage.text}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 6px', backgroundColor: 'transparent', border: `1px solid ${RULE}`, color: syncing ? MUTED : INK, fontSize: '8px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: syncing ? 'default' : 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>sync</span>
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
          {/* Inbox icon with notification badge */}
          <a
            href="/admin/inbox"
            title="Inbox"
            style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '2px 6px', backgroundColor: 'transparent', border: `1px solid ${RULE}`, color: INK, textDecoration: 'none' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>inbox</span>
            {inboxCount > 0 && (
              <span style={{ position: 'absolute', top: '-4px', right: '-4px', minWidth: '14px', height: '14px', padding: '0 3px', borderRadius: '7px', backgroundColor: TC, color: '#FFF', fontSize: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                {inboxCount > 99 ? '99+' : inboxCount}
              </span>
            )}
          </a>
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSettings(s => !s)}
              style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', backgroundColor: 'transparent', border: `1px solid ${RULE}`, color: INK, cursor: 'pointer' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>settings</span>
            </button>
            {showSettings && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, backgroundColor: '#FFF', border: `1px solid ${RULE}`, minWidth: '140px', zIndex: 100 }}>
                {[
                  { type: 'header', label: 'Students' },
                  { label: 'Fees', href: '/admin/fees' },
                  { label: 'Credits', href: '/admin/credits' },
                  { label: 'Vouchers', href: '/admin/vouchers' },
                  { type: 'header', label: 'Courses' },
                  { label: 'Cohort', href: '/admin/cohorts' },
                  { label: 'Settings', href: '/admin/course-config' },
                  { type: 'header', label: 'Communications' },
                  { label: 'Emails', href: '/admin/emails' },
                  { label: 'CRM', href: '/admin/crm' },
                  { label: 'Events', href: '/admin/events' },
                  { label: 'Policy', href: '/admin/policy' },
                  { type: 'header', label: 'Studio' },
                  { label: 'Fire', href: '/admin/pieces' },
                  { label: 'Inventory', href: '/admin/reference' },
                  { label: 'Instructors', href: '/admin/instructors' },
                  { type: 'header', label: 'Analytics' },
                  { label: 'Stats', href: '/admin/platform-stats' },
                ].map((item, i) => (
                  item.type === 'header' ? (
                    <div key={`h-${i}`} style={{ padding: '6px 12px 3px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, backgroundColor: '#FAFAFA', borderBottom: `1px solid ${RULE}`, borderTop: i > 0 ? `1px solid ${RULE}` : 'none' }}>
                      {item.label}
                    </div>
                  ) : (
                    <a
                      key={item.href}
                      href={item.href}
                      style={{ display: 'block', padding: '7px 12px 7px 18px', fontSize: '11px', fontWeight: 600, color: INK, textDecoration: 'none', borderBottom: `1px solid ${RULE}` }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F5F5F5'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {item.label}
                    </a>
                  )
                ))}
              </div>
            )}
          </div>
          <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 7px', backgroundColor: INK, color: '#FFF' }}>
            Admin
          </span>
        </div>
      </div>
    </header>
  );
}
