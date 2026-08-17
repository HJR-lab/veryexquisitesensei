import { Link, useLocation } from 'react-router-dom';
import ImpersonationBanner from './ImpersonationBanner';
import { isFinalWeekClassType } from '../utils/glazing';

// ─── Design tokens ───────────────────────────────────────────────────────────
export const TC       = '#C4622D';
export const TC_LIGHT = '#F9EDE6';
export const TC_DARK  = '#9E4A1E';
export const INK      = '#282828';
export const MUTED    = '#888888';
export const RULE     = 'rgba(40,40,40,0.09)';
export const ALT      = '#F5F3F0';

// ─── Section label ───────────────────────────────────────────────────────────
export function SectionLabel({ children, action, actionHref, actionLabel }) {
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

// ─── Divider ─────────────────────────────────────────────────────────────────
export function Divider() {
  return <div style={{ height: '1px', backgroundColor: RULE, margin: '0 0 28px' }} />;
}

// ─── Top header bar ──────────────────────────────────────────────────────────
export function TopBar() {
  return (
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
  );
}

// ─── Bottom tab bar ──────────────────────────────────────────────────────────
export function BottomTabBar({ tabs, activeId }) {
  const location = useLocation();
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      backgroundColor: '#FFFFFF',
      borderTop: `1px solid ${RULE}`,
      display: 'flex',
      height: '60px',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {tabs.map(tab => {
        const active = activeId
          ? tab.id === activeId
          : tab.id === 'home'
            ? (location.pathname === '/' || location.pathname === '/dashboard')
            : location.pathname === tab.href;
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
  );
}

// ─── Date formatting ─────────────────────────────────────────────────────────
export function formatDateParts(dateStr) {
  if (!dateStr) return { dayAbbr: '', dayNum: '', month: '' };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { dayAbbr: '', dayNum: '', month: '' };
  return {
    dayAbbr: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    dayNum: d.toLocaleDateString('en-GB', { day: 'numeric' }),
    month: d.toLocaleDateString('en-GB', { month: 'short' }),
  };
}

export function formatTime(timeStr) {
  if (!timeStr) return '';
  const s = timeStr.trim();
  // Handle "1:00 PM", "9:30am", "1:00pm" — normalize to compact format
  const ampmMatch = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (ampmMatch) {
    return `${parseInt(ampmMatch[1], 10)}:${ampmMatch[2]}${ampmMatch[3].toLowerCase()}`;
  }
  // 24h format "HH:MM" or "HH:MM:SS" — convert
  const parts = s.split(':');
  const hour = parseInt(parts[0], 10);
  const min = (parts[1] || '00').replace(/\D/g, '').slice(0, 2);
  if (isNaN(hour)) return s;
  const ampm = hour >= 12 ? 'pm' : 'am';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${min}${ampm}`;
}

// Takes a class-type string for backwards compatibility. A class MARKED as glazing
// cannot be recognised from its code alone, so callers holding the whole class
// object should use isGlazingClass(cls) from utils/glazing instead.
export function getClassLabel(classType) {
  if (!classType) return '';
  if (isFinalWeekClassType(classType)) return 'Glazing';
  if (classType.startsWith('WT')) return 'Wheelthrowing';
  if (classType.startsWith('HB')) return 'Handbuilding';
  return classType;
}

// ─── Class row card ──────────────────────────────────────────────────────────
// Reusable class row: date block | divider | detail | badge
// Used in both student Dashboard and InstructorDashboard
export function ClassRow({
  dateStr,
  classType,
  startTime,
  endTime,
  subtitle,         // optional subtitle below class label (e.g., course identifier)
  badge,            // { label, bg, color }
  dimmed = false,
  isLast = false,
  children,         // optional expanded content below
  onClick,
  rightContent,     // optional right side (replaces badge)
}) {
  const { dayAbbr, dayNum, month } = formatDateParts(dateStr);
  const timeStr = startTime
    ? (endTime ? `${formatTime(startTime)} – ${formatTime(endTime)}` : formatTime(startTime))
    : '—';

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '14px',
          padding: dimmed ? '10px 0' : '12px 0',
          opacity: dimmed ? 0.6 : 1,
          borderBottom: (!children && !isLast) ? `1px solid ${RULE}` : (children ? `1px solid ${RULE}` : 'none'),
          cursor: onClick ? 'pointer' : 'default',
        }}
        onClick={onClick}
      >
        {/* Date block */}
        <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{dayAbbr}</div>
          <div style={{ fontSize: dimmed ? '18px' : '20px', fontWeight: 700, lineHeight: 1.1 }}>{dayNum}</div>
          <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{month}</div>
        </div>
        {/* Thin rule */}
        <div style={{ width: '1px', height: dimmed ? '38px' : '42px', backgroundColor: RULE, flexShrink: 0 }} />
        {/* Detail */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{getClassLabel(classType)}</div>
          <div style={{ fontSize: '11px', color: MUTED }}>{timeStr}{subtitle ? ` · ${subtitle}` : ''}</div>
        </div>
        {/* Right side */}
        {rightContent || (badge && (
          <span style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '4px 8px', backgroundColor: badge.bg, color: badge.color, flexShrink: 0,
          }}>
            {badge.label}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
export function Avatar({ src, name, size = 24 }) {
  if (src) {
    return <img src={src} alt={name || ''} style={{ width: size, height: size, objectFit: 'cover' }} />;
  }
  return (
    <div style={{
      width: size, height: size, backgroundColor: TC_LIGHT,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.max(9, Math.round(size * 0.4)) + 'px', fontWeight: 700, color: TC,
    }}>
      {(name || '?')[0]}
    </div>
  );
}

// ─── Page shell ──────────────────────────────────────────────────────────────
export function PageShell({ children }) {
  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>
      <ImpersonationBanner />
      {children}
    </div>
  );
}

export function ScrollBody({ children }) {
  return (
    <main style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px 88px' }}>
      {children}
    </main>
  );
}
