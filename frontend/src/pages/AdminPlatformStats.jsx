import { useState, useEffect } from 'react';
import api from '../utils/api';
import AdminPage from '../components/AdminPage';

const MUTED = '#888888';
const RULE  = 'rgba(40,40,40,0.09)';

export default function AdminPlatformStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/admin/platform-stats')
      .then(({ data }) => setStats(data))
      .catch(() => setError('Failed to load platform stats'))
      .finally(() => setLoading(false));
  }, []);

  const avgLogins = stats && stats.studentsWhoLoggedIn > 0
    ? (stats.totalLogins / stats.studentsWhoLoggedIn).toFixed(1)
    : '0';

  const cards = stats ? [
    { label: 'Total Students',         value: stats.totalCustomers },
    { label: 'Total Enrollments',      value: stats.totalEnrollments },
    { label: 'Total Bookings',         value: stats.totalBookings },
    { label: 'Gallery Pieces',         value: stats.totalPotteryPieces },
    { label: 'Active Memberships',     value: stats.totalMemberships },
    { label: 'Total Classes',          value: stats.totalClassInstances },
    { label: 'Students Who Logged In', value: stats.studentsWhoLoggedIn },
    { label: 'Avg Logins / Student',   value: avgLogins },
  ] : [];

  return (
    <AdminPage title="Platform Stats">
      {loading && (
        <div style={{ fontSize: '13px', color: MUTED }}>Loading stats…</div>
      )}

      {error && (
        <div style={{ fontSize: '13px', color: '#DC2626' }}>{error}</div>
      )}

      {!loading && !error && stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '1px',
          backgroundColor: RULE,
          border: `1px solid ${RULE}`,
        }}>
          {cards.map((card) => (
            <div
              key={card.label}
              style={{
                backgroundColor: '#FFFFFF',
                padding: '24px 20px',
              }}
            >
              <div style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1, marginBottom: '8px' }}>
                {card.value}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>
                {card.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
