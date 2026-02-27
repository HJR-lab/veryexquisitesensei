import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const NAV = [
  { id: 'classes',     label: 'Classes',   href: '/admin/classes' },
  { id: 'students',    label: 'Students',  href: '/admin/students' },
  { id: 'memberships', label: 'Members',   href: '/admin/memberships' },
];



function AdminNav({ active, onLogout }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '24px' }}>
        <a href="/admin" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES"
            style={{ height: '22px', width: 'auto' }}
          />
        </a>
        <div style={{ width: '1px', height: '18px', backgroundColor: RULE, flexShrink: 0 }} />
        <nav style={{ display: 'flex', flex: 1 }}>
          {NAV.map(link => (
            <a
              key={link.id}
              href={link.href}
              style={{
                padding: '0 14px',
                height: '52px',
                display: 'flex',
                alignItems: 'center',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: active === link.id ? TC : MUTED,
                textDecoration: 'none',
                borderBottom: `2px solid ${active === link.id ? TC : 'transparent'}`,
              }}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <span style={{
          fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          padding: '5px 10px', backgroundColor: INK, color: '#FFF', flexShrink: 0,
        }}>
          Admin
        </span>
        <button
          onClick={onLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: MUTED, background: 'none', border: `1px solid ${RULE}`,
            padding: '5px 10px', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>logout</span>
          Sign Out
        </button>
      </div>
    </header>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredModule, setHoveredModule] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    loadStats();
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const [dashboardRes, clayTypesRes, glazesRes, activityRes] = await Promise.all([
        api.get('/admin/dashboard/stats'),
        api.get('/reference/clay-types'),
        api.get('/reference/glazes'),
        api.get('/admin/dashboard/activity'),
      ]);
      setStats({
        ...dashboardRes.data,
        clayTypes: clayTypesRes.data.clayTypes?.length || 0,
        glazes: glazesRes.data.glazes?.length || 0,
      });
      setAlerts(activityRes.data.alerts || []);
      setActivity(activityRes.data.activity || []);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const modules = [
    { label: 'Classes',   icon: 'event',           href: '/admin/classes',     desc: 'Schedule & bookings',    stat: loading ? null : (stats?.classes?.total ?? null),      sub: `${stats?.classes?.availableSpots ?? 0} open spots` },
    { label: 'Students',  icon: 'group',          href: '/admin/students',    desc: 'Allocations & accounts', stat: loading ? null : (stats?.students?.total ?? null),     sub: `${stats?.students?.newThisMonth ?? 0} new this month` },
    { label: 'Members',   icon: 'card_membership', href: '/admin/memberships', desc: 'Studio memberships',     stat: loading ? null : (stats?.memberships?.total ?? null),  sub: `${stats?.memberships?.expiringSoon ?? 0} expiring soon` },
    { label: 'Gallery',   icon: 'photo_library',   href: '/admin/gallery',     desc: 'Student pottery works',  stat: loading ? null : (stats?.gallery?.total ?? null),      sub: `${stats?.gallery?.addedThisMonth ?? 0} added this month` },
    { label: 'Courses',   icon: 'school',          href: '/admin/courses',     desc: 'Course templates' },
    { label: 'Reference', icon: 'inventory_2',     href: '/admin/reference',   desc: 'Clay types & glazes' },
  ];

  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <AdminNav active="dashboard" onLogout={logout} />

      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>
              VES Pottery Studio
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>
              Admin Dashboard
            </h1>
          </div>
          <div style={{ fontSize: '12px', color: MUTED }}>{dateStr}</div>
        </div>

        {/* Layout: modules + right column */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 300px', gap: '24px', alignItems: 'start' }}>

          {/* Module grid */}
          <div style={{ gridColumn: isMobile ? '1' : 'span 2' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>
              Manage
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
              gap: '1px',
              backgroundColor: RULE,
              border: `1px solid ${RULE}`,
            }}>
              {modules.map((m, i) => (
                <a
                  key={i}
                  href={m.href}
                  style={{
                    backgroundColor: hoveredModule === i ? TC_LIGHT : '#FFFFFF',
                    padding: '22px 20px',
                    textDecoration: 'none',
                    color: INK,
                    display: 'block',
                    transition: 'background-color 0.1s',
                  }}
                  onMouseEnter={() => setHoveredModule(i)}
                  onMouseLeave={() => setHoveredModule(null)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px', color: TC, display: 'block', marginBottom: m.stat != null ? '10px' : '10px' }}>
                    {m.icon}
                  </span>
                  {m.stat != null && (
                    <div style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1, marginBottom: '6px' }}>
                      {m.stat}
                    </div>
                  )}
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>{m.label}</div>
                  <div style={{ fontSize: '11px', color: MUTED }}>{m.stat != null ? m.sub : m.desc}</div>
                </a>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr', gap: '24px', alignItems: 'start' }}>

            {/* Alerts */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>
                Alerts
              </div>
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>
                {alerts.length === 0 ? (
                  <div style={{ padding: '14px', fontSize: '12px', color: MUTED }}>No alerts</div>
                ) : alerts.map((alert, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '11px 14px',
                      borderBottom: i < alerts.length - 1 ? `1px solid ${RULE}` : 'none',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px', color: TC, flexShrink: 0, marginTop: '1px' }}>
                      {alert.type === 'membership' ? 'card_membership' : alert.type === 'class' ? 'event' : 'person'}
                    </span>
                    <span style={{ fontSize: '12px', color: INK, lineHeight: 1.4 }}>{alert.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>
                Recent Activity
              </div>
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>
                {activity.length === 0 ? (
                  <div style={{ padding: '14px', fontSize: '12px', color: MUTED }}>No recent activity</div>
                ) : activity.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '11px 14px',
                      borderBottom: i < activity.length - 1 ? `1px solid ${RULE}` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: TC, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {r.action}
                      </span>
                      <span style={{ fontSize: '10px', color: MUTED }}>{r.when}</span>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{r.who}</div>
                    <div style={{ fontSize: '11px', color: MUTED }}>{r.detail}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
