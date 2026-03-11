import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';

export default function ImpersonationBanner() {
  const { user } = useAuth();
  const isImpersonating = user && user.impersonatedBy;
  const isAdmin = user && (user.isAdmin || user.impersonatedBy);

  if (!isAdmin) return null;

  const handleReturnToAdmin = async () => {
    try {
      if (isImpersonating) {
        await api.post('/auth/stop-impersonation');
      }
      const returnPath = localStorage.getItem('adminReturnPath') || '/admin/students';
      localStorage.removeItem('adminReturnPath');
      window.location.href = returnPath;
    } catch (error) {
      console.error('Error returning to admin:', error);
      window.location.href = '/admin/students';
    }
  };

  return (
    <div style={{
      backgroundColor: isImpersonating ? '#F0F4F8' : '#F5F3F0',
      borderBottom: '1px solid ' + (isImpersonating ? '#D8DEE4' : 'rgba(40,40,40,0.09)'),
      padding: '0 20px', height: '32px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
    }}>
      {isImpersonating ? (
        <>
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
        </>
      ) : (
        <button
          onClick={() => { window.location.href = '/admin/students'; }}
          style={{
            padding: '3px 14px', backgroundColor: '#C4622D', color: '#FFFFFF',
            fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
            border: 'none', borderRadius: '3px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>admin_panel_settings</span>
          Admin Panel
        </button>
      )}
    </div>
  );
}
