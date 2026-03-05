import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const BG       = '#FAFAF8';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (email !== 'info@ves.sg') {
        setError('This login is for administrators only. Please use the regular login page.');
        setLoading(false);
        return;
      }

      const response = await login(email, password);

      if (response.user.email === 'info@ves.sg') {
        navigate('/admin');
      } else {
        setError('Access denied. Admin credentials required.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
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
            Admin Portal
          </div>
          <h1 style={{
            fontSize: '24px', fontWeight: 700, letterSpacing: '-0.3px',
            margin: '0 0 24px', color: INK,
          }}>
            Administrator Access
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
                placeholder="Admin email"
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
              disabled={loading}
              style={{
                width: '100%',
                fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '12px',
                backgroundColor: TC, color: '#FFFFFF',
                border: 'none', cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.7 : 1,
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: '16px', fontSize: '12px', color: MUTED }}>
            Not an admin? <Link to="/login" style={{ color: TC_DARK, fontWeight: 600, textDecoration: 'none' }}>Student Login</Link>
          </div>
        </div>
      </section>

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
