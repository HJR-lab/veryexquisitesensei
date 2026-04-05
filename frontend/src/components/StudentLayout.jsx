import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import api from '../utils/api';

const TC = '#C4622D';
const RULE = 'rgba(40,40,40,0.09)';

const TABS = [
  { id: 'home',    label: 'Home',    icon: 'home',           href: '/dashboard' },
  { id: 'classes', label: 'Classes', icon: 'calendar_month', href: '/classes' },
  { id: 'credits', label: 'Credits', icon: 'toll',           href: '/credits' },
  { id: 'studio',  label: 'Studio',  icon: 'door_open',      href: '/studio-access' },
  { id: 'gallery', label: 'Gallery', icon: 'photo_library',  href: '/gallery' },
  { id: 'account', label: 'Account', icon: 'person',         href: '/account' },
];

const getActiveTab = (pathname) => {
  if (pathname.startsWith('/classes')) return 'classes';
  if (pathname.startsWith('/credits')) return 'credits';
  if (pathname.startsWith('/studio')) return 'studio';
  if (pathname.startsWith('/gallery')) return 'gallery';
  if (pathname.startsWith('/account')) return 'account';
  if (pathname.startsWith('/upload')) return 'gallery';
  if (pathname.startsWith('/membership')) return 'account';
  if (pathname.startsWith('/policy')) return 'account';
  return 'home';
};

function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnreadCount(data.count || 0);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000); // poll every 60s
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const openPanel = async () => {
    setShowPanel(true);
    setLoading(true);
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = async (notif) => {
    // Mark as read
    if (!notif.read) {
      try {
        await api.put(`/notifications/${notif.id}/read`);
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch {}
    }

    // Navigate based on type
    if (notif.type === 'pieces_ready') {
      navigate('/gallery?tab=pieces');
    }
    setShowPanel(false);
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const formatTime = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <>
      <button
        onClick={() => showPanel ? setShowPanel(false) : openPanel()}
        style={{
          position: 'fixed', top: 12, right: 12, zIndex: 60,
          width: 40, height: 40, borderRadius: '50%',
          background: 'white', border: '1px solid #e0e0e0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: unreadCount > 0 ? TC : '#888' }}>
          notifications
        </span>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            background: '#E65100', color: 'white',
            fontSize: 10, fontWeight: 700,
            minWidth: 18, height: 18, borderRadius: 99,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {showPanel && (
        <>
          <div onClick={() => setShowPanel(false)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.3)' }} />
          <div style={{
            position: 'fixed', top: 60, right: 12, zIndex: 80,
            width: 320, maxHeight: '70vh', overflow: 'auto',
            background: 'white', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            border: '1px solid #e0e0e0',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 10px', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#282828' }}>Notifications</span>
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead} style={{ background: 'none', border: 'none', color: TC, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Mark all read
                </button>
              )}
            </div>

            {loading && (
              <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 13 }}>Loading...</div>
            )}

            {!loading && notifications.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: '#888', fontSize: 13 }}>No notifications yet</div>
            )}

            {!loading && notifications.map(notif => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                style={{
                  padding: '12px 16px', cursor: 'pointer',
                  borderBottom: '1px solid #f5f5f5',
                  background: notif.read ? 'white' : '#FFF8F5',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {!notif.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: TC, flexShrink: 0, marginTop: 5 }} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#282828' }}>{notif.title}</div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2, lineHeight: 1.4 }}>{notif.message}</div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{formatTime(notif.created_at)}</div>
                  </div>
                  {notif.data?.photoUrl && (
                    <img src={notif.data.photoUrl} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function BottomNav() {
  const location = useLocation();
  const activeTab = getActiveTab(location.pathname);

  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: '#FFFFFF', borderTop: `1px solid ${RULE}`, display: 'flex', height: '60px', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {TABS.map(tab => {
        const active = activeTab === tab.id;
        return (
          <a
            key={tab.id}
            href={tab.href}
            style={{ flex: 1, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', padding: '8px 0', position: 'relative', textDecoration: 'none' }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '22px', color: active ? TC : '#BBBBBB', fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400" }}
            >
              {tab.icon}
            </span>
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: active ? TC : '#BBBBBB' }}>{tab.label}</span>
            {active && <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '20px', height: '2px', backgroundColor: TC }} />}
          </a>
        );
      })}
    </nav>
  );
}

export default function StudentLayout() {
  return (
    <>
      <NotificationBell />
      <Outlet />
      <BottomNav />
    </>
  );
}
