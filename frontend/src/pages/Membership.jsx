import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const TIERS = [
  {
    id: '1m',
    label: '1 Month',
    price: '$350',
    perMonth: '$350/month',
    save: null,
    tag: null,
    perks: [
      'Unlimited studio access',
      'Free dedicated storage',
      'Free shelving space',
      'All studio glazes included',
      'Cancel anytime',
    ],
    href: 'https://ves.sg/products/ves-clay-club-studio-access?selling_plan=1864204446&variant=44974901362846',
  },
  {
    id: '6m',
    label: '6 Months',
    price: '$1,365',
    original: '$2,100',
    originalCalc: '6 Months x $350 = $2,100',
    perMonth: '$210/month',
    perMonthNote: 'incl. firing value',
    save: 'SAVE $825!',
    saveBreakdown: '$735 off + $90 firing',
    tag: null,
    perks: [
      'Unlimited studio access',
      'Free dedicated storage',
      'Free shelving space',
      'All studio glazes included',
      'Studio-assisted clay reclaim',
      'FREE 1x Firing (worth $90)',
      '10% off clay, tools, firing & courses',
      '10% off membership renewal',
      'Cancel anytime',
    ],
    href: 'https://ves.sg/products/ves-clay-club-studio-access?variant=44974901428382&selling_plan=1345323166',
  },
  {
    id: '12m',
    label: '12 Months',
    price: '$1,995',
    original: '$4,200',
    originalCalc: '12 Months x $350 = $4,200',
    perMonth: '$145/month',
    perMonthNote: 'incl. firing value',
    save: 'SAVE $2,465!',
    saveBreakdown: '$2,205 off + $260 firing',
    tag: 'Best Value',
    perks: [
      'Unlimited studio access',
      'Free dedicated storage',
      'Free shelving space',
      'All studio glazes included',
      'Studio-assisted clay reclaim',
      'FREE 2x $130 Firing Basket (worth $260)',
      '10% off clay, tools, firing & courses',
      '10% off membership renewal',
      'Cancel anytime',
    ],
    href: 'https://ves.sg/products/ves-clay-club-studio-access?variant=44974901461150&selling_plan=3259367582',
  },
];

const HOURS = [
  { day: 'Monday',    time: '11:00 AM – 6:00 PM' },
  { day: 'Tuesday',   time: '10:00 AM – 6:00 PM' },
  { day: 'Wednesday', time: '10:00 AM – 6:00 PM' },
  { day: 'Thursday',  time: '10:00 AM – 6:00 PM' },
  { day: 'Friday',    time: '12:00 PM – 8:00 PM'  },
  { day: 'Saturday',  time: '4:00 PM – 8:00 PM'   },
  { day: 'Sunday',    time: '12:00 PM – 8:00 PM'  },
];

const TABS = [
  { id: 'home',    label: 'Home',    icon: 'home',           href: '/dashboard' },
  { id: 'classes', label: 'Classes', icon: 'calendar_month', href: '/classes' },
  { id: 'gallery', label: 'Gallery', icon: 'photo_library',  href: '/gallery' },
  { id: 'account', label: 'Account', icon: 'person',         href: '/account' },
];

function getActiveTab() {
  const path = window.location.pathname;
  if (path.startsWith('/dashboard')) return 'home';
  if (path.startsWith('/classes'))   return 'classes';
  if (path.startsWith('/gallery'))   return 'gallery';
  if (path.startsWith('/account'))   return 'account';
  return null;
}

export default function Membership() {
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState('6m');

  useEffect(() => {
    fetchMembership();
  }, []);

  const fetchMembership = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await axios.get(`${API_URL}/api/membership/my-membership`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.hasMembership) {
        setMembership(response.data.membership);
      }
    } catch (error) {
      console.error('Error fetching membership:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const activeTab = getActiveTab();

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>

      {/* TOP BAR */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES"
            style={{ height: '26px', width: 'auto' }}
          />
        </div>
      </header>

      <main style={{ maxWidth: '520px', margin: '0 auto', padding: '0 0 88px' }}>

        {/* Hero */}
        <div style={{ padding: '36px 20px 28px', borderBottom: `1px solid ${RULE}` }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: TC, marginBottom: '10px' }}>
            VES • Clay Club
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.05, margin: '0 0 10px' }}>
            Unlimited studio access.
          </h1>
          <p style={{ fontSize: '14px', color: MUTED, lineHeight: 1.6, margin: 0 }}>
            Create at your own pace, whenever inspiration strikes. Open 7 days a week.
          </p>
        </div>

        {/* Active Membership Card */}
        {!loading && membership && (
          <div style={{ margin: '20px 20px 0', border: `1px solid ${TC}`, backgroundColor: TC_LIGHT, padding: '20px' }}>
            {/* Plan header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '22px', color: TC, fontVariationSettings: "'FILL' 1" }}
              >
                workspace_premium
              </span>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC_DARK, marginBottom: '2px' }}>
                  Active Membership
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: INK, lineHeight: 1 }}>
                  {membership.type || 'Clay Club'}
                </div>
              </div>
            </div>

            {/* Dates row */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
              <div style={{ flex: 1, backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '3px' }}>
                  Started
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: INK }}>
                  {formatDate(membership.startDate)}
                </div>
              </div>
              <div style={{ flex: 1, backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '3px' }}>
                  Expires
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: INK }}>
                  {formatDate(membership.endDate)}
                </div>
              </div>
            </div>

            {/* Days remaining */}
            <div style={{ marginBottom: '14px', padding: '8px 12px', backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: MUTED }}>Days remaining</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: TC }}>{membership.daysRemaining} days</span>
            </div>

            {/* Perks list */}
            {membership.perks && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: TC_DARK, marginBottom: '8px' }}>
                  Your Perks
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {Object.values(membership.perks).map((perk, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '14px', color: TC, flexShrink: 0, marginTop: '1px', fontVariationSettings: "'FILL' 1" }}
                      >
                        check_circle
                      </span>
                      <span style={{ fontSize: '12px', color: INK }}>{perk}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TIER SELECTOR */}
        <div style={{ padding: '20px 20px 0' }}>

          {/* Section label when membership is active */}
          {!loading && membership && (
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '14px' }}>
              Plans & Pricing
            </div>
          )}

          {/* Pill tabs */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
            {TIERS.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTier(t.id)}
                style={{
                  flex: 1, padding: '8px 4px',
                  border: `1px solid ${selectedTier === t.id ? TC : RULE}`,
                  backgroundColor: selectedTier === t.id ? TC_LIGHT : 'transparent',
                  cursor: 'pointer',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                  color: selectedTier === t.id ? TC_DARK : MUTED,
                  position: 'relative',
                  fontFamily: 'Atak, sans-serif',
                }}
              >
                {t.tag && (
                  <span style={{
                    position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)',
                    backgroundColor: TC, color: '#FFF',
                    fontSize: '8px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    padding: '2px 6px', whiteSpace: 'nowrap',
                  }}>
                    {t.tag}
                  </span>
                )}
                {t.label}
              </button>
            ))}
          </div>

          {/* Selected tier card */}
          {TIERS.filter(t => t.id === selectedTier).map(tier => (
            <div key={tier.id} style={{ border: `1px solid ${TC}`, backgroundColor: TC_LIGHT, padding: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: MUTED, marginBottom: '2px' }}>
                    {tier.original ? <>Pay <span style={{ textDecoration: 'line-through' }}>{tier.original}</span> only {tier.price} for {tier.label.toLowerCase()}</> : <>You pay {tier.price} for {tier.label.toLowerCase()}</>}
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 700 }}>
                    {tier.original && ' '}{tier.perMonth}
                  </div>
                </div>
                {tier.save && (
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', backgroundColor: TC, color: '#FFF' }}>
                    {tier.save}
                  </span>
                )}
              </div>

              {/* Perks list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {tier.perks.map((perk, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '15px', color: TC, flexShrink: 0, marginTop: '1px', fontVariationSettings: "'FILL' 1" }}>
                      check_circle
                    </span>
                    <span style={{ fontSize: '13px', color: INK }}>{perk}</span>
                  </div>
                ))}
              </div>

              <a
                href={tier.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block', textAlign: 'center',
                  padding: '14px', backgroundColor: TC, color: '#FFF',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  textDecoration: 'none',
                  fontFamily: 'Atak, sans-serif',
                }}
              >
                {membership ? `Upgrade to ${tier.label}` : `Get ${tier.label} Membership`}
              </a>
            </div>
          ))}

          {/* Compare Plans */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '14px' }}>
              Compare Plans
            </div>
            <div style={{ border: `1px solid ${RULE}` }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px', padding: '10px 12px', backgroundColor: ALT, borderBottom: `1px solid ${RULE}` }}>
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>Perk</span>
                {TIERS.map(t => (
                  <span key={t.id} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: t.id === selectedTier ? TC : MUTED, textAlign: 'center' }}>
                    {t.label.split(' ')[0]}
                  </span>
                ))}
              </div>
              {/* Rows */}
              {[
                { label: 'Studio access',       vals: [true, true, true] },
                { label: 'Free storage',         vals: [true, true, true] },
                { label: 'Free shelving',         vals: [true, true, true] },
                { label: 'Studio glazes',         vals: [true, true, true] },
                { label: 'Clay reclaim',          vals: [false, true, true] },
                { label: '10% discount',          vals: [false, true, true] },
                { label: '10% renewal discount',  vals: [false, true, true] },
                { label: 'Firing credits',        vals: [false, '$90', '$260'] },
              ].map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px', padding: '10px 12px', borderBottom: i < 7 ? `1px solid ${RULE}` : 'none', backgroundColor: i % 2 === 0 ? '#FFFFFF' : ALT }}>
                  <span style={{ fontSize: '12px', color: INK }}>{row.label}</span>
                  {row.vals.map((v, j) => {
                    const isActive = TIERS[j].id === selectedTier;
                    return (
                      <div key={j} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        {v === true ? (
                          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: isActive ? TC : '#CCCCCC', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        ) : v === false ? (
                          <span style={{ fontSize: '16px', color: '#DDD' }}>—</span>
                        ) : (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: isActive ? TC : '#CCCCCC' }}>{v}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Studio Hours */}
        <div style={{ padding: '28px 20px 28px', borderTop: `1px solid ${RULE}` }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '14px' }}>
            Studio Hours
          </div>
          <div style={{ border: `1px solid ${RULE}` }}>
            {HOURS.map((h, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px',
                borderBottom: i < HOURS.length - 1 ? `1px solid ${RULE}` : 'none',
                backgroundColor: i % 2 === 0 ? '#FFF' : ALT,
              }}>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{h.day}</span>
                <span style={{ fontSize: '12px', color: MUTED }}>{h.time}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '10px', fontSize: '11px', color: MUTED }}>
            ~3 min walk from Holland Village MRT
          </div>
        </div>

        {/* Footer CTA */}
        <div style={{ margin: '0 20px 20px', padding: '20px', backgroundColor: ALT, border: `1px solid ${RULE}`, textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Questions?</div>
          <div style={{ fontSize: '12px', color: MUTED, marginBottom: '14px' }}>We're happy to help you find the right plan.</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
                        <a href="https://ves.sg/pages/ves-clay-club" target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TC, textDecoration: 'none', borderBottom: `1px solid ${TC}`, paddingBottom: '1px' }}>
              FAQs
            </a>
            <a href="mailto:info@ves.sg" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TC, textDecoration: 'none', borderBottom: `1px solid ${TC}`, paddingBottom: '1px' }}>
              Email us
            </a>
          </div>
        </div>

      </main>

      {/* Bottom Tab Bar */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: '#FFFFFF', borderTop: `1px solid ${RULE}`, display: 'flex', height: '60px', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <a
              key={tab.id}
              href={tab.href}
              style={{ flex: 1, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', padding: '8px 0', position: 'relative', textDecoration: 'none' }}
            >
              {active && (
                <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '20px', height: '2px', backgroundColor: TC }} />
              )}
              <span className="material-symbols-outlined" style={{ fontSize: '22px', color: active ? TC : '#BBBBBB', fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400" }}>
                {tab.icon}
              </span>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: active ? TC : '#BBBBBB' }}>
                {tab.label}
              </span>
            </a>
          );
        })}
      </nav>

    </div>
  );
}
