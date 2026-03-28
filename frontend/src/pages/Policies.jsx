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
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <header style={{
        backgroundColor: '#FFF',
        borderBottom: `1px solid ${RULE}`,
        padding: '28px 20px 24px',
        textAlign: 'center',
      }}>
        <img
          src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
          alt="VES Pottery Studio"
          style={{ height: 30, marginBottom: 14 }}
        />
        <h1 style={{
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '0.02em',
          color: INK,
          margin: '0 0 4px',
        }}>
          Studio Policies
        </h1>
        <p style={{
          fontSize: 11,
          color: MUTED,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          margin: 0,
        }}>
          VES Pottery Studio &middot; 75 Jalan Kelabu Asap, Singapore 278268
        </p>
      </header>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '28px 16px 72px' }}>
        {/* Important notice */}
        <div style={{
          padding: '16px 18px',
          backgroundColor: TC_LIGHT,
          border: `1px solid ${TC}`,
          borderRadius: 2,
          marginBottom: 28,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <span style={{
            fontSize: 18,
            color: TC_DARK,
            flexShrink: 0,
            marginTop: 1,
            fontWeight: 700,
            lineHeight: 1,
          }}>
            &#9888;
          </span>
          <div>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: TC_DARK,
              marginBottom: 5,
            }}>
              Please Read Before Enrolling
            </div>
            <div style={{ fontSize: 13, color: INK, lineHeight: 1.6 }}>
              By enrolling in any VES course, you acknowledge and agree to the following studio policies. Please review this document in full before your first session.
            </div>
          </div>
        </div>

        {/* Policy sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {sections.map((section, si) => (
            <section
              key={si}
              style={{
                backgroundColor: '#FFF',
                border: `1px solid ${section.highlight ? TC : RULE}`,
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              {/* Section header */}
              <div style={{
                padding: '14px 18px 12px',
                borderBottom: `1px solid ${section.highlight ? TC : RULE}`,
                backgroundColor: section.highlight ? TC_LIGHT : ALT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    backgroundColor: section.highlight ? TC : INK,
                    color: '#FFF',
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {si + 1}
                  </span>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: INK,
                  }}>
                    {section.title}
                  </span>
                </div>
                {section.highlight && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#FFF',
                    backgroundColor: TC,
                    padding: '3px 10px',
                    borderRadius: 1,
                  }}>
                    New
                  </span>
                )}
              </div>

              {/* Section body */}
              <div style={{ padding: '16px 18px' }}>
                {section.description && (
                  <p style={{
                    fontSize: 13,
                    color: MUTED,
                    lineHeight: 1.65,
                    margin: `0 0 ${section.items?.length ? '14px' : '0'}`,
                    fontStyle: 'italic',
                  }}>
                    {section.description}
                  </p>
                )}
                {section.content && !section.items && (
                  <div style={{ fontSize: 13, color: INK, lineHeight: 1.65 }}>
                    {section.content}
                  </div>
                )}
                {section.items?.map((item, ri) => (
                  <div
                    key={ri}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      padding: '9px 0',
                      borderBottom: ri < section.items.length - 1 ? `1px solid ${RULE}` : 'none',
                    }}
                  >
                    <div style={{
                      width: 20,
                      height: 20,
                      flexShrink: 0,
                      backgroundColor: TC_LIGHT,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      color: TC_DARK,
                      marginTop: 2,
                    }}>
                      {ri + 1}
                    </div>
                    <div style={{ fontSize: 13, color: INK, lineHeight: 1.6 }}>{item}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Contact footer */}
        <div style={{
          marginTop: 28,
          padding: '20px 18px',
          backgroundColor: ALT,
          border: `1px solid ${RULE}`,
          borderRadius: 2,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, color: INK, marginBottom: 6, fontWeight: 600 }}>
            Questions about our policies?
          </div>
          <a
            href="mailto:info@ves.sg"
            style={{ fontSize: 14, fontWeight: 700, color: TC, textDecoration: 'none' }}
          >
            info@ves.sg
          </a>
        </div>

        {/* Studio info */}
        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: MUTED, lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 4px' }}>
            <a
              href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7"
              style={{ color: MUTED, textDecoration: 'none' }}
              target="_blank"
              rel="noopener noreferrer"
            >
              75 Jalan Kelabu Asap, Chip Bee Gardens, Singapore 278268
            </a>
          </p>
          <p style={{ margin: 0 }}>
            <a href="https://www.ves.sg" style={{ color: TC, textDecoration: 'none' }} target="_blank" rel="noopener noreferrer">ves.sg</a>
            {' '}&middot;{' '}
            <a href="https://www.instagram.com/ves.studio/" style={{ color: TC, textDecoration: 'none' }} target="_blank" rel="noopener noreferrer">Instagram</a>
            {' '}&middot;{' '}
            <a href="https://www.facebook.com/ves.studio.sg/" style={{ color: TC, textDecoration: 'none' }} target="_blank" rel="noopener noreferrer">Facebook</a>
          </p>
          <p style={{ margin: '12px 0 0', fontSize: 11, color: '#BBBBBB' }}>
            &copy; {new Date().getFullYear()} VES Pottery Studio. All rights reserved.
          </p>
        </div>
      </main>
    </div>
  );
}
