import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/Auth.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function SetupPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user came from verification
    const tempToken = localStorage.getItem('tempToken');
    const verifiedEmail = localStorage.getItem('verifiedEmail');

    if (!tempToken || !verifiedEmail) {
      navigate('/verify-email');
      return;
    }

    setEmail(verifiedEmail);
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const tempToken = localStorage.getItem('tempToken');

      const response = await axios.post(
        `${API_URL}/api/auth/set-initial-password`,
        {
          tempToken,
          newPassword: password
        },
        { withCredentials: true }
      );

      // Clear temporary data
      localStorage.removeItem('tempToken');
      localStorage.removeItem('verifiedEmail');

      // Store user data
      localStorage.setItem('user', JSON.stringify(response.data.user));
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
      }

      // Success! Redirect to gallery
      navigate('/gallery');
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Verification session expired. Please verify your email again.');
        setTimeout(() => navigate('/verify-email'), 2000);
      } else {
        setError(err.response?.data?.error || 'Failed to set password');
      }
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrength = () => {
    if (password.length === 0) return '';
    if (password.length < 8) return 'weak';
    if (password.length < 12) return 'medium';
    return 'strong';
  };

  const passwordStrength = getPasswordStrength();

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Set Up Your Password</h1>
          <p>Create a secure password for your account</p>
          {email && (
            <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
              {email}
            </small>
          )}
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              minLength={8}
              autoFocus
            />
            {password && (
              <div style={{ marginTop: '0.5rem' }}>
                <div
                  style={{
                    height: '4px',
                    backgroundColor: '#e0e0e0',
                    borderRadius: '2px',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width:
                        passwordStrength === 'weak'
                          ? '33%'
                          : passwordStrength === 'medium'
                          ? '66%'
                          : '100%',
                      backgroundColor:
                        passwordStrength === 'weak'
                          ? '#ff4444'
                          : passwordStrength === 'medium'
                          ? '#ffaa00'
                          : '#00cc66',
                      transition: 'all 0.3s ease'
                    }}
                  />
                </div>
                <small
                  style={{
                    display: 'block',
                    marginTop: '0.25rem',
                    color:
                      passwordStrength === 'weak'
                        ? '#ff4444'
                        : passwordStrength === 'medium'
                        ? '#ffaa00'
                        : '#00cc66'
                  }}
                >
                  {passwordStrength === 'weak' && 'Weak password'}
                  {passwordStrength === 'medium' && 'Medium password'}
                  {passwordStrength === 'strong' && 'Strong password'}
                </small>
              </div>
            )}
            <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
              Must be at least 8 characters long
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Confirm your password"
              minLength={8}
            />
            {confirmPassword && password !== confirmPassword && (
              <small style={{ display: 'block', marginTop: '0.25rem', color: '#ff4444' }}>
                Passwords do not match
              </small>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || password.length < 8 || password !== confirmPassword}
          >
            {loading ? 'Setting Up...' : 'Set Password & Continue'}
          </button>
        </form>

        <div className="auth-footer">
          <p style={{ fontSize: '0.875rem', color: '#666' }}>
            By setting up your password, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
