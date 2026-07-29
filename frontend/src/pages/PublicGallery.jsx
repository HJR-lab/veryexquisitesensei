import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { potteryAPI, communityAPI } from '../utils/api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const BG       = '#FAFAF8';

const ROLE_LABELS = { all: 'All', student: 'Students', member: 'Members', instructor: 'Instructors' };
const ROLE_COLORS = {
  student: { bg: '#EDF2F7', color: '#4A5568' },
  member: { bg: '#E6FFFA', color: '#234E52' },
  instructor: { bg: TC_LIGHT, color: TC_DARK },
};

const IS_DEV = import.meta.env.DEV;

export default function PublicGallery() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const { login, loginWithPassword, verifyEmailOtp } = useAuth();
  const navigate = useNavigate();

  // Gallery state
  const [pieces, setPieces] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryError, setGalleryError] = useState(false);
  const [imageErrors, setImageErrors] = useState({});

  // Community state
  const [communityMembers, setCommunityMembers] = useState([]);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [viewMode, setViewMode] = useState('gallery'); // 'gallery' | 'community'

  useEffect(() => {
    loadPublicPieces();
    loadCommunity();
  }, []);

  useEffect(() => {
    loadCommunity();
  }, [activeFilter]);

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

  const loadCommunity = async () => {
    try {
      setCommunityLoading(true);
      const data = await communityAPI.getMembers(activeFilter);
      setCommunityMembers(data.members || []);
    } catch (err) {
      console.error('Failed to load community:', err);
    } finally {
      setCommunityLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoginLoading(true);
    try {
      if (IS_DEV) {
        await loginWithPassword(email.trim(), password);
        // Supabase session is set; onAuthStateChange will fetch user
      } else {
        await login(email.trim());
        setMagicLinkSent(true);
      }
    } catch (err) {
      setError(err.message || (IS_DEV ? 'Login failed' : 'Failed to send sign-in link'));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const token = otpCode.replace(/\s/g, '');
    if (!/^\d{6}$/.test(token)) {
      setError('Enter the 6-digit code from your email');
      return;
    }
    setVerifyingOtp(true);
    try {
      await verifyEmailOtp(email.trim(), token);
      // Session set; reuse callback page's role-aware redirect logic.
      navigate('/auth/callback', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid or expired code');
    } finally {
      setVerifyingOtp(false);
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

  const tabStyle = (active) => ({
    fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
    padding: '8px 16px',
    border: 'none',
    backgroundColor: active ? TC : 'transparent',
    color: active ? '#FFFFFF' : MUTED,
    cursor: 'pointer',
    fontFamily: 'inherit',
  });

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
            Ves Clay Club Portal
          </div>
          <h1 style={{
            fontSize: '24px', fontWeight: 700, letterSpacing: '-0.3px',
            margin: '0 0 24px', color: INK,
          }}>
            Sign in to your account
          </h1>

          {magicLinkSent ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: INK, marginBottom: '8px' }}>
                If you have an account, we've sent a sign-in email to <strong>{email}</strong>
              </p>
              <p style={{ fontSize: '12px', color: MUTED, marginBottom: '20px' }}>
                Click the link, or enter the 6-digit code below if the link doesn't work.
              </p>

              <form onSubmit={handleOtpSubmit}>
                {error && (
                  <div style={{
                    fontSize: '12px', color: '#C0392B', backgroundColor: '#FDEDEC',
                    padding: '10px 14px', marginBottom: '14px', textAlign: 'left',
                  }}>
                    {error}
                  </div>
                )}
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code"
                  autoComplete="one-time-code"
                  style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.4em', fontSize: '16px' }}
                />
                <button
                  type="submit"
                  disabled={verifyingOtp || otpCode.length !== 6}
                  style={{
                    marginTop: '12px', width: '100%',
                    fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    padding: '12px',
                    backgroundColor: TC, color: '#FFFFFF',
                    border: 'none',
                    cursor: (verifyingOtp || otpCode.length !== 6) ? 'default' : 'pointer',
                    opacity: (verifyingOtp || otpCode.length !== 6) ? 0.5 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {verifyingOtp ? 'Verifying...' : 'Sign In with Code'}
                </button>
              </form>

              <button
                onClick={() => { setMagicLinkSent(false); setOtpCode(''); setError(''); }}
                style={{
                  marginTop: '16px', fontSize: '12px', fontWeight: 600,
                  color: TC_DARK, backgroundColor: 'transparent',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Try a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div style={{
                  fontSize: '12px', color: '#C0392B', backgroundColor: '#FDEDEC',
                  padding: '10px 14px', marginBottom: '14px', textAlign: 'left',
                }}>
                  {error}
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Email"
                  autoComplete="email"
                  style={inputStyle}
                />
              </div>

              {IS_DEV && (
                <div style={{ marginBottom: '16px' }}>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Password (dev only)"
                    autoComplete="current-password"
                    style={inputStyle}
                  />
                </div>
              )}

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
                {loginLoading ? (IS_DEV ? 'Signing in...' : 'Sending...') : (IS_DEV ? 'Sign In' : 'Send Sign-In Link')}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ── VIEW TOGGLE ───────────────────────────────────────────────── */}
      <div style={{
        maxWidth: '960px', margin: '0 auto', padding: '24px 24px 0',
        display: 'flex', gap: '0', borderBottom: `1px solid ${RULE}`,
      }}>
        {['gallery', 'community'].map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            style={{
              fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '10px 20px',
              border: 'none', borderBottom: viewMode === mode ? `2px solid ${TC}` : '2px solid transparent',
              backgroundColor: 'transparent',
              color: viewMode === mode ? TC : MUTED,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {mode === 'gallery' ? 'Student Gallery' : 'Community'}
          </button>
        ))}
      </div>

      {/* ── GALLERY VIEW ─────────────────────────────────────────────── */}
      {viewMode === 'gallery' && (
        <main style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 24px 80px' }}>
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
              <div style={{ fontSize: '12px', color: MUTED }}>Gallery is currently unavailable</div>
            </div>
          ) : pieces.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: INK, marginBottom: '4px' }}>No pieces shared yet</div>
              <div style={{ fontSize: '12px', color: MUTED }}>Student work will appear here once shared.</div>
            </div>
          ) : (
            <>
              <div style={{
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: MUTED, marginBottom: '20px',
              }}>
                {pieces.length} piece{pieces.length !== 1 ? 's' : ''}
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
      )}

      {/* ── COMMUNITY VIEW ───────────────────────────────────────────── */}
      {viewMode === 'community' && (
        <main style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 24px 80px' }}>
          {/* Role filter tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {Object.entries(ROLE_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                style={tabStyle(activeFilter === key)}
              >
                {label}
              </button>
            ))}
          </div>

          {communityLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{
                width: '24px', height: '24px', border: `2px solid ${RULE}`, borderTopColor: TC,
                borderRadius: '50%', margin: '0 auto 12px',
                animation: 'spin 0.8s linear infinite',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              <div style={{ fontSize: '12px', color: MUTED }}>Loading community...</div>
            </div>
          ) : communityMembers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: INK, marginBottom: '4px' }}>No members yet</div>
              <div style={{ fontSize: '12px', color: MUTED }}>Community members will appear here.</div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '16px',
            }}>
              {communityMembers.map(member => (
                <Link
                  key={member.id}
                  to={`/community/${member.id}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{
                    border: `1px solid ${RULE}`,
                    backgroundColor: '#FFFFFF',
                    overflow: 'hidden',
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                  >
                    {/* Profile image */}
                    <div style={{
                      aspectRatio: '1', backgroundColor: BG,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {member.profile_image ? (
                        <img
                          src={member.profile_image}
                          alt={member.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{
                          width: '64px', height: '64px', borderRadius: '50%',
                          backgroundColor: TC_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '24px', fontWeight: 700, color: TC,
                        }}>
                          {member.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: INK, marginBottom: '4px' }}>
                        {member.name}
                      </div>

                      {/* Role badge */}
                      <div style={{
                        display: 'inline-block',
                        fontSize: '9px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                        padding: '2px 7px',
                        backgroundColor: ROLE_COLORS[member.role]?.bg || ROLE_COLORS.student.bg,
                        color: ROLE_COLORS[member.role]?.color || ROLE_COLORS.student.color,
                      }}>
                        {member.role}
                      </div>

                      {/* Stats */}
                      <div style={{ fontSize: '11px', color: MUTED, marginTop: '6px' }}>
                        {member.role === 'instructor' && member.portfolio_count > 0
                          ? `${member.portfolio_count} portfolio item${member.portfolio_count !== 1 ? 's' : ''}`
                          : member.piece_count > 0
                            ? `${member.piece_count} piece${member.piece_count !== 1 ? 's' : ''}`
                            : ''
                        }
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      )}

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
