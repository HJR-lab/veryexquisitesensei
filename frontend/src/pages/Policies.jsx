import { STUDIO_POLICIES } from '../utils/courseDetails';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

export default function Policies() {
  const sections = Object.values(STUDIO_POLICIES);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8' }}>
      {/* Header */}
      <header style={{
        backgroundColor: '#FFF',
        borderBottom: `1px solid ${RULE}`,
        padding: '20px 20px 18px',
        textAlign: 'center',
      }}>
        <img
          src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
          alt="VES Pottery Studio"
          style={{ height: '26px', marginBottom: '10px' }}
        />
        <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.02em', color: INK }}>
          Rules and Regulations
        </div>
        <div style={{ fontSize: '10px', color: MUTED, letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: '2px' }}>
          VES Pottery Studio
        </div>
      </header>

      <main style={{ maxWidth: '520px', margin: '0 auto', padding: '24px 16px 64px' }}>
        {/* Important banner */}
        <div style={{
          padding: '14px 16px',
          backgroundColor: TC_LIGHT,
          border: `1px solid ${TC}`,
          marginBottom: '24px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
        }}>
          <span style={{
            fontSize: '16px',
            color: TC_DARK,
            flexShrink: 0,
            marginTop: '1px',
            fontWeight: 700,
          }}>
            !
          </span>
          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: TC_DARK,
              marginBottom: '4px',
            }}>
              Important
            </div>
            <div style={{ fontSize: '12px', color: INK, lineHeight: 1.5 }}>
              By enrolling in any VES course, you agree to the following studio policies. Please read this document carefully before your first session.
            </div>
          </div>
        </div>

        {/* Policy sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sections.map((section, si) => (
            <div
              key={si}
              style={{
                backgroundColor: '#FFF',
                border: `1px solid ${section.highlight ? TC : RULE}`,
              }}
            >
              {/* Section header */}
              <div style={{
                padding: '14px 16px 12px',
                borderBottom: `1px solid ${section.highlight ? TC : RULE}`,
                backgroundColor: section.highlight ? TC_LIGHT : ALT,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: INK,
                  }}>
                    {section.title}
                  </div>
                  {section.highlight && (
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: '#FFF',
                      backgroundColor: TC,
                      padding: '3px 8px',
                    }}>
                      New
                    </span>
                  )}
                </div>
              </div>

              {/* Section content */}
              <div style={{ padding: '14px 16px' }}>
                {section.description && (
                  <div style={{
                    fontSize: '13px',
                    color: INK,
                    lineHeight: 1.6,
                    marginBottom: section.items?.length ? '10px' : 0,
                  }}>
                    {section.description}
                  </div>
                )}
                {section.content && !section.items && (
                  <div style={{ fontSize: '13px', color: INK, lineHeight: 1.6 }}>
                    {section.content}
                  </div>
                )}
                {section.items?.map((item, ri) => (
                  <div
                    key={ri}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start',
                      padding: '8px 0',
                      borderBottom: ri < section.items.length - 1 ? `1px solid ${RULE}` : 'none',
                    }}
                  >
                    <div style={{
                      width: '18px',
                      height: '18px',
                      flexShrink: 0,
                      backgroundColor: TC_LIGHT,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: TC_DARK,
                      marginTop: '1px',
                    }}>
                      {ri + 1}
                    </div>
                    <div style={{ fontSize: '13px', color: INK, lineHeight: 1.55 }}>{item}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '24px',
          padding: '16px',
          backgroundColor: ALT,
          border: `1px solid ${RULE}`,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '12px', color: MUTED, marginBottom: '6px' }}>Questions about our policies?</div>
          <a
            href="mailto:info@ves.sg"
            style={{ fontSize: '13px', fontWeight: 700, color: TC, textDecoration: 'none' }}
          >
            info@ves.sg
          </a>
        </div>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: MUTED, lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 4px' }}>Ves Studio &middot; 75 Jalan Kelabu Asap, Singapore 278268</p>
          <p style={{ margin: 0 }}>
            <a href="https://www.ves.sg" style={{ color: TC, textDecoration: 'none' }}>ves.sg</a>
            {' '}&middot;{' '}
            <a href="https://www.instagram.com/ves.studio/" style={{ color: TC, textDecoration: 'none' }}>Instagram</a>
            {' '}&middot;{' '}
            <a href="https://www.facebook.com/ves.studio.sg/" style={{ color: TC, textDecoration: 'none' }}>Facebook</a>
          </p>
        </div>
      </main>
    </div>
  );
}
