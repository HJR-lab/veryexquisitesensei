import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import { potteryAPI } from '../utils/api';
import { getCourseTypeInfo } from '../utils/courseTypes';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// ─── Tiny reusable components ─────────────────────────────────────────────────
function SectionLabel({ children, action, actionHref, actionLabel }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED }}>
        {children}
      </span>
      {action && (
        <Link
          to={actionHref || '#'}
          style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TC, textDecoration: 'none' }}
        >
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ height: '1px', backgroundColor: RULE, margin: '0 0 28px' }} />;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const [studentData, setStudentData] = useState(null);
  const [galleryPieces, setGalleryPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [showPastClasses, setShowPastClasses] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [dashboardResponse, potteryData] = await Promise.all([
        api.get('/students/me/dashboard'),
        potteryAPI.getPieces()
      ]);

      setDashboardData(dashboardResponse.data);
      setStudentData(dashboardResponse.data.student);

      if (Array.isArray(potteryData)) {
        setGalleryPieces(potteryData.slice(0, 4));
      } else if (potteryData && Array.isArray(potteryData.pieces)) {
        setGalleryPieces(potteryData.pieces.slice(0, 4));
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get all enrollments flattened
  const getAllEnrollments = () => {
    if (!dashboardData?.enrollments) return [];
    const { active = [], upcoming = [], completed = [], pending = [] } = dashboardData.enrollments;
    return [...active, ...upcoming, ...completed, ...pending];
  };

  // Extract all bookings from all enrollments (each enrollment has a bookings[] array)
  const getAllBookings = (enrollments) => {
    const all = [];
    enrollments.forEach(enrollment => {
      if (enrollment.bookings && Array.isArray(enrollment.bookings)) {
        enrollment.bookings.forEach(booking => {
          all.push(booking);
        });
      }
    });
    return all.sort((a, b) => {
      const dateA = new Date(a.class_instances?.class_date);
      const dateB = new Date(b.class_instances?.class_date);
      return dateA - dateB;
    });
  };

  // Split bookings into upcoming and past
  const classifyBookings = (allBookings) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = [];
    const past = [];

    allBookings.forEach(booking => {
      if (!booking.class_instances) return;
      const classDate = new Date(booking.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      if (classDate < today) {
        past.push(booking);
      } else {
        upcoming.push(booking);
      }
    });

    return { upcoming, past };
  };

  // Get the next upcoming class for the hero strip
  const getNextClass = (upcomingBookings) => {
    if (!upcomingBookings || upcomingBookings.length === 0) return null;
    const booking = upcomingBookings[0];
    const ci = booking.class_instances;
    if (!ci) return null;
    const date = new Date(ci.class_date);
    return {
      date: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      time: ci.start_time,
    };
  };

  // Parse a short course type label from class_type code
  const getShortCourseLabel = (classType) => {
    if (!classType) return '';
    if (classType.startsWith('WT')) return 'Wheelthrowing';
    if (classType.startsWith('HB')) return 'Handbuilding';
    return classType.split('.')[0];
  };

  const firstName = studentData?.first_name || user?.firstName || user?.email?.split('@')[0] || 'Student';

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '13px', color: MUTED, letterSpacing: '0.06em' }}>Loading…</span>
      </div>
    );
  }

  const enrollments = getAllEnrollments();
  const allBookings = getAllBookings(enrollments);
  const { upcoming, past } = classifyBookings(allBookings);
  const nextClass = getNextClass(upcoming);
  const stats = dashboardData?.stats;

  // Derive per-enrollment attended counts (same logic as before)
  const enrollmentsWithCounts = enrollments.map(enrollment => {
    const totalClasses = enrollment.class_credits_allocated || enrollment.number_of_weeks || 6;
    const enrollmentBookings = enrollment.bookings || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bookingAttendedCount = enrollmentBookings.filter(b => {
      if (b.status === 'attended' || b.status === 'completed') return true;
      if (b.status === 'booked' && b.class_instances) {
        const d = new Date(b.class_instances.class_date);
        d.setHours(0, 0, 0, 0);
        return d < today;
      }
      return false;
    }).length;
    const attendedCount = enrollmentBookings.length > 0 ? bookingAttendedCount : (enrollment.class_credits_used || 0);
    const remaining = Math.max(totalClasses - attendedCount, 0);
    const pct = totalClasses > 0 ? Math.min(Math.round((attendedCount / totalClasses) * 100), 100) : 0;

    // Determine course type label
    const courseTitle = enrollment.course_title || '';
    const classType = enrollment.class_type || '';
    let typeLabel = 'Course';
    if (classType.startsWith('WT') || courseTitle.toLowerCase().includes('wheel')) typeLabel = 'Wheelthrowing';
    else if (classType.startsWith('HB') || courseTitle.toLowerCase().includes('handbuild')) typeLabel = 'Handbuilding';

    // Status badge
    const { active: activeEnrollments = [], upcoming: upcomingEnrollments = [] } = dashboardData?.enrollments || {};
    let statusLabel = 'enrolled';
    if (activeEnrollments.find(e => e.id === enrollment.id)) statusLabel = 'active';
    else if (upcomingEnrollments.find(e => e.id === enrollment.id)) statusLabel = 'upcoming';
    else if ((dashboardData?.enrollments?.completed || []).find(e => e.id === enrollment.id)) statusLabel = 'completed';

    return { enrollment, totalClasses, attendedCount, remaining, pct, typeLabel, statusLabel };
  });

  // Greeting course count line: unique types, sum remaining
  const greetingCounts = enrollmentsWithCounts.reduce((acc, { typeLabel, remaining }) => {
    if (!acc[typeLabel]) acc[typeLabel] = 0;
    acc[typeLabel] += remaining;
    return acc;
  }, {});
  const greetingEntries = Object.entries(greetingCounts);

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>

      {/* ── MEMBERSHIP HINT ── */}
      <div style={{ backgroundColor: TC_LIGHT, width: '100%' }}>
        <div style={{
          maxWidth: '520px', margin: '0 auto', padding: '9px 20px',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TC_DARK, flexShrink: 0 }}>
            Ves • Clay Club Membership
          </span>
          <span style={{ fontSize: '11px', color: INK, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Unlock unlimited studio access now!
          </span>
          <Link
            to="/membership"
            style={{
              fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: TC, textDecoration: 'none', whiteSpace: 'nowrap',
              borderBottom: `1px solid ${TC}`, paddingBottom: '1px', flexShrink: 0,
            }}
          >
            View plans
          </Link>
        </div>
      </div>

      {/* ── TOP BAR ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        backgroundColor: '#FFFFFF',
        borderBottom: `1px solid ${RULE}`,
      }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES"
            style={{ height: '26px', width: 'auto' }}
          />
        </div>
      </header>

      {/* ── SCROLL BODY ── */}
      <main style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px 88px' }}>

        {/* ── 1. GREETING ── */}
        <div style={{ padding: '32px 0 24px', borderBottom: `1px solid ${RULE}`, marginBottom: '28px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.05, margin: '0 0 10px' }}>
            Hi {firstName}.
          </h1>
          {greetingEntries.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: '14px', color: MUTED, marginBottom: '4px' }}>
              {greetingEntries.map(([label, remaining], i) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {i > 0 && <span style={{ color: RULE }}>·</span>}
                  <strong style={{ color: INK }}>{remaining}</strong>&nbsp;{label}
                </span>
              ))}
            </div>
          )}
          {nextClass && (
            <div style={{ fontSize: '13px', color: MUTED }}>
              Next: <strong style={{ color: INK }}>{nextClass.date}</strong>, {nextClass.time}
            </div>
          )}
        </div>

        {/* ── 2. MY COURSES ── */}
        {enrollmentsWithCounts.length > 0 && (
          <section style={{ marginBottom: '28px' }}>
            <SectionLabel>My Courses</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[...enrollmentsWithCounts].sort((a, b) => {
                // Wheelthrowing always first
                const aWT = a.typeLabel === 'Wheelthrowing';
                const bWT = b.typeLabel === 'Wheelthrowing';
                return aWT === bWT ? 0 : aWT ? -1 : 1;
              }).map(({ enrollment, totalClasses, attendedCount, pct, typeLabel, statusLabel }, i) => {
                const isActive = statusLabel === 'active';
                return (
                  <div key={enrollment.id || i} style={{ padding: '14px', border: `1px solid ${RULE}`, backgroundColor: ALT, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Top row: type + badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>
                        {typeLabel}
                      </div>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                        padding: '3px 6px', flexShrink: 0,
                        backgroundColor: isActive ? TC_LIGHT : '#EBEBEB',
                        color: isActive ? TC_DARK : MUTED,
                      }}>
                        {statusLabel}
                      </span>
                    </div>
                    {/* Attended count */}
                    <div style={{ fontSize: '13px', color: MUTED }}>
                      Attended: <strong style={{ color: INK }}>{attendedCount}/{totalClasses}</strong>
                    </div>
                    {/* Progress track */}
                    <div style={{ height: '2px', backgroundColor: 'rgba(40,40,40,0.1)', position: 'relative', marginTop: '2px' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '2px', width: `${pct}%`, backgroundColor: TC }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <Divider />

        {/* ── 3. UPCOMING CLASSES ── */}
        <section style={{ marginBottom: '28px' }}>
          <SectionLabel action actionHref="/classes" actionLabel="Browse classes">
            Upcoming Classes{upcoming.length > 0 && (
              <span style={{ color: '#CCC', fontWeight: 400, marginLeft: '4px' }}>{upcoming.length}</span>
            )}
          </SectionLabel>

          {upcoming.length === 0 ? (
            <p style={{ fontSize: '13px', color: MUTED, padding: '16px 0' }}>No upcoming classes booked yet.</p>
          ) : (
            <div>
              {upcoming.map((booking, i) => {
                const ci = booking.class_instances || {};
                const classDate = new Date(ci.class_date || booking.class_date);
                const classType = ci.class_type || booking.class_type || '';
                const dayAbbr = classDate.toLocaleDateString('en-GB', { weekday: 'short' });
                const dayNum  = classDate.toLocaleDateString('en-GB', { day: 'numeric' });
                const month   = classDate.toLocaleDateString('en-GB', { month: 'short' });
                const timeStr = ci.start_time
                  ? (ci.end_time ? `${ci.start_time} – ${ci.end_time}` : ci.start_time)
                  : '—';

                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '12px 0',
                    borderBottom: i < upcoming.length - 1 ? `1px solid ${RULE}` : 'none',
                  }}>
                    {/* Date block */}
                    <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{dayAbbr}</div>
                      <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.1 }}>{dayNum}</div>
                      <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{month}</div>
                    </div>
                    {/* Thin rule */}
                    <div style={{ width: '1px', height: '42px', backgroundColor: RULE, flexShrink: 0 }} />
                    {/* Detail */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{getShortCourseLabel(classType)}</div>
                      <div style={{ fontSize: '11px', color: MUTED }}>{timeStr}</div>
                    </div>
                    {/* Status badge */}
                    <span style={{
                      fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '4px 8px', backgroundColor: TC_LIGHT, color: TC_DARK, flexShrink: 0,
                    }}>
                      booked
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Past classes toggle */}
          {past.length > 0 && (
            <div>
              <button
                onClick={() => setShowPastClasses(v => !v)}
                style={{ marginTop: '12px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: MUTED }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                  {showPastClasses ? 'expand_less' : 'expand_more'}
                </span>
                Past classes ({past.length})
              </button>

              {showPastClasses && (
                <div style={{ marginTop: '8px' }}>
                  {past.map((booking, i) => {
                    const ci = booking.class_instances || {};
                    const classDate = new Date(ci.class_date || booking.class_date);
                    const classType = ci.class_type || booking.class_type || '';
                    const dayAbbr = classDate.toLocaleDateString('en-GB', { weekday: 'short' });
                    const dayNum  = classDate.toLocaleDateString('en-GB', { day: 'numeric' });
                    const month   = classDate.toLocaleDateString('en-GB', { month: 'short' });
                    const timeStr = ci.start_time
                      ? (ci.end_time ? `${ci.start_time} – ${ci.end_time}` : ci.start_time)
                      : '—';

                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '14px',
                        padding: '10px 0', opacity: 0.6,
                        borderBottom: i < past.length - 1 ? `1px solid ${RULE}` : 'none',
                      }}>
                        <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{dayAbbr}</div>
                          <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.1 }}>{dayNum}</div>
                          <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{month}</div>
                        </div>
                        <div style={{ width: '1px', height: '38px', backgroundColor: RULE, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{getShortCourseLabel(classType)}</div>
                          <div style={{ fontSize: '11px', color: MUTED }}>{timeStr}</div>
                        </div>
                        <span style={{
                          fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                          padding: '4px 8px', backgroundColor: '#EBEBEB', color: MUTED, flexShrink: 0,
                        }}>
                          attended
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        <Divider />

        {/* ── 4. MY GALLERY ── */}
        <section style={{ marginBottom: '28px' }}>
          <SectionLabel action actionHref="/gallery" actionLabel="View all">My Gallery</SectionLabel>

          {galleryPieces.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {galleryPieces.map((piece, i) => (
                <Link
                  key={i}
                  to="/gallery"
                  style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', backgroundColor: '#F0EDE9', cursor: 'pointer', display: 'block', textDecoration: 'none' }}
                >
                  {piece.imageUrl ? (
                    <img
                      src={piece.imageUrl}
                      alt={piece.title || `Pottery piece ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '48px', color: '#CCC' }}>local_fire_department</span>
                    </div>
                  )}
                  {piece.title && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'linear-gradient(to top, rgba(20,10,5,0.65) 0%, transparent 100%)',
                      padding: '24px 10px 8px',
                    }}>
                      <div style={{ fontSize: '11px', color: '#FFF', fontWeight: 600, letterSpacing: '0.02em' }}>{piece.title}</div>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: MUTED, margin: '0 0 4px' }}>No pieces uploaded yet.</p>
              <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Share your work with the studio community.</p>
            </div>
          )}

          <div style={{ marginTop: '12px' }}>
            <Link
              to="/upload"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                width: '100%', padding: '15px', border: 'none', cursor: 'pointer',
                backgroundColor: TC, color: '#FFFFFF', textDecoration: 'none',
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                boxSizing: 'border-box',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>add_photo_alternate</span>
              Upload a piece
            </Link>
          </div>
        </section>

        <Divider />

      </main>

      {/* ── BOTTOM TAB BAR ── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        backgroundColor: '#FFFFFF',
        borderTop: `1px solid ${RULE}`,
        display: 'flex',
        height: '60px',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {[
          { id: 'home',    label: 'Home',    icon: 'home',           href: '/'        },
          { id: 'classes', label: 'Classes', icon: 'calendar_month', href: '/classes'  },
          { id: 'gallery', label: 'Gallery', icon: 'photo_library',  href: '/gallery'  },
          { id: 'account', label: 'Account', icon: 'person',         href: '/account'  },
        ].map(tab => {
          const active = tab.id === 'home';
          return (
            <Link
              key={tab.id}
              to={tab.href}
              style={{
                flex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '2px', padding: '8px 0', position: 'relative', textDecoration: 'none',
              }}
            >
              {/* Active indicator line */}
              {active && (
                <span style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: '20px', height: '2px', backgroundColor: TC,
                }} />
              )}
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '22px',
                  color: active ? TC : '#BBBBBB',
                  fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
                  transition: 'color 0.15s ease',
                }}
              >
                {tab.icon}
              </span>
              <span style={{
                fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: active ? TC : '#BBBBBB',
                transition: 'color 0.15s ease',
              }}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>

    </div>
  );
}
