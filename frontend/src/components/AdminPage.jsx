import { useState, useEffect } from 'react';

const TC    = '#C4622D';
const INK   = '#282828';
const MUTED = '#888888';
const BG    = '#F8F7F5';

function useIsMobile(bp = 768) {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false);
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [bp]);
  return m;
}

function Header({ title, subtitle, actions, embedded, isMobile }) {
  return (
    <header style={{
      marginBottom: '24px',
      display: 'flex',
      alignItems: isMobile ? 'flex-start' : 'flex-end',
      justifyContent: 'space-between',
      gap: '16px',
      flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0 }}>
        {!embedded && (
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>
            Admin
          </div>
        )}
        <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0, color: INK }}>{title}</h1>
        {subtitle && (
          <div style={{ fontSize: '12px', color: MUTED, marginTop: '4px' }}>{subtitle}</div>
        )}
      </div>
      {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
    </header>
  );
}

export default function AdminPage({ title, subtitle, actions, embedded = false, children }) {
  const isMobile = useIsMobile();
  const mainPadding = isMobile ? '20px 16px 60px' : '32px 24px 60px';
  const embeddedPadding = isMobile ? '16px 16px 60px' : '20px 24px 60px';

  if (embedded) {
    return (
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: embeddedPadding }}>
        <Header title={title} subtitle={subtitle} actions={actions} embedded isMobile={isMobile} />
        {children}
      </main>
    );
  }

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: BG, minHeight: '100vh' }}>
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: mainPadding }}>
        <Header title={title} subtitle={subtitle} actions={actions} embedded={false} isMobile={isMobile} />
        {children}
      </main>
    </div>
  );
}
