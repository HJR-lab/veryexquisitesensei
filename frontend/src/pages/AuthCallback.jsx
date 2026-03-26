import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../utils/supabase';
import { useAuth } from '../hooks/useAuth';
import '../styles/Auth.css';

export default function AuthCallback() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const handleCallback = async () => {
      // Check for error params in URL (expired/invalid link)
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const urlError = params.get('error_description') || hashParams.get('error_description');
      if (urlError) {
        setError(urlError.includes('expired')
          ? 'This sign-in link has expired. Please request a new one.'
          : `Sign-in failed: ${urlError}`
        );
        return;
      }

      // Exchange code for session (PKCE flow)
      const code = params.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          console.error('Code exchange error:', exchangeError);
          setError(exchangeError.message.includes('expired')
            ? 'This sign-in link has expired. Please request a new one.'
            : 'Sign-in failed. Please try again.'
          );
          return;
        }
      } else {
        // Implicit flow — token in hash fragment, getSession() will pick it up
        const { error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('Auth callback error:', sessionError);
          setError('Sign-in failed. Please try again.');
          return;
        }
      }
      // onAuthStateChange in useAuth will handle the rest (fetch user, set state)
    };

    handleCallback();

    // Timeout if user never populates (e.g., no customers row for this email)
    const timeout = setTimeout(() => {
      setError('Unable to sign in. Your email may not be registered. Please contact VES staff.');
    }, 30000);

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
