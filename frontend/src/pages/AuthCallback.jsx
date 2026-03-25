import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../utils/supabase';
import { useAuth } from '../hooks/useAuth';
import '../styles/Auth.css';

export default function AuthCallback() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase client auto-detects the token fragment in the URL
      const { error } = await supabase.auth.getSession();
      if (error) {
        console.error('Auth callback error:', error);
        setError('Sign-in failed. Please try again.');
      }
      // onAuthStateChange in useAuth will handle the rest (fetch user, set state)
    };

    handleCallback();

    // Timeout if user never populates (e.g., no customers row for this email)
    const timeout = setTimeout(() => {
      setError('Unable to sign in. Your email may not be registered. Please contact VES staff.');
    }, 15000);

    return () => clearTimeout(timeout);
  }, []);

  // Once user is populated by useAuth, redirect
  useEffect(() => {
    if (user) {
      if (user.isAdmin) {
        navigate('/admin', { replace: true });
      } else if (user.hasMembership && !user.hasActiveEnrollments) {
        navigate('/member', { replace: true });
      } else {
        navigate('/gallery', { replace: true });
      }
    }
  }, [user, navigate]);

  if (error) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Sign-In Failed</h1>
            <p>{error}</p>
          </div>
          <button className="btn-primary" onClick={() => navigate('/login')}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Signing you in...</h1>
          <div className="spinner" style={{ margin: '2rem auto' }}></div>
        </div>
      </div>
    </div>
  );
}
