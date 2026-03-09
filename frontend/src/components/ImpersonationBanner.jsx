import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authAPI } from '../utils/api';

export default function ImpersonationBanner() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const isImpersonating = user && user.impersonatedBy;

  if (!isImpersonating) return null;

  const handleReturnToAdmin = async () => {
    if (user && user.originalAdminToken) {
      try {
        localStorage.setItem('token', user.originalAdminToken);
        const adminData = await authAPI.getMe();
        updateUser(adminData.user);
        navigate('/admin/students');
      } catch (error) {
        console.error('Error returning to admin:', error);
        window.location.reload();
      }
    }
  };

  return (
    <div style={{
      backgroundColor: '#F0F4F8', borderBottom: '1px solid #D8DEE4',
      padding: '0 20px', height: '32px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
    }}>
      <span style={{ fontSize: '12px', color: '#5A7A9A', letterSpacing: '0.02em' }}>
        Viewing as <strong style={{ color: '#2D6A9F' }}>{user?.firstName} {user?.lastName || ''}</strong>
      </span>
      <button
        onClick={handleReturnToAdmin}
        style={{
          padding: '3px 14px', backgroundColor: '#2D6A9F', color: '#FFFFFF',
          fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
          border: 'none', borderRadius: '3px', cursor: 'pointer',
        }}
      >
        Return to Admin
      </button>
    </div>
  );
}
