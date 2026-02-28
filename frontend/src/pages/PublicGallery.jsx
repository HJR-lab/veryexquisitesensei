import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { potteryAPI } from '../utils/api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const BG       = '#FAFAF8';

export default function PublicGallery() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const [pieces, setPieces] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryError, setGalleryError] = useState(false);
  const [imageErrors, setImageErrors] = useState({});

  useEffect(() => {
    loadPublicPieces();
  }, []);

  const loadPublicPieces = async () => {
    try {
      setGalleryLoading(true);
      setGalleryError(false);
      const data = await potteryAPI.getPublicPieces();
      setPieces(data.pieces || []);
    } catch (err) {
      setGalleryError(true);
    } finally {
      setGalleryLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoginLoading(true);
    try {
      if (email === 'info@ves.sg') {
        setError('Please use the admin login page.');
        setLoginLoading(false);
        return;
      }
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleImageError = (id) => {
    setImageErrors(prev => ({ ...prev, [id]: true }));
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    fontSize: '14px', padding: '11px 14px',
    border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF',
    color: INK, outline: 'none',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header style={{
        backgroundColor: '#FFFFFF',
        borderBottom: `1px solid ${RULE}`,
      }}>
        <div style={{
          maxWidth: '960px', margin: '0 auto', padding: '0 24px',
          height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES"
            style={{ height: '24px', width: 'auto' }}
          />
        </div>
      </header>

      {/* ── LOGIN SECTION ───────────────────────────────────────────────── */}
      <section style={{
        backgroundColor: BG,
        borderBottom: `1px solid ${RULE}`,
        padding: '48px 24px',
      }}>
        <div style={{ maxWidth: '340px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: TC, marginBottom: '10px',
          }}>
            Student Portal
          </div>
          <h1 style={{
            fontSize: '24px', fontWeight: 700, letterSpacing: '-0.3px',
            margin: '0 0 24px', color: INK,
          }}>
            Sign in to your account
          </h1>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                fontSize: '12px', color: '#C0392B', backgroundColor: '#FDEDEC',
                padding: '10px 14px', marginBottom: '14px', textAlign: 'left',
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '10px' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Email"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Password"
                style={inputStyle}
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              style={{
                width: '100%',
                fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '12px',
                backgroundColor: TC, color: '#FFFFFF',
                border: 'none', cursor: loginLoading ? 'default' : 'pointer',
                opacity: loginLoading ? 0.7 : 1,
                fontFamily: 'inherit',
              }}
            >
              {loginLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: '16px', fontSize: '12px', color: MUTED }}>
            First time? <Link to="/verify-email" style={{ color: TC_DARK, fontWeight: 600, textDecoration: 'none' }}>Verify your email</Link>
          </div>
        </div>
      </section>

      {/* ── GALLERY ─────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {galleryLoading ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{
              width: '24px', height: '24px', border: `2px solid ${RULE}`, borderTopColor: TC,
              borderRadius: '50%', margin: '0 auto 12px',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <div style={{ fontSize: '12px', color: MUTED }}>Loading gallery...</div>
          </div>
        ) : galleryError ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ fontSize: '12px', color: MUTED }}>
              Gallery is currently unavailable
            </div>
          </div>
        ) : pieces.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: INK, marginBottom: '4px' }}>
              No pieces shared yet
            </div>
            <div style={{ fontSize: '12px', color: MUTED }}>
              Student work will appear here once shared.
            </div>
          </div>
        ) : (
          <>
            <div style={{
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: MUTED, marginBottom: '20px',
            }}>
              Student Gallery · {pieces.length} piece{pieces.length !== 1 ? 's' : ''}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '16px',
            }}>
              {pieces.map(piece => (
                <div key={piece.id} style={{
                  border: `1px solid ${RULE}`,
                  backgroundColor: '#FFFFFF',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    aspectRatio: '1', backgroundColor: BG,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}>
                    {piece.images?.[0] && !imageErrors[piece.id] ? (
                      <img
                        src={piece.images[0]}
                        alt={piece.title}
                        onError={() => handleImageError(piece.id)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ fontSize: '32px', opacity: 0.2 }}>&#x1FAD9;</div>
                    )}
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: INK, marginBottom: '3px' }}>
                      {piece.title}
                    </div>
                    {piece.artist && (
                      <div style={{ fontSize: '11px', color: MUTED }}>by {piece.artist}</div>
                    )}
                    {piece.clay_type && (
                      <div style={{
                        display: 'inline-block', marginTop: '6px',
                        fontSize: '9px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                        padding: '2px 7px',
                        backgroundColor: TC_LIGHT, color: TC_DARK,
                      }}>
                        {piece.clay_type}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: `1px solid ${RULE}`,
        backgroundColor: BG,
        padding: '24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '11px', color: MUTED }}>
          VES Pottery Studio · Singapore
        </div>
      </footer>
    </div>
  );
}
