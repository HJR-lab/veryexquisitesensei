import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import '../styles/Auth.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function VerifyEmail() {
  const [step, setStep] = useState(1); // 1: Enter email, 2: Enter PIN
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/auth/request-verification`, {
        email: email.toLowerCase()
      });

      setMessage(response.data.message);
      setStep(2);

      // In development, show the code
      if (response.data.code) {
        console.log('🔢 Verification Code:', response.data.code);
        setMessage(`${response.data.message} (Dev: Code is ${response.data.code})`);
      }
    } catch (err) {
      if (err.response?.data?.hasPassword) {
        setError('Account already verified. Redirecting to login...');
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setError(err.response?.data?.error || 'Failed to send verification code');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/auth/verify-pin`, {
        email: email.toLowerCase(),
        code
      });

      // Store temporary token and customer info
      localStorage.setItem('tempToken', response.data.tempToken);
      localStorage.setItem('verifiedEmail', email);

      // Redirect to password setup
      navigate('/setup-password');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setCode('');
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/auth/request-verification`, {
        email: email.toLowerCase()
      });

      setMessage('New verification code sent!');

      // In development, show the code
      if (response.data.code) {
        console.log('🔢 Verification Code:', response.data.code);
        setMessage(`${response.data.message} (Dev: Code is ${response.data.code})`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Verify Your Email</h1>
          <p>
            {step === 1
              ? 'Enter your email to receive a 6-digit verification code'
              : 'Enter the 6-digit code sent to your email'}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleRequestCode} className="auth-form">
            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}

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
              {loading ? 'Sending Code...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="auth-form">
            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}

            <div className="form-group">
              <label htmlFor="code">Verification Code</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                placeholder="000000"
                maxLength={6}
                pattern="\d{6}"
                autoFocus
                style={{
                  fontSize: '1.5rem',
                  textAlign: 'center',
                  letterSpacing: '0.5rem'
                }}
              />
              <small style={{ marginTop: '0.5rem', display: 'block', color: '#666' }}>
                Code sent to: {email}
              </small>
            </div>

            <button type="submit" className="btn-primary" disabled={loading || code.length !== 6}>
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>

            <button
              type="button"
              onClick={handleResendCode}
              className="btn-secondary"
              disabled={loading}
              style={{ marginTop: '0.5rem' }}
            >
              Resend Code
            </button>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="btn-link"
              style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}
            >
              Use a different email
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p>
            Already have an account? <Link to="/login">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
