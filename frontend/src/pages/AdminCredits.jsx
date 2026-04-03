import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';

export default function AdminCredits() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [log, setLog] = useState([]);
  const [tab, setTab] = useState('students'); // 'students' | 'log'
  const [search, setSearch] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    loadData();
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/credits/overview');
      setStudents(data.students || []);
      setLog(data.log || []);
    } catch (err) {
      console.error('Failed to load credits:', err);
    } finally {
      setLoading(false);
    }
  };

  const q = search.toLowerCase();
  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
  );
  const filteredLog = log.filter(l =>
    l.name.toLowerCase().includes(q) || (l.description || '').toLowerCase().includes(q)
  );

  const totalBalance = students.reduce((s, r) => s + r.balance, 0);
  const totalEarned = students.reduce((s, r) => s + r.earned, 0);
  const totalSpent = students.reduce((s, r) => s + r.spent, 0);

  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const fmtTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '960px', margin: '0 auto', padding: isMobile ? '20px 16px 60px' : '32px 24px 60px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => navigate('/admin')}
            style={{ background: 'none', border: 'none', color: TC, fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>arrow_back</span>
            Dashboard
          </button>
          <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>
            Credits
          </h1>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}`, marginBottom: '24px' }}>
          {[
            { label: 'Total Earned', value: `$${totalEarned}`, color: '#059669' },
            { label: 'Total Spent', value: `$${totalSpent}`, color: INK },
            { label: 'Outstanding', value: `$${totalBalance}`, color: TC },
          ].map((c) => (
            <div key={c.label} style={{ backgroundColor: '#fff', padding: '18px 20px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '6px' }}>{c.label}</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: c.color, letterSpacing: '-0.5px' }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs + search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '0' }}>
            {['students', 'log'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '8px 20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  border: `1px solid ${RULE}`,
                  borderRight: t === 'students' ? 'none' : `1px solid ${RULE}`,
                  backgroundColor: tab === t ? TC_LIGHT : '#fff',
                  color: tab === t ? TC : MUTED,
                  cursor: 'pointer',
                }}
              >
                {t === 'students' ? 'By Student' : 'Transaction Log'}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: '13px',
              border: `1px solid ${RULE}`,
              backgroundColor: '#fff',
              outline: 'none',
              width: isMobile ? '100%' : '220px',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading...</div>
        ) : tab === 'students' ? (
          /* Student breakdown table */
          <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#fff', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${RULE}` }}>
                  {['Student', 'Earned', 'Spent', 'Balance'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Student' ? 'left' : 'right', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: MUTED }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: MUTED }}>No students with credits</td></tr>
                ) : filteredStudents.map(s => (
                  <tr
                    key={s.customerId}
                    style={{ borderBottom: `1px solid ${RULE}`, cursor: 'pointer' }}
                    onClick={() => navigate(`/admin/students/${encodeURIComponent(s.email)}`)}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: MUTED }}>{s.email}</div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>${s.earned}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: INK }}>${s.spent}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: s.balance > 0 ? TC : MUTED }}>${s.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Transaction log */
          <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#fff' }}>
            {filteredLog.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No transactions</div>
            ) : filteredLog.map((tx, i) => (
              <div
                key={tx.id}
                style={{
                  padding: '12px 16px',
                  borderBottom: i < filteredLog.length - 1 ? `1px solid ${RULE}` : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '16px', color: tx.type === 'earn' ? '#059669' : '#DC2626', flexShrink: 0 }}
                >
                  {tx.type === 'earn' ? 'add_circle' : 'remove_circle'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{tx.name}</span>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: tx.type === 'earn' ? '#059669' : '#DC2626',
                    }}>
                      {tx.type === 'earn' ? '+' : '-'}${tx.amount}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: MUTED }}>
                    {tx.description || tx.source || 'Credit transaction'}
                    <span style={{ marginLeft: '8px' }}>{fmtDate(tx.createdAt)} {fmtTime(tx.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
