import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { communityAPI } from '../utils/api';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const BG       = '#FAFAF8';

const ROLE_COLORS = {
  student: { bg: '#EDF2F7', color: '#4A5568' },
  member: { bg: '#E6FFFA', color: '#234E52' },
  instructor: { bg: TC_LIGHT, color: TC_DARK },
};

function getVideoEmbed(url) {
  if (!url) return null;
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  // Instagram
  const igMatch = url.match(/instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/);
  if (igMatch) return `https://www.instagram.com/p/${igMatch[1]}/embed`;
  return null;
}

export default function InstructorProfile() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    loadProfile();
  }, [id]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const result = await communityAPI.getInstructorPortfolio(id);
      setData(result);
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: '100vh', backgroundColor: '#FFFFFF' }}>
        <div style={{ textAlign: 'center', padding: '120px 24px' }}>
          <div style={{
            width: '24px', height: '24px', border: `2px solid ${RULE}`, borderTopColor: TC,
            borderRadius: '50%', margin: '0 auto 12px',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ fontSize: '12px', color: MUTED }}>Loading profile...</div>
        </div>
      </div>
    );
  }

  if (!data?.instructor) {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: '100vh', backgroundColor: '#FFFFFF' }}>
        <div style={{ textAlign: 'center', padding: '120px 24px' }}>
          <div style={{ fontSize: '14px', color: MUTED }}>Profile not found</div>
          <Link to="/" style={{ fontSize: '12px', color: TC, marginTop: '12px', display: 'inline-block' }}>Back to home</Link>
        </div>
      </div>
    );
  }

  const { instructor, portfolio, pieces } = data;
  const roleStyle = ROLE_COLORS[instructor.role] || ROLE_COLORS.student;

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
        <div style={{
          maxWidth: '960px', margin: '0 auto', padding: '0 24px',
          height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <img
              src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
              alt="VES"
              style={{ height: '24px', width: 'auto' }}
            />
          </Link>
          <Link to="/" style={{
            fontSize: '11px', fontWeight: 600, color: MUTED, textDecoration: 'none',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            Back
          </Link>
        </div>
      </header>

      {/* Profile hero */}
      <section style={{ backgroundColor: BG, borderBottom: `1px solid ${RULE}`, padding: '48px 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Profile image */}
          <div style={{
            width: '140px', height: '140px', borderRadius: '50%', overflow: 'hidden',
            backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {instructor.profile_image ? (
              <img src={instructor.profile_image} alt={instructor.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ fontSize: '48px', fontWeight: 700, color: TC }}>{instructor.name?.charAt(0)?.toUpperCase()}</div>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: '200px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.3px' }}>{instructor.name}</h1>
            <div style={{
              display: 'inline-block',
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '3px 10px',
              backgroundColor: roleStyle.bg, color: roleStyle.color,
            }}>
              {instructor.role}
            </div>
            {instructor.bio && (
              <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#555', marginTop: '16px', maxWidth: '560px' }}>
                {instructor.bio}
              </p>
            )}
          </div>
        </div>
      </section>

      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* Portfolio section */}
        {portfolio.length > 0 && (
          <section style={{ marginBottom: '48px' }}>
            <div style={{
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: MUTED, marginBottom: '20px',
            }}>
              Portfolio · {portfolio.length} item{portfolio.length !== 1 ? 's' : ''}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}>
              {portfolio.map(item => (
                <div key={item.id} style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
                  {item.media_type === 'video' ? (
                    <div style={{ aspectRatio: '16/9', backgroundColor: '#000' }}>
                      {getVideoEmbed(item.media_url) ? (
                        <iframe
                          src={getVideoEmbed(item.media_url)}
                          title={item.title || 'Video'}
                          style={{ width: '100%', height: '100%', border: 'none' }}
                          allowFullScreen
                        />
                      ) : (
                        <a href={item.media_url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#FFFFFF', fontSize: '12px' }}>
                          Open video
                        </a>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{ aspectRatio: '1', backgroundColor: BG, cursor: 'pointer', overflow: 'hidden' }}
                      onClick={() => setLightbox(item.media_url)}
                    >
                      <img src={item.media_url} alt={item.title || 'Portfolio'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  {(item.title || item.description) && (
                    <div style={{ padding: '12px 14px' }}>
                      {item.title && <div style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{item.title}</div>}
                      {item.description && <div style={{ fontSize: '12px', color: MUTED, marginTop: '4px' }}>{item.description}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pottery pieces section */}
        {pieces.length > 0 && (
          <section>
            <div style={{
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: MUTED, marginBottom: '20px',
            }}>
              Pottery · {pieces.length} piece{pieces.length !== 1 ? 's' : ''}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '16px',
            }}>
              {pieces.map(piece => (
                <div key={piece.id} style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
                  <div style={{ aspectRatio: '1', backgroundColor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {piece.images?.[0] ? (
                      <img
                        src={piece.images[0]}
                        alt={piece.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                        onClick={() => setLightbox(piece.images[0])}
                      />
                    ) : (
                      <div style={{ fontSize: '32px', opacity: 0.2 }}>&#x1FAD9;</div>
                    )}
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{piece.title}</div>
                    {piece.clay_type && (
                      <div style={{
                        display: 'inline-block', marginTop: '6px',
                        fontSize: '9px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                        padding: '2px 7px', backgroundColor: TC_LIGHT, color: TC_DARK,
                      }}>
                        {piece.clay_type}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {portfolio.length === 0 && pieces.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: INK, marginBottom: '4px' }}>No work shared yet</div>
            <div style={{ fontSize: '12px', color: MUTED }}>This member hasn't shared any work yet.</div>
          </div>
        )}
      </main>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, cursor: 'pointer', padding: '24px',
          }}
        >
          <img src={lightbox} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }} />
        </div>
      )}

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${RULE}`, backgroundColor: BG, padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '11px', color: MUTED }}>VES Pottery Studio · Singapore</div>
      </footer>
    </div>
  );
}
