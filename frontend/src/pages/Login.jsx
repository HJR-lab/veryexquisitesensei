import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import '../styles/Auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Check Your Email</h1>
            <p>
              If you have an account, we've sent a sign-in link to{' '}
              <strong>{email}</strong>
            </p>
          </div>
          <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
            <p>Click the link in the email to sign in.</p>
            <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
              Don't see it? Check your spam folder.
            </p>
          </div>
          <button
            className="btn-secondary"
            onClick={() => { setSent(false); setEmail(''); }}
            style={{ marginTop: '1rem' }}
          >
            Try a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>VES Pottery Gallery</h1>
          <p>Enter your email to receive a sign-in link</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your.email@example.com"
              autoFocus
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Sending...' : 'Send Sign-In Link'}
          </button>
        </form>
      </div>
    </div>
  );
}
