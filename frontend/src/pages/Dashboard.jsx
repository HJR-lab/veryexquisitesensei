import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import { potteryAPI } from '../utils/api';
import { getCourseTypeInfo } from '../utils/courseTypes';
import { getCourseDetails, STUDIO_ADDRESS, STUDIO_MAP_URL, STUDIO_POLICIES } from '../utils/courseDetails';
import {
  TC, TC_LIGHT, TC_DARK, INK, MUTED, RULE, ALT,
  SectionLabel, Divider, TopBar, BottomTabBar, ScrollBody, PageShell,
  ClassRow, getClassLabel,
} from '../components/SharedUI';
import WheelPicker from '../components/WheelPicker';

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
  { id: 'home',    label: 'Home',    icon: 'home',           href: '/'              },
  { id: 'classes', label: 'Classes', icon: 'calendar_month', href: '/classes'       },
  { id: 'studio',  label: 'Studio',  icon: 'door_open',      href: '/studio-access' },
  { id: 'gallery', label: 'Gallery', icon: 'photo_library',  href: '/gallery'       },
  { id: 'account', label: 'Account', icon: 'person',         href: '/account'       },
];

// Student Dashboard uses "Beginners/Ext" variant
function getShortCourseLabel(classType) {
  if (!classType) return '';
  if (classType.includes('6.6') || classType.includes('7.7')) return 'Glazing';
  if (classType.startsWith('WT')) {
    const match = classType.match(/_\w+(\d)\./);
    if (match && match[1] === '7') return 'Wheelthrowing Intermediate 7 Weeks';
    return 'Wheelthrowing Beginners/Ext 6 Weeks';
  }
  if (classType.startsWith('HB')) return 'Handbuilding';
  return classType.split('.')[0];
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [studentData, setStudentData] = useState(null);
  const [galleryPieces, setGalleryPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [showPastClasses, setShowPastClasses] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [membershipData, setMembershipData] = useState(null);
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showCompletedCourses, setShowCompletedCourses] = useState(false);
  const [creditBalance, setCreditBalance] = useState(null);
  const [wheelSelections, setWheelSelections] = useState({});

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [dashboardResponse, potteryData, eventsRes, membershipRes, creditRes] = await Promise.all([
        api.get('/students/me/dashboard'),
        potteryAPI.getPieces(),
        api.get('/events/upcoming').catch(() => ({ data: { events: [] } })),
        api.get('/membership/my-membership').catch(() => ({ data: { hasMembership: false } })),
        api.get(`/credits/balance/${user?.dbCustomerId}`).catch(() => ({ data: { balance: 0 } })),
      ]);
      setUpcomingEvents(eventsRes.data.events || []);
      setMembershipData(membershipRes.data);
      setCreditBalance(creditRes.data?.balance ?? 0);

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
      // Skip bookings from courses awaiting confirmation (draft classes)
      if (enrollment.pendingThreshold) return;
      if (enrollment.bookings && Array.isArray(enrollment.bookings)) {
        const isHB = (enrollment.course_type || '').toLowerCase().includes('handbuilding');
        const totalCredits = enrollment.class_credits_allocated || enrollment.number_of_weeks || 0;
        // Sort this enrollment's bookings by date to find the last one
        const sorted = [...enrollment.bookings].sort((a, b) => {
          return new Date(a.class_instances?.class_date) - new Date(b.class_instances?.class_date);
        });
        // For HB students: last class is always glazing (when all credits are booked)
        const lastBookingId = (isHB && sorted.length >= totalCredits && sorted.length > 0)
          ? sorted[sorted.length - 1].id
          : null;

        const hbWeeks = enrollment.number_of_weeks || enrollment.class_credits_allocated || '';
        enrollment.bookings.forEach(booking => {
          const ct = booking.class_instances?.class_type || '';
          let displayTitle;
          if (ct.startsWith('HB')) {
            displayTitle = `Handbuilding`;
          } else if (ct.startsWith('WT')) {
            const weekMatch = ct.match(/_\w+(\d)\./);
            displayTitle = weekMatch && weekMatch[1] === '7' ? 'Wheelthrowing Intermediate 7 Weeks' : 'Wheelthrowing Beginners/Ext 6 Weeks';
          } else if (isHB) {
            displayTitle = `Handbuilding ${hbWeeks} Weeks`;
          } else {
            displayTitle = enrollment.course_title;
          }
          all.push({
            ...booking,
            _courseTitle: displayTitle,
            _isHBGlazing: booking.id === lastBookingId,
          });
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
    const now = new Date();

    const upcoming = [];
    const past = [];

    allBookings.forEach(booking => {
      if (!booking.class_instances) return;
      const ci = booking.class_instances;
      const classDate = new Date(ci.class_date);
      classDate.setHours(0, 0, 0, 0);

      // If class is on a past day, it's past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (classDate < today) {
        past.push(booking);
      } else if (classDate.getTime() === today.getTime() && ci.end_time) {
        // Today's class: check if end_time has passed
        const timeStr = ci.end_time.trim().toLowerCase();
        const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
        if (match) {
          let h = parseInt(match[1], 10);
          const mins = parseInt(match[2] || '0', 10);
          const ampm = match[3];
          if (ampm === 'pm' && h !== 12) h += 12;
          if (ampm === 'am' && h === 12) h = 0;
          const endDate = new Date(now);
          endDate.setHours(h, mins, 0, 0);
          if (now > endDate) {
            past.push(booking);
          } else {
            upcoming.push(booking);
          }
        } else {
          upcoming.push(booking);
        }
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
  // Helper: check if a booking's class has ended (for today's classes, checks end_time)
  const isBookingClassOver = (b) => {
    if (!b.class_instances) return false;
    const ci = b.class_instances;
    const now = new Date();
    const classDate = new Date(ci.class_date);
    classDate.setHours(0, 0, 0, 0);
    const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
    if (classDate < todayMid) return true;
    if (classDate > todayMid) return false;
    // Today: check end_time
    if (ci.end_time) {
      const match = ci.end_time.trim().toLowerCase().match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
      if (match) {
        let h = parseInt(match[1], 10);
        const mins = parseInt(match[2] || '0', 10);
        const ampm = match[3];
        if (ampm === 'pm' && h !== 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= mins);
      }
    }
    return false;
  };

  const enrollmentsWithCounts = enrollments.map(enrollment => {
    const is10Pkg = enrollment.number_of_weeks === 10 && (enrollment.total_weeks === 6 || enrollment.class_credits_allocated === 4);
    const totalClasses = is10Pkg ? 10 : (enrollment.class_credits_allocated || enrollment.number_of_weeks || 6);
    const enrollmentBookings = enrollment.bookings || [];
    const bookingAttendedCount = enrollmentBookings.filter(b => {
      if (b.status === 'attended' || b.status === 'completed') return true;
      if (b.status === 'booked') return isBookingClassOver(b);
      return false;
    }).length;
    const attendedCount = enrollmentBookings.length > 0 ? bookingAttendedCount : (enrollment.class_credits_used || 0);
    // For HB credit courses, "booked" = credits used (attended + currently booked)
    const isHBCredit = (enrollment.course_type || '').toLowerCase().includes('handbuilding');
    const bookedCount = isHBCredit
      ? (enrollment.class_credits_used || attendedCount)
      : enrollmentBookings.filter(b => b.status === 'booked' || b.status === 'attended' || b.status === 'completed').length;
    const remaining = Math.max(totalClasses - attendedCount, 0);
    const pct = totalClasses > 0 ? Math.min(Math.round((attendedCount / totalClasses) * 100), 100) : 0;

    // Determine course type label
    const courseTitle = enrollment.course_title || '';
    const classType = enrollment.class_type || '';
    const weeks = enrollment.number_of_weeks || totalClasses;
    const is10ClassPkg = enrollment.number_of_weeks === 10 && !enrollment.course_expiry_date;

    let typeLabel = 'Course';
    if (is10ClassPkg) {
      typeLabel = `Wheelthrowing Beginners/Ext 6 Weeks 10 Class`;
    } else {
      const lower = (classType + ' ' + courseTitle).toLowerCase();
      const isWT = classType.startsWith('WT') || lower.includes('wheel');
      const isHB = classType.startsWith('HB') || lower.includes('handbuild');
      if (isWT) typeLabel = weeks === 7 ? `Wheelthrowing Intermediate 7 Weeks` : `Wheelthrowing Beginners/Ext 6 Weeks`;
      else if (isHB) typeLabel = `Handbuilding ${weeks} Weeks`;
    }

    // Status badge
    const { active: activeEnrollments = [], upcoming: upcomingEnrollments = [] } = dashboardData?.enrollments || {};
    let statusLabel = 'enrolled';
    if (enrollment.pendingThreshold) statusLabel = 'pending';
    else if (activeEnrollments.find(e => e.id === enrollment.id)) statusLabel = 'active';
    else if (upcomingEnrollments.find(e => e.id === enrollment.id)) statusLabel = 'upcoming';
    else if ((dashboardData?.enrollments?.completed || []).find(e => e.id === enrollment.id)) statusLabel = 'completed';

    return { enrollment, totalClasses, attendedCount, bookedCount, remaining, pct, typeLabel, statusLabel, is10Pkg };
  });

  // Greeting course count line: unique types, sum remaining
  const greetingCounts = enrollmentsWithCounts.reduce((acc, { typeLabel, remaining, enrollment, statusLabel }) => {
    // Exclude completed and awaiting confirmation courses from hero count
    if (statusLabel === 'completed' || statusLabel === 'pending') return acc;
    const isHB = (enrollment.course_type || '').toLowerCase().includes('handbuilding');
    if (!acc[typeLabel]) acc[typeLabel] = { remaining: 0, isHB: false };
    acc[typeLabel].remaining += remaining;
    if (isHB) acc[typeLabel].isHB = true;
    return acc;
  }, {});
  const greetingEntries = Object.entries(greetingCounts);

  return (
    <PageShell>

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: MUTED }}>
              {(() => {
                const currentCourse = enrollmentsWithCounts.find(e => e.statusLabel === 'active' || e.statusLabel === 'upcoming');
                return currentCourse ? <div>{currentCourse.typeLabel}</div> : null;
              })()}
              {nextClass && (
                <div>Next: <strong style={{ color: INK }}>{nextClass.date} {nextClass.time}</strong></div>
              )}
              {(() => {
                const flexEnrollment = enrollmentsWithCounts.find(e => {
                  return e.is10Pkg && (e.enrollment.class_credits_remaining > 0) && e.statusLabel !== 'completed';
                });
                return flexEnrollment ? (
                  <div>You have <strong style={{ color: INK }}>{flexEnrollment.enrollment.class_credits_remaining} class credit{flexEnrollment.enrollment.class_credits_remaining !== 1 ? 's' : ''}</strong> available</div>
                ) : null;
              })()}
              {creditBalance > 0 && (
                <div><strong style={{ color: INK }}>${creditBalance}</strong> Ves is 10 Credits</div>
              )}
              {dashboardData?.packageInfo?.totalCourses > 1 && (() => {
                const pkg = dashboardData.packageInfo;
                const used = pkg.totalCourses - (pkg.coursesRemaining || 0);
                return <div><strong style={{ color: INK }}>{pkg.coursesRemaining || 0} of {pkg.totalCourses}</strong> courses remaining</div>;
              })()}
              {dashboardData?.studioAccessPasses?.remaining > 0 && (
                <div><strong style={{ color: INK }}>{dashboardData.studioAccessPasses.remaining} of {dashboardData.studioAccessPasses.total}</strong> passes remaining</div>
              )}
            </div>
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

        {/* ── 2. MY COURSES ── */}
        {enrollmentsWithCounts.length > 0 && (() => {
          const currentCourses = enrollmentsWithCounts.filter(c => c.statusLabel !== 'completed');
          const completedCourses = enrollmentsWithCounts.filter(c => c.statusLabel === 'completed');
          const sortByType = (a, b) => {
            const aWT = a.typeLabel.startsWith('Wheelthrowing');
            const bWT = b.typeLabel.startsWith('Wheelthrowing');
            return aWT === bWT ? 0 : aWT ? -1 : 1;
          };
          const coursesToShow = [...currentCourses].sort(sortByType);
          return (
          <section style={{ marginBottom: '28px' }}>
            <SectionLabel>My Courses</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              {coursesToShow.map(({ enrollment, totalClasses, attendedCount, bookedCount, remaining, pct, typeLabel, statusLabel, is10Pkg }, i) => {
                const isActive = statusLabel === 'active';
                const isExpanded = expandedCourse === enrollment.id;
                const details = getCourseDetails(enrollment);
                const bookedPct = totalClasses > 0 ? Math.round((bookedCount / totalClasses) * 100) : 0;
                return (
                  <div key={enrollment.id || i} style={{ border: `1px solid ${RULE}`, backgroundColor: ALT, overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ padding: '12px 14px' }}>
                      {/* Row 1: Title + Status badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: enrollment.pendingThreshold ? '4px' : '8px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: INK, lineHeight: '1.3', flex: 1, minWidth: 0 }}>
                          {typeLabel}{enrollment.package_total_courses > 1 ? ` · ${enrollment.package_total_courses} Course` : ''}
                        </div>
                        <span style={{
                          fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                          padding: '3px 6px', flexShrink: 0,
                          backgroundColor: statusLabel === 'pending' ? '#FFF7E6' : isActive ? '#ECFDF5' : '#EBEBEB',
                          color: statusLabel === 'pending' ? '#9E6200' : isActive ? '#059669' : MUTED,
                        }}>
                          {statusLabel === 'pending' ? 'awaiting confirmation' : statusLabel}
                        </span>
                      </div>
                      {/* Row 2: Schedule (if pending) + Booked/Attended */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                        {enrollment.pendingThreshold ? (() => {
                          const bks = (enrollment.bookings || []).filter(b => b.class_instances).sort((a, b) => new Date(a.class_instances.class_date) - new Date(b.class_instances.class_date));
                          if (bks.length === 0) return null;
                          const first = bks[0].class_instances;
                          const last = bks[bks.length - 1].class_instances;
                          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                          const dayOfWeek = dayNames[new Date(first.class_date).getDay()] + 's';
                          const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                          return (
                            <div style={{ fontSize: '10px', color: MUTED, fontWeight: 600, flex: 1, minWidth: 0 }}>
                              {dayOfWeek.toUpperCase()} · {fmtDate(first.class_date)} – {fmtDate(last.class_date)} · {first.start_time || ''}–{first.end_time || ''}
                            </div>
                          );
                        })() : (
                          <button
                            onClick={() => setExpandedCourse(isExpanded ? null : enrollment.id)}
                            style={{
                              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                              fontSize: '11px', fontWeight: 600, color: TC, display: 'flex', alignItems: 'center', gap: '3px',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '14px', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                            {isExpanded ? 'Hide details' : 'Course details'}
                          </button>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <>
                            <div style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ fontSize: '10px', color: MUTED, marginBottom: '2px' }}>
                                Booked <strong style={{ color: INK }}>{bookedCount}/{totalClasses}</strong>
                              </div>
                              <div style={{ height: '2px', backgroundColor: 'rgba(40,40,40,0.08)' }}>
                                <div style={{ height: '2px', width: `${bookedPct}%`, backgroundColor: TC, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                            <div style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ fontSize: '10px', color: MUTED, marginBottom: '2px' }}>
                                Attended <strong style={{ color: INK }}>{attendedCount}/{totalClasses}</strong>
                              </div>
                              <div style={{ height: '2px', backgroundColor: 'rgba(40,40,40,0.08)' }}>
                                <div style={{ height: '2px', width: `${pct}%`, backgroundColor: TC, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          </>
                        </div>
                      </div>
                      {/* Flex credits remaining for 10-class packages */}
                      {is10Pkg && enrollment.class_credits_remaining > 0 && (
                        <div style={{ fontSize: '10px', color: TC_DARK, fontWeight: 600, textAlign: 'right', marginBottom: '4px' }}>
                          {enrollment.class_credits_remaining} class credit{enrollment.class_credits_remaining !== 1 ? 's' : ''} remaining
                        </div>
                      )}
                      {/* Course details toggle (separate row for non-pending) */}
                      {enrollment.pendingThreshold && (
                        <button
                          onClick={() => setExpandedCourse(isExpanded ? null : enrollment.id)}
                          style={{
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                            fontSize: '11px', fontWeight: 600, color: TC, display: 'flex', alignItems: 'center', gap: '3px',
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '14px', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                          {isExpanded ? 'Hide details' : 'Course details'}
                        </button>
                      )}
                      {enrollment.package_total_courses === 3 && typeLabel.startsWith('Wheelthrowing') && (() => {
                        const nextWTBooking = (enrollment.bookings || []).find(b => {
                          if (b.status !== 'booked') return false;
                          const cd = b.class_instances?.class_date;
                          return cd && new Date(cd) >= new Date(new Date().toDateString());
                        });
                        const hasLockedWheel = !!studentData?.wheel_preference;
                        return nextWTBooking ? (
                          <WheelPicker
                            classInstanceId={nextWTBooking.class_instances?.id}
                            bookingId={nextWTBooking.id}
                            currentWheel={wheelSelections[nextWTBooking.id] ?? nextWTBooking.wheel_number ?? studentData?.wheel_preference}
                            onSelect={(num) => setWheelSelections(prev => ({ ...prev, [nextWTBooking.id]: num }))}
                            locked={hasLockedWheel}
                          />
                        ) : (
                          <div style={{ fontSize: '11px', color: MUTED, fontWeight: 600, marginTop: '6px' }}>
                            Wheel #—
                          </div>
                        );
                      })()}
                    </div>

                    {/* Pending threshold message */}
                    {enrollment.pendingThreshold && (
                      <div style={{ padding: '10px 14px', backgroundColor: '#FFF7E6', borderTop: `1px solid #F0E4C8`, fontSize: '12px', color: '#6B4D00', lineHeight: 1.5 }}>
                        <strong>You're registered!</strong> We need a minimum of {enrollment.requiredStudents} students for this class to run. Currently {enrollment.currentStudents}/{enrollment.requiredStudents} enrolled. You'll receive a confirmation email once the class is confirmed.
                      </div>
                    )}

                    {/* Expandable course details — 3 sections */}
                    {isExpanded && details && (
                      <div style={{ fontSize: '12px', lineHeight: '1.7', color: INK }}>

                        {/* ── Section 1: Course Description ── */}
                        <div style={{ borderTop: `1px solid ${RULE}`, padding: '14px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TC, marginBottom: '10px' }}>Course Description</div>
                          {Array.isArray(details.description) ? details.description.map((block, j) => (
                            typeof block === 'string'
                              ? <p key={j} style={{ margin: '0 0 10px', color: '#555' }}>{block}</p>
                              : <div key={j} style={{ marginBottom: '10px' }}>
                                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED, marginBottom: '3px' }}>{block.heading}</div>
                                  {block.text && <p style={{ margin: 0, color: '#555' }}>{block.text}</p>}
                                  {block.items && <ul style={{ margin: '3px 0 0', paddingLeft: '16px', listStyleType: 'disc' }}>{block.items.map((item, k) => <li key={k} style={{ marginBottom: '1px', color: '#555', fontSize: '11px' }}>{item}</li>)}</ul>}
                                </div>
                          )) : (
                            <p style={{ margin: '0 0 10px', color: '#555' }}>{details.description}</p>
                          )}
                        </div>

                        {/* ── Studio Policy Link ── */}
                        <div style={{ borderTop: `1px solid ${RULE}`, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: INK, marginBottom: '2px' }}>Studio Policy</div>
                            <div style={{ fontSize: '11px', color: MUTED }}>Rules, fees, rescheduling &amp; attendance — must read</div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowPolicyModal(true); }}
                            style={{ padding: '8px 16px', backgroundColor: TC_LIGHT, border: `1px solid ${TC}`, cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: TC_DARK, flexShrink: 0 }}
                          >
                            View
                          </button>
                        </div>
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
                  <span style={{ color: TC_DARK, fontWeight: 600 }}>{pkg.coursesRemaining || 0} of {pkg.totalCourses} courses remaining</span>
                  {false && pkg.coursesRemaining > 0 && (
                    <span> · {pkg.coursesRemaining} more course{pkg.coursesRemaining > 1 ? 's' : ''} remaining</span>
                  )}
                </div>
              );
            })()}
          </section>
          );
        })()}

        {/* ── STUDIO ACCESS PASSES ── */}
        {dashboardData?.studioAccessPasses?.total > 0 && (
          <>
            <Divider />
            <section style={{ marginBottom: '28px' }}>
              <SectionLabel>Studio Access Passes</SectionLabel>
              <Link to="/studio-access" style={{ textDecoration: 'none' }}>
                <div style={{ padding: '16px', border: `1px solid ${RULE}`, backgroundColor: ALT, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: INK, marginBottom: '4px' }}>
                      {dashboardData.studioAccessPasses.remaining} of {dashboardData.studioAccessPasses.total} passes remaining
                    </div>
                    <div style={{ fontSize: '11px', color: MUTED }}>
                      Free studio access — no time limit per visit
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[...Array(dashboardData.studioAccessPasses.total)].map((_, i) => (
                      <div key={i} style={{
                        width: '12px', height: '12px', borderRadius: '50%',
                        backgroundColor: i < dashboardData.studioAccessPasses.remaining ? TC : '#DDD',
                      }} />
                    ))}
                  </div>
                </div>
              </Link>
            </section>
          </>
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
                const isWTGlazing = ct.includes('6.6') || ct.includes('7.7');
                const isGlazing = isWTGlazing || booking._isHBGlazing;
                return (
                  <ClassRow
                    key={i}
                    dateStr={ci.class_date || booking.class_date}
                    classType={isGlazing ? 'Glazing' : (booking._courseTitle || ct)}
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
                    const isWTGlazing = ct.includes('6.6') || ct.includes('7.7');
                    const isGlazing = isWTGlazing || booking._isHBGlazing;
                    return (
                      <ClassRow
                        key={i}
                        dateStr={ci.class_date || booking.class_date}
                        classType={isGlazing ? 'Glazing' : (booking._courseTitle || ct)}
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
                      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                    />
                  ) : null}
                  <div style={{ width: '100%', height: '100%', display: piece.imageUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '48px', color: '#CCC' }}>local_fire_department</span>
                  </div>
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

      {/* ── STUDIO POLICY MODAL ── */}
      {showPolicyModal && (
        <>
          <div onClick={() => setShowPolicyModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 70 }} />
          <div style={{
            position: 'fixed', inset: '5vh 0', zIndex: 71,
            maxWidth: '520px', margin: '0 auto', backgroundColor: '#fff',
            borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${RULE}`, flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: INK }}>Rules and Regulations</h2>
              <button onClick={() => setShowPolicyModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: MUTED }}>close</span>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', fontSize: '13px', lineHeight: '1.7', color: INK }}>
              {Object.values(STUDIO_POLICIES).map((section, i) => (
                <div key={i} style={{ marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 6px', color: INK }}>{section.title}</h3>
                  {section.content && <p style={{ margin: 0, color: '#555' }}>{section.content}</p>}
                  {section.items && (
                    <ul style={{ margin: '4px 0 0', paddingLeft: '16px', listStyleType: 'disc' }}>
                      {section.items.map((item, j) => <li key={j} style={{ marginBottom: '1px', color: '#555' }}>{item}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

    </PageShell>
  );
}
