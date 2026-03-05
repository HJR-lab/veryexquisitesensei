import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api, { authAPI } from '../utils/api';
import { potteryAPI } from '../utils/api';
import { getCourseTypeInfo } from '../utils/courseTypes';
import {
  TC, TC_LIGHT, TC_DARK, INK, MUTED, RULE, ALT,
  SectionLabel, Divider, TopBar, BottomTabBar, ScrollBody, PageShell,
  ClassRow, getClassLabel,
} from '../components/SharedUI';

// ─── Membership badge ────────────────────────────────────────────────────────
const BADGE_TIERS = {
  '1':  { label: 'Bronze',  bg: '#CD7F32', color: '#FFFFFF' },
  '6':  { label: 'Silver',  bg: '#A0A0A0', color: '#FFFFFF' },
  '12': { label: 'Gold',    bg: '#D4A017', color: '#FFFFFF' },
};

function getMemberBadge(membershipType) {
  if (!membershipType) return null;
  const match = membershipType.match(/(\d+)\s*month/i);
  if (!match) return null;
  return BADGE_TIERS[match[1]] || BADGE_TIERS['1'];
}

function MemberBadge({ membershipType, style = {} }) {
  const tier = getMemberBadge(membershipType);
  if (!tier) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '2px 7px', backgroundColor: tier.bg, color: tier.color,
      verticalAlign: 'middle', ...style,
    }}>
      {tier.label}
    </span>
  );
}

const STUDENT_TABS = [
  { id: 'home',    label: 'Home',    icon: 'home',           href: '/'        },
  { id: 'classes', label: 'Classes', icon: 'calendar_month', href: '/classes'  },
  { id: 'gallery', label: 'Gallery', icon: 'photo_library',  href: '/gallery'  },
  { id: 'account', label: 'Account', icon: 'person',         href: '/account'  },
];

// Student Dashboard uses "Beginners/Ext" variant
function getShortCourseLabel(classType) {
  if (!classType) return '';
  if (classType.includes('6.6') || classType.includes('7.7')) return 'Glazing';
  if (classType.startsWith('WT')) return 'Wheelthrowing Beginners/Ext';
  if (classType.startsWith('HB')) return 'Handbuilding';
  return classType.split('.')[0];
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const isImpersonating = user && user.impersonatedBy;

  const handleReturnToAdmin = async () => {
    if (user && user.originalAdminToken) {
      try {
        localStorage.setItem('token', user.originalAdminToken);
        const adminData = await authAPI.getMe();
        updateUser(adminData.user);
        navigate('/admin/students');
      } catch (error) {
        console.error('Error returning to admin:', error);
        window.location.reload();
      }
    }
  };
  const [studentData, setStudentData] = useState(null);
  const [galleryPieces, setGalleryPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [showPastClasses, setShowPastClasses] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [membershipData, setMembershipData] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [dashboardResponse, potteryData, eventsRes, membershipRes] = await Promise.all([
        api.get('/students/me/dashboard'),
        potteryAPI.getPieces(),
        api.get('/events/upcoming').catch(() => ({ data: { events: [] } })),
        api.get('/membership/my-membership').catch(() => ({ data: { hasMembership: false } })),
      ]);
      setUpcomingEvents(eventsRes.data.events || []);
      setMembershipData(membershipRes.data);

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
          all.push({ ...booking, _courseTitle: enrollment.course_title });
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

  const firstName = studentData?.first_name || user?.firstName || user?.email?.split('@')[0] || 'Student';

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <PageShell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <span style={{ fontSize: '13px', color: MUTED, letterSpacing: '0.06em' }}>Loading…</span>
        </div>
      </PageShell>
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
    const bookedCount = enrollmentBookings.filter(b => b.status === 'booked').length;
    const remaining = Math.max(totalClasses - attendedCount, 0);
    const pct = totalClasses > 0 ? Math.min(Math.round((attendedCount / totalClasses) * 100), 100) : 0;

    // Determine course type label
    const courseTitle = enrollment.course_title || '';
    const classType = enrollment.class_type || '';
    const weeks = enrollment.number_of_weeks || totalClasses;
    const is10ClassPkg = totalClasses === 10 && !enrollment.course_expiry_date;

    let typeLabel = 'Course';
    if (is10ClassPkg) {
      typeLabel = 'Wheelthrowing / Handbuilding';
    } else {
      const lower = (classType + ' ' + courseTitle).toLowerCase();
      const isWT = classType.startsWith('WT') || lower.includes('wheel');
      const isHB = classType.startsWith('HB') || lower.includes('handbuild');
      if (isWT) typeLabel = 'Wheelthrowing Beginners/Ext';
      else if (isHB) typeLabel = 'Handbuilding';
    }

    // Status badge
    const { active: activeEnrollments = [], upcoming: upcomingEnrollments = [] } = dashboardData?.enrollments || {};
    let statusLabel = 'enrolled';
    if (activeEnrollments.find(e => e.id === enrollment.id)) statusLabel = 'active';
    else if (upcomingEnrollments.find(e => e.id === enrollment.id)) statusLabel = 'upcoming';
    else if ((dashboardData?.enrollments?.completed || []).find(e => e.id === enrollment.id)) statusLabel = 'completed';

    return { enrollment, totalClasses, attendedCount, bookedCount, remaining, pct, typeLabel, statusLabel };
  });

  // Greeting course count line: unique types, sum remaining
  const greetingCounts = enrollmentsWithCounts.reduce((acc, { typeLabel, remaining }) => {
    if (!acc[typeLabel]) acc[typeLabel] = 0;
    acc[typeLabel] += remaining;
    return acc;
  }, {});
  const greetingEntries = Object.entries(greetingCounts);

  return (
    <PageShell>

      {/* ── IMPERSONATION BANNER ── */}
      {isImpersonating && (
        <div style={{ backgroundColor: '#EBF5FB', borderBottom: '1px solid #AED6F1', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: '#2471A3' }}>
            Viewing as <strong>{user.firstName} {user.lastName}</strong>
          </span>
          <button
            onClick={handleReturnToAdmin}
            style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 10px', backgroundColor: '#2471A3', color: '#FFF', border: 'none', cursor: 'pointer' }}
          >
            Return to Admin
          </button>
        </div>
      )}

      {/* ── MEMBERSHIP BANNER ── */}
      {membershipData?.hasMembership ? (
        <div style={{ backgroundColor: TC_LIGHT, width: '100%' }}>
          <div style={{
            maxWidth: '520px', margin: '0 auto', padding: '9px 20px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
              color: '#FFFFFF', backgroundColor: TC_DARK, padding: '2px 6px', flexShrink: 0,
            }}>
              Ves · Clay Club
            </span>
            <span style={{ fontSize: '11px', color: INK, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {membershipData.membership.type.replace(/^Clay Club\s*/i, '').replace(/1 Months/i, '1 Month').trim() + ' Member'}
              {membershipData.membership.daysRemaining > 0
                ? ` · ${membershipData.membership.daysRemaining} days left`
                : ' · Expires soon'}
            </span>
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TC_DARK, flexShrink: 0 }}>
              Active
            </span>
          </div>
        </div>
      ) : (
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
      )}

      <TopBar />

      <ScrollBody>

        {/* ── 1. GREETING ── */}
        <div style={{ padding: '32px 0 24px', borderBottom: `1px solid ${RULE}`, marginBottom: '28px', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.05, margin: '0 0 10px' }}>
              Hi {firstName}.{membershipData?.hasMembership && (
                <MemberBadge membershipType={membershipData.membership.type} style={{ marginLeft: '10px', position: 'relative', top: '-4px' }} />
              )}
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
          {upcomingEvents.length > 0 && (() => {
            const evt = upcomingEvents[0];
            const isOngoing = evt.status === 'active';
            const evtDate = evt.date ? new Date(evt.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
            return (
              <div style={{
                flexShrink: 0, width: '150px',
                backgroundColor: TC_LIGHT, border: `1px solid ${TC}`,
                padding: '12px', textAlign: 'center',
              }}>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC_DARK, marginBottom: '6px' }}>
                  {isOngoing ? 'Ongoing' : 'Upcoming Event'}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: INK, lineHeight: 1.3, marginBottom: '4px' }}>
                  {evt.title}
                </div>
                {evt.description && (
                  <div style={{ fontSize: '11px', color: INK, lineHeight: 1.4, marginBottom: '4px' }}>{evt.description}</div>
                )}
                {!isOngoing && evtDate && (
                  <div style={{ fontSize: '12px', color: TC_DARK, fontWeight: 600 }}>{evtDate}</div>
                )}
                {evt.link && (
                  <a
                    href={evt.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-block', marginTop: '6px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TC, textDecoration: 'none', borderBottom: `1px solid ${TC}`, paddingBottom: '1px' }}
                  >
                    More info →
                  </a>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── 1b. MEMBERSHIP CARD ── */}
        {membershipData?.hasMembership && (() => {
          const m = membershipData.membership;
          const monthMatch = (m.type || '').match(/(\d+)/);
          const months = monthMatch ? parseInt(monthMatch[1]) : 3;
          const tier = months >= 12 ? 'Gold' : months >= 6 ? 'Silver' : 'Bronze';
          const tierColors = { Bronze: '#CD7F32', Silver: '#A0A0A0', Gold: '#D4A017' };
          const daysLeft = m.daysRemaining || 0;
          const totalDays = m.startDate && m.endDate ? Math.ceil((new Date(m.endDate) - new Date(m.startDate)) / (1000 * 60 * 60 * 24)) : 1;
          const pctUsed = totalDays > 0 ? Math.min(100, Math.max(0, Math.round(((totalDays - Math.max(daysLeft, 0)) / totalDays) * 100))) : 100;
          const DEFAULT_PERKS = {
            1:  ['Unlimited studio access', 'Free dedicated storage', 'Free shelving space', 'All studio glazes included'],
            3:  ['Unlimited studio access', 'Free dedicated storage', 'Free shelving space', 'All studio glazes included'],
            6:  ['Unlimited studio access', 'Free dedicated storage', 'Free shelving space', 'All studio glazes included', 'Studio-assisted clay reclaim', 'FREE 1x Firing (worth $90)', '10% off clay, tools, firing & courses'],
            12: ['Unlimited studio access', 'Free dedicated storage', 'Free shelving space', 'All studio glazes included', 'Studio-assisted clay reclaim', 'FREE 2x $130 Firing Basket (worth $260)', '10% off clay, tools, firing & courses'],
          };
          const perks = DEFAULT_PERKS[months] || DEFAULT_PERKS[3];

          return (
            <section style={{ marginBottom: '28px' }}>
              <SectionLabel>Membership</SectionLabel>
              <div style={{ padding: '16px', border: `1px solid ${RULE}`, backgroundColor: ALT }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>
                      {m.type?.replace(/^Clay Club\s*/i, '') || m.type}
                    </span>
                    <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 6px', backgroundColor: tierColors[tier], color: '#FFF' }}>{tier}</span>
                  </div>
                  <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 6px', backgroundColor: TC_LIGHT, color: TC_DARK }}>active</span>
                </div>

                {/* Dates */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Start</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{m.startDate ? new Date(m.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>End</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: daysLeft <= 30 ? '#9E6200' : INK }}>{m.endDate ? new Date(m.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</div>
                  </div>
                </div>

                {/* Progress */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: MUTED, marginBottom: '5px' }}>
                    <span>{daysLeft > 0 ? `${daysLeft} days left` : 'Expired'}</span>
                    <span>{pctUsed}%</span>
                  </div>
                  <div style={{ height: '3px', backgroundColor: 'rgba(40,40,40,0.1)', position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '3px', width: `${pctUsed}%`, backgroundColor: daysLeft <= 30 ? '#E6A817' : TC, transition: 'width 0.3s' }} />
                  </div>
                </div>

                {/* Perks */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {perks.map((p, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '3px 8px', backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, color: INK }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '13px', color: TC }}>check_circle</span>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          );
        })()}

        {enrollmentsWithCounts.length > 0 && <Divider />}

        {/* ── 2. MY COURSES ── */}
        {enrollmentsWithCounts.length > 0 && (
          <section style={{ marginBottom: '28px' }}>
            <SectionLabel>My Courses</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              {[...enrollmentsWithCounts].sort((a, b) => {
                const aWT = a.typeLabel.startsWith('Wheelthrowing');
                const bWT = b.typeLabel.startsWith('Wheelthrowing');
                return aWT === bWT ? 0 : aWT ? -1 : 1;
              }).map(({ enrollment, totalClasses, attendedCount, bookedCount, pct, typeLabel, statusLabel }, i) => {
                const isActive = statusLabel === 'active';
                return (
                  <div key={enrollment.id || i} style={{ padding: '14px', border: `1px solid ${RULE}`, backgroundColor: ALT, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: INK, lineHeight: '1.3' }}>
                        {enrollment.course_title || typeLabel}
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div>
                        <div style={{ fontSize: '13px', color: MUTED, marginBottom: '6px' }}>
                          Booked: <strong style={{ color: INK }}>{bookedCount}/{totalClasses}</strong>
                        </div>
                        <div style={{ height: '2px', backgroundColor: 'rgba(40,40,40,0.1)', position: 'relative' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '2px', width: `${totalClasses > 0 ? Math.round((bookedCount / totalClasses) * 100) : 0}%`, backgroundColor: TC }} />
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', color: MUTED, marginBottom: '6px' }}>
                          Attended: <strong style={{ color: INK }}>{attendedCount}/{totalClasses}</strong>
                        </div>
                        <div style={{ height: '2px', backgroundColor: 'rgba(40,40,40,0.1)', position: 'relative' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '2px', width: `${pct}%`, backgroundColor: TC }} />
                        </div>
                      </div>
                    </div>
                    {enrollment.package_total_courses === 3 && typeLabel.startsWith('Wheelthrowing') && (
                      <div style={{ fontSize: '11px', color: studentData?.wheel_preference ? TC_DARK : MUTED, fontWeight: 600 }}>
                        Wheel #{studentData?.wheel_preference || '—'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {dashboardData?.packageInfo?.totalCourses > 1 && (() => {
              const pkg = dashboardData.packageInfo;
              const currentCourse = pkg.currentCourse || (pkg.totalCourses - (pkg.coursesRemaining || 0));
              return (
                <div style={{ marginTop: '10px', fontSize: '11px', color: MUTED }}>
                  <span style={{ color: TC_DARK, fontWeight: 600 }}>Course {currentCourse} of {pkg.totalCourses}</span>
                  {pkg.coursesRemaining > 0 && (
                    <span> · {pkg.coursesRemaining} more course{pkg.coursesRemaining > 1 ? 's' : ''} remaining</span>
                  )}
                </div>
              );
            })()}
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
                const ct = ci.class_type || booking.class_type || '';
                const isGlazing = ct.includes('6.6') || ct.includes('7.7');
                return (
                  <ClassRow
                    key={i}
                    dateStr={ci.class_date || booking.class_date}
                    classType={isGlazing ? ct : (booking._courseTitle || ct)}
                    startTime={ci.start_time}
                    endTime={ci.end_time}
                    subtitle={ci.instructor}
                    isLast={i === upcoming.length - 1}
                    badge={{ label: 'booked', bg: TC_LIGHT, color: TC_DARK }}
                  />
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
                    const ct = ci.class_type || booking.class_type || '';
                    const isGlazing = ct.includes('6.6') || ct.includes('7.7');
                    return (
                      <ClassRow
                        key={i}
                        dateStr={ci.class_date || booking.class_date}
                        classType={isGlazing ? ct : (booking._courseTitle || ct)}
                        startTime={ci.start_time}
                        endTime={ci.end_time}
                        subtitle={ci.instructor}
                        dimmed
                        isLast={i === past.length - 1}
                        badge={{ label: 'attended', bg: '#EBEBEB', color: MUTED }}
                      />
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

      </ScrollBody>

      <BottomTabBar tabs={STUDENT_TABS} activeId="home" />

    </PageShell>
  );
}
