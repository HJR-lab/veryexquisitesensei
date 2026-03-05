import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import {
  TC, TC_LIGHT, TC_DARK, INK, MUTED, RULE, ALT,
  SectionLabel, Divider, TopBar, BottomTabBar, ScrollBody, PageShell,
} from '../components/SharedUI';

// ─── Tier colors ──────────────────────────────────────────────────────────────
const TIER_STYLE = {
  Bronze: { bg: '#CD7F32', color: '#FFFFFF' },
  Silver: { bg: '#A0A0A0', color: '#FFFFFF' },
  Gold:   { bg: '#D4A017', color: '#FFFFFF' },
};

const MEMBER_TABS = [
  { id: 'home',    label: 'Home',    icon: 'home',           href: '/member'  },
  { id: 'gallery', label: 'Gallery', icon: 'photo_library',  href: '/gallery' },
  { id: 'account', label: 'Account', icon: 'person',         href: '/account' },
];

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MemberDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/membership/dashboard')
      .then(res => setData(res.data))
      .catch(err => console.error('Error fetching member dashboard:', err))
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.firstName || user?.email?.split('@')[0] || 'Member';

  if (loading) {
    return (
      <PageShell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <span style={{ fontSize: '13px', color: MUTED, letterSpacing: '0.06em' }}>Loading...</span>
        </div>
      </PageShell>
    );
  }

  // If no membership, redirect to student dashboard
  if (!data?.hasMembership) {
    return (
      <PageShell>
        <TopBar />
        <ScrollBody>
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: MUTED, marginBottom: '16px' }}>No active membership found.</div>
            <Link to="/membership" style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TC, textDecoration: 'none', borderBottom: `1px solid ${TC}`, paddingBottom: '1px' }}>
              View membership plans
            </Link>
          </div>
        </ScrollBody>
        <BottomTabBar tabs={MEMBER_TABS} activeId="home" />
      </PageShell>
    );
  }

  const m = data.membership;
  const tierStyle = TIER_STYLE[m.tier] || TIER_STYLE.Bronze;

  return (
    <PageShell>

      {/* Membership banner */}
      <div style={{ backgroundColor: TC_LIGHT, width: '100%' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '9px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#FFFFFF', backgroundColor: TC_DARK, padding: '2px 6px', flexShrink: 0 }}>
            Ves Clay Club
          </span>
          <span style={{ fontSize: '11px', color: INK, flex: 1 }}>
            {m.tier} Member
          </span>
          <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TC_DARK, flexShrink: 0 }}>
            Active
          </span>
        </div>
      </div>

      <TopBar />

      <ScrollBody>

        {/* 1. Greeting */}
        <div style={{ padding: '32px 0 24px', borderBottom: `1px solid ${RULE}`, marginBottom: '28px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.05, margin: '0 0 10px' }}>
            Welcome back, {firstName}.
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px', marginLeft: '10px',
              fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '2px 7px', backgroundColor: tierStyle.bg, color: tierStyle.color,
              verticalAlign: 'middle', position: 'relative', top: '-4px',
            }}>
              {m.tier}
            </span>
          </h1>
          <div style={{ fontSize: '14px', color: MUTED }}>
            {m.daysRemaining} days remaining on your {m.type.replace(/^Clay Club\s*/i, '')} plan
          </div>
        </div>

        {/* 2. Membership Card */}
        <section style={{ marginBottom: '28px' }}>
          <SectionLabel>Membership</SectionLabel>
          <div style={{ padding: '18px', border: `1px solid ${RULE}`, backgroundColor: ALT }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>
                {m.type}
              </div>
              <span style={{
                fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '3px 6px', backgroundColor: TC_LIGHT, color: TC_DARK,
              }}>
                active
              </span>
            </div>

            {/* Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Start</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{fmtDate(m.startDate)}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>End</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{fmtDate(m.endDate)}</div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: MUTED, marginBottom: '6px' }}>
                <span>{m.daysRemaining} days left</span>
                <span>{m.progressPct}%</span>
              </div>
              <div style={{ height: '3px', backgroundColor: 'rgba(40,40,40,0.1)', position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '3px', width: `${m.progressPct}%`, backgroundColor: TC, transition: 'width 0.3s' }} />
              </div>
            </div>
          </div>
        </section>

        <Divider />

        {/* 3. Perks */}
        <section style={{ marginBottom: '28px' }}>
          <SectionLabel>Your Perks</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {(m.perks || []).map((perk, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '11px 0',
                borderBottom: i < m.perks.length - 1 ? `1px solid ${RULE}` : 'none',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: TC }}>check_circle</span>
                <span style={{ fontSize: '13px', color: INK }}>{perk}</span>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* 4. Gallery */}
        <section style={{ marginBottom: '28px' }}>
          <SectionLabel action actionHref="/gallery" actionLabel="View all">My Gallery</SectionLabel>
          {data.gallery && data.gallery.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {data.gallery.map((piece, i) => (
                <Link key={i} to="/gallery" style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', backgroundColor: '#F0EDE9', display: 'block', textDecoration: 'none' }}>
                  {piece.imageUrl ? (
                    <img src={piece.imageUrl} alt={piece.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '48px', color: '#CCC' }}>local_fire_department</span>
                    </div>
                  )}
                  {piece.title && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(20,10,5,0.65) 0%, transparent 100%)', padding: '24px 10px 8px' }}>
                      <div style={{ fontSize: '11px', color: '#FFF', fontWeight: 600 }}>{piece.title}</div>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: MUTED, margin: '0 0 4px' }}>No pieces uploaded yet.</p>
            </div>
          )}

          <div style={{ marginTop: '12px' }}>
            <Link to="/upload" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              width: '100%', padding: '15px', border: 'none', cursor: 'pointer',
              backgroundColor: TC, color: '#FFFFFF', textDecoration: 'none',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', boxSizing: 'border-box',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>add_photo_alternate</span>
              Upload a piece
            </Link>
          </div>
        </section>

        <Divider />

        {/* 5. Cross-link to student dashboard if has enrollments */}
        {data.hasActiveEnrollments && (
          <section style={{ marginBottom: '28px' }}>
            <Link to="/dashboard" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px', border: `1px solid ${RULE}`, backgroundColor: ALT,
              textDecoration: 'none', color: INK,
            }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '4px' }}>Student Dashboard</div>
                <div style={{ fontSize: '13px', color: INK }}>View your course bookings and classes</div>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: MUTED }}>chevron_right</span>
            </Link>
          </section>
        )}

      </ScrollBody>

      <BottomTabBar tabs={MEMBER_TABS} activeId="home" />
    </PageShell>
  );
}
