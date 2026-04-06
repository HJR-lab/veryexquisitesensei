import { useState, useEffect } from 'react';
import api from '../utils/api';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = dateStr.length === 10 ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const day = d.getDate();
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  return `${day} ${mon}`;
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  return timeStr.slice(0, 5);
}

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const day = d.getDate();
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  const hr = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${hr}:${mn}`;
}

function classTypeShort(type) {
  if (!type) return '';
  const t = type.toLowerCase();
  if (t.includes('wheel')) return 'WT';
  if (t.includes('hand')) return 'HB';
  return type.substring(0, 2).toUpperCase();
}

function FeeBadge({ fee }) {
  if (!fee) return <span style={{ color: MUTED }}>—</span>;
  const colors = {
    paid:    { bg: '#DEF7EC', color: '#03543F' },
    pending: { bg: '#FEF3C7', color: '#92400E' },
    waived:  { bg: '#E5E7EB', color: '#374151' },
  };
  const s = colors[fee.status] || colors.pending;
  return (
    <span>
      <span style={{ fontWeight: 600 }}>${fee.amount}</span>{' '}
      <span style={{
        display: 'inline-block',
        fontSize: '9px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        padding: '2px 5px',
        borderRadius: '2px',
        backgroundColor: s.bg,
        color: s.color,
      }}>
        {fee.status}
      </span>
    </span>
  );
}

export default function AdminReschedules() {
  const [reschedules, setReschedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredRow, setHoveredRow] = useState(null);

  useEffect(() => {
    api.get('/admin/reschedules')
      .then(({ data }) => {
        setReschedules(data.reschedules || []);
      })
      .catch(err => {
        console.error('Failed to load reschedules:', err);
        setError('Failed to load reschedules');
      })
      .finally(() => setLoading(false));
  }, []);

  const columns = ['Student', 'Type', 'From', 'To', 'Reason', 'Fee', 'Date'];

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>
            VES Pottery Studio
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>
            Reschedules
          </h1>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '13px', color: MUTED }}>
            Loading reschedules...
          </div>
        ) : error ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '13px', color: '#C0392B' }}>
            {error}
          </div>
        ) : reschedules.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '13px', color: MUTED }}>
            No reschedules found.
          </div>
        ) : (
          <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {columns.map(col => (
                    <th
                      key={col}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'left',
                        fontSize: '9px',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: MUTED,
                        borderBottom: `1px solid ${RULE}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reschedules.map((r, i) => (
                  <tr
                    key={r.id}
                    onMouseEnter={() => setHoveredRow(i)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      backgroundColor: hoveredRow === i ? TC_LIGHT : 'transparent',
                      transition: 'background-color 0.1s',
                    }}
                  >
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' }}>
                      {r.student ? (
                        <a
                          href={`/admin/students/${encodeURIComponent(r.student.email)}`}
                          style={{ color: TC_DARK, textDecoration: 'none', fontWeight: 600 }}
                          onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                          onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                        >
                          {r.student.name || r.student.email}
                        </a>
                      ) : (
                        <span style={{ color: MUTED }}>Unknown</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                        padding: '2px 5px', borderRadius: '2px',
                        backgroundColor: r.source === 'student' ? '#DBEAFE' : '#FEE2E2',
                        color: r.source === 'student' ? '#1E40AF' : '#991B1B',
                      }}>
                        {r.source === 'student' ? 'Rescheduled' : 'Cancelled'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' }}>
                      {r.fromDate ? (
                        <>
                          {formatDate(r.fromDate)}
                          {r.fromTime ? ` \u00b7 ${formatTime(r.fromTime)}` : ''}
                          {r.fromType ? ` \u00b7 ${classTypeShort(r.fromType)}` : ''}
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' }}>
                      {r.toDate ? (
                        <>
                          {formatDate(r.toDate)}
                          {r.toTime ? ` \u00b7 ${formatTime(r.toTime)}` : ''}
                          {r.toType ? ` \u00b7 ${classTypeShort(r.toType)}` : ''}
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.reason || <span style={{ color: MUTED }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' }}>
                      <FeeBadge fee={r.fee} />
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap', color: MUTED }}>
                      {formatDateTime(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
