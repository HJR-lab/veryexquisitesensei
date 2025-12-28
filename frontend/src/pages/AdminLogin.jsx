import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import '../styles/Auth.css';

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

    console.log('Admin login attempt:', { email, passwordLength: password.length });

    try {
      // Only allow info@ves.sg to use admin login
      if (email !== 'info@ves.sg') {
        setError('This login is for administrators only. Please use the regular login page.');
        setLoading(false);
        return;
      }

      console.log('Calling login API...');
      const response = await login(email, password);
      console.log('Login response:', response);

      // Check if user is actually admin
      if (response.user.email === 'info@ves.sg') {
        console.log('Admin login successful, navigating to /admin');
        navigate('/admin');
      } else {
        console.log('User is not admin:', response.user);
        setError('Access denied. Admin credentials required.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.error || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>VES Admin Portal</h1>
          <p>Administrator Access Only</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="email">Admin Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="info@ves.sg"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Admin Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter admin password"
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Admin Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Not an admin? <Link to="/login">Student Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
