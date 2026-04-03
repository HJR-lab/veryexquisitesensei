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

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [stats, setStats] = useState(null);
  const [summaryStats, setSummaryStats] = useState(null);
  const [creditStats, setCreditStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredModule, setHoveredModule] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [engagement, setEngagement] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    // Phase 1: instant summary counts
    api.get('/admin/dashboard/stats/summary').then(({ data }) => {
      setSummaryStats(data);
    }).catch(() => {});

    // Engagement metrics (parallel, independent)
    api.get('/admin/dashboard/engagement').then(({ data }) => {
      setEngagement(data);
    }).catch(() => {});

    // Credit stats (parallel, independent)
    api.get('/admin/credits/stats').then(({ data }) => {
      setCreditStats(data);
    }).catch(() => {});

    // Phase 2: full stats + activity
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
    { label: 'Classes',   icon: 'event',           href: '/admin/classes',     desc: 'Schedule & bookings',    stat: loading ? (summaryStats?.classes?.total ?? null) : (stats?.classes?.total ?? null),      sub: loading ? '' : `${stats?.classes?.availableSpots ?? 0} open spots` },
    { label: 'Users',     icon: 'group',          href: '/admin/students',    desc: 'Students & members',     stat: loading ? (summaryStats ? (summaryStats.students?.total ?? 0) + (summaryStats.memberships?.total ?? 0) : null) : ((stats?.students?.total ?? 0) + (stats?.memberships?.total ?? 0)),  sub: loading ? '' : `${stats?.memberships?.expiringSoon ?? 0} memberships expiring` },
    { label: 'Studio Access', icon: 'door_open',  href: '/admin/studio-access', desc: 'Studio access bookings', stat: loading ? (summaryStats?.studioAccess?.pending ?? null) : (stats?.studioAccess?.confirmed ?? null), sub: loading ? (summaryStats?.studioAccess?.pending != null ? 'pending' : '') : `${stats?.studioAccess?.confirmed ?? 0} confirmed · ${stats?.studioAccess?.pending ?? 0} pending` },
    { label: 'Gallery',   icon: 'photo_library',   href: '/admin/gallery',     desc: 'Student pottery works',  stat: loading ? (summaryStats?.gallery?.total ?? null) : (stats?.gallery?.total ?? null),      sub: loading ? '' : `${stats?.gallery?.addedThisMonth ?? 0} added this month` },
    { label: 'Instructors', icon: 'person_apron',   href: '/admin/instructors',  desc: 'Profiles & portfolios', stat: summaryStats?.totalInstructors ?? null, sub: summaryStats?.totalInstructors != null ? `${summaryStats.totalInstructors} active` : '' },
    { label: 'Credits',   icon: 'payments',        href: '/admin/credits',     desc: 'Student credit balances', stat: creditStats ? `$${creditStats.totalBalance}` : null, sub: creditStats ? `${creditStats.totalTransactions} transactions · ${creditStats.todayTransactions} today` : '' },
    { label: 'Courses',   icon: 'school',          href: '/admin/course-config', desc: 'Course templates' },
    { label: 'Events',    icon: 'celebration',     href: '/admin/events',      desc: 'Sales & collaborations' },
    { label: 'Policy',    icon: 'gavel',           href: '/admin/policy',      desc: 'Studio rules & terms' },
    { label: 'Reference', icon: 'inventory_2',     href: '/admin/reference',   desc: 'Clay types & glazes' },
  ];

  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: isMobile ? '20px 16px 60px' : '32px 24px 60px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>
              VES Pottery Studio
            </div>
            <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>
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
                ) : alerts.map((alert, i) => {
                  const iconName = alert.icon || (alert.type === 'membership' ? 'card_membership' : alert.type === 'class' ? 'event' : alert.type === 'enrollment' ? 'pause_circle' : alert.type === 'info' ? 'today' : 'info');
                  const iconColor = alert.type === 'info' ? '#3B82F6' : alert.type === 'class' ? '#D97706' : alert.type === 'enrollment' ? '#8B5CF6' : alert.type === 'studio_pending' ? '#F57F17' : TC;
                  return (
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
                      <span className="material-symbols-outlined" style={{ fontSize: '14px', color: iconColor, flexShrink: 0, marginTop: '1px' }}>
                        {iconName}
                      </span>
                      <span style={{ fontSize: '12px', color: INK, lineHeight: 1.4 }}>{alert.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Engagement */}
            {engagement && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>
                  Engagement
                </div>
                <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>
                  {/* Students breakdown */}
                  <div style={{ padding: '12px 14px', borderBottom: `1px solid ${RULE}` }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '8px' }}>
                      Students
                    </div>
                    {[
                      {
                        label: 'Active (today)',
                        value: engagement.activeToday ?? 0,
                        pct: engagement.totalStudents > 0 ? Math.round(((engagement.activeToday ?? 0) / engagement.totalStudents) * 100) : 0,
                        color: '#059669',
                      },
                      {
                        label: 'Active (7 days)',
                        value: engagement.activeLastWeek,
                        pct: engagement.totalStudents > 0 ? Math.round((engagement.activeLastWeek / engagement.totalStudents) * 100) : 0,
                        color: TC,
                      },
                      {
                        label: 'Active (30 days)',
                        value: engagement.activeLastMonth,
                        pct: engagement.totalStudents > 0 ? Math.round((engagement.activeLastMonth / engagement.totalStudents) * 100) : 0,
                        color: '#D97706',
                      },
                      {
                        label: 'Never logged in',
                        value: engagement.neverLoggedIn,
                        pct: engagement.totalStudents > 0 ? Math.round((engagement.neverLoggedIn / engagement.totalStudents) * 100) : 0,
                        color: MUTED,
                      },
                    ].map((row) => (
                      <div key={row.label} style={{ marginBottom: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                          <span style={{ fontSize: '12px', color: INK }}>{row.label}</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: row.color }}>
                            {row.value} <span style={{ fontWeight: 400, color: MUTED, fontSize: '11px' }}>({row.pct}%)</span>
                          </span>
                        </div>
                        <div style={{ height: '3px', backgroundColor: ALT, borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${row.pct}%`, backgroundColor: row.color, borderRadius: '2px', transition: 'width 0.3s ease' }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Recent logins */}
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '8px' }}>
                      Recent Logins
                    </div>
                    {(engagement.recentLogins || []).length === 0 ? (
                      <div style={{ fontSize: '12px', color: MUTED }}>No logins yet</div>
                    ) : (engagement.recentLogins || []).map((login, i, arr) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '4px 0',
                          borderBottom: i < arr.length - 1 ? `1px solid ${RULE}` : 'none',
                        }}
                      >
                        <span style={{ fontSize: '12px', fontWeight: 600, color: INK }}>{login.name}</span>
                        <span style={{ fontSize: '10px', color: MUTED }}>
                          {new Date(login.lastLoginAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Recent activity */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>
                Recent Activity
              </div>
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>
                {loading ? (
                  <div style={{ padding: '14px', fontSize: '12px', color: MUTED }}>Loading activity…</div>
                ) : activity.length === 0 ? (
                  <div style={{ padding: '14px', fontSize: '12px', color: MUTED }}>No recent activity</div>
                ) : activity.map((r, i) => {
                  const actionStyles = {
                    Booked: { color: '#059669', icon: 'event_available' },
                    Cancelled: { color: '#DC2626', icon: 'event_busy' },
                    Enrolled: { color: '#2563EB', icon: 'school' },
                    Membership: { color: '#7C3AED', icon: 'card_membership' },
                    Gallery: { color: '#D97706', icon: 'photo_library' },
                    Studio: { color: '#0891B2', icon: 'door_open' },
                  };
                  const style = actionStyles[r.action] || { color: TC, icon: 'circle' };
                  return (
                    <div
                      key={i}
                      style={{
                        padding: '11px 14px',
                        borderBottom: i < activity.length - 1 ? `1px solid ${RULE}` : 'none',
                        display: 'flex',
                        gap: '10px',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '14px', color: style.color, flexShrink: 0, marginTop: '2px' }}>
                        {style.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: style.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {r.action}
                          </span>
                          <span style={{ fontSize: '10px', color: MUTED }}>{r.when}</span>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>{r.who}</div>
                        <div style={{ fontSize: '11px', color: MUTED }}>{r.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
