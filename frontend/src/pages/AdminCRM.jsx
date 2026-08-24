import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import AdminPage from '../components/AdminPage';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// ─── Status badge colors ──────────────────────────────────────────────────────
const STATUS_COLORS = {
  draft:     { bg: '#E8E8E8', color: '#555' },
  scheduled: { bg: '#DBEAFE', color: '#1D4ED8' },
  sent:      { bg: '#D1FAE5', color: '#065F46' },
  active:    { bg: '#D1FAE5', color: '#065F46' },
  paused:    { bg: '#FEF3C7', color: '#92400E' },
  upcoming:  { bg: '#DBEAFE', color: '#1D4ED8' },
  past:      { bg: '#E8E8E8', color: '#555' },
  cancelled: { bg: '#FEE2E2', color: '#991B1B' },
};

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputSt = {
  width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`,
  fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box',
  outline: 'none', color: INK,
};
const labelSt = {
  fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px',
};
const btnPrimary = {
  padding: '8px 18px', backgroundColor: TC, color: '#FFF', border: 'none',
  fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
};
const btnSecondary = {
  padding: '8px 18px', backgroundColor: '#FFF', color: INK, border: `1px solid ${RULE}`,
  fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer',
};

const SEGMENTS = [
  { key: 'all', label: 'All Customers' },
  { key: 'returning', label: 'Returning' },
  { key: 'vip', label: 'VIP' },
  { key: 'active', label: 'Active' },
  { key: 'lapsed_30', label: 'Lapsed 30 days' },
  { key: 'lapsed_60', label: 'Lapsed 60 days' },
  { key: 'lapsed_90', label: 'Lapsed 90 days' },
  { key: 'hb_students', label: 'HB Students' },
  { key: 'wt_students', label: 'WT Students' },
  { key: 'has_credits', label: 'Has Credits' },
  { key: 'members', label: 'Members' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Badge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 600, borderRadius: '3px', backgroundColor: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

// ─── Audience Preview ─────────────────────────────────────────────────────────
function AudiencePreview({ segmentKey }) {
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!segmentKey) { setCount(null); return; }
    setLoading(true);
    api.get(`/admin/crm/segments/${segmentKey}/preview`)
      .then(r => setCount(r.data?.count ?? 0))
      .catch(() => setCount(null))
      .finally(() => setLoading(false));
  }, [segmentKey]);

  if (!segmentKey) return null;
  return (
    <span style={{ fontSize: '12px', color: MUTED, marginLeft: '8px' }}>
      {loading ? '...' : count !== null ? `${count} recipients` : ''}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGNS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function CampaignsTab() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | form | stats
  const [editing, setEditing] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [statsCampaign, setStatsCampaign] = useState(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const showStatus = (type, text) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/crm/campaigns');
      setCampaigns(r.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing({ name: '', subject: '', segment: 'all', html_body: '', schedule_at: '' });
    setView('form');
  };

  const openEdit = (c) => {
    setEditing({ ...c });
    setView('form');
  };

  const openStats = async (c) => {
    setStatsCampaign(c);
    try {
      const r = await api.get(`/admin/crm/campaigns/${c.id}/stats`);
      setStatsData(r.data);
    } catch { setStatsData(null); }
    setView('stats');
  };

  const saveDraft = async () => {
    setBusy(true);
    try {
      if (editing.id) {
        await api.patch(`/admin/crm/campaigns/${editing.id}`, editing);
      } else {
        const r = await api.post('/admin/crm/campaigns', editing);
        setEditing(r.data);
      }
      showStatus('success', 'Saved');
      load();
    } catch (e) {
      showStatus('error', e.response?.data?.error || 'Save failed');
    }
    setBusy(false);
  };

  const sendNow = async () => {
    if (!editing?.id) { showStatus('error', 'Save as draft first'); return; }
    if (!window.confirm('Send this campaign now?')) return;
    setBusy(true);
    try {
      const r = await api.post(`/admin/crm/campaigns/${editing.id}/send`);
      showStatus('success', `Sent to ${r.data?.sent || 0} recipients`);
      setView('list');
      load();
    } catch (e) {
      showStatus('error', e.response?.data?.error || 'Send failed');
    }
    setBusy(false);
  };

  const deleteDraft = async (id) => {
    if (!window.confirm('Delete this draft?')) return;
    try {
      await api.delete(`/admin/crm/campaigns/${id}`);
      load();
    } catch { /* ignore */ }
  };

  // ── Stats view ──
  if (view === 'stats' && statsCampaign) {
    const s = statsData || {};
    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <span onClick={() => setView('list')} style={{ cursor: 'pointer', color: TC, fontSize: '13px' }}>&larr; Back to campaigns</span>
        </div>
        <h3 style={{ margin: '0 0 4px', color: INK }}>{statsCampaign.name}</h3>
        <p style={{ margin: '0 0 20px', color: MUTED, fontSize: '13px' }}>{statsCampaign.subject}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
          {[
            { label: 'Sent', val: s.total_sent },
            { label: 'Delivered', val: s.delivered },
            { label: 'Opened', val: s.opened },
            { label: 'Clicked', val: s.clicked },
            { label: 'Bounced', val: s.bounced },
            { label: 'Open Rate', val: s.open_rate != null ? `${s.open_rate}%` : '—' },
          ].map(x => (
            <div key={x.label} style={{ padding: '16px', backgroundColor: ALT, textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: INK }}>{x.val ?? '—'}</div>
              <div style={{ fontSize: '11px', color: MUTED, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{x.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Form view ──
  if (view === 'form' && editing) {
    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <span onClick={() => setView('list')} style={{ cursor: 'pointer', color: TC, fontSize: '13px' }}>&larr; Back to campaigns</span>
        </div>
        {statusMsg && (
          <div style={{ padding: '8px 12px', marginBottom: '12px', fontSize: '13px', backgroundColor: statusMsg.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: statusMsg.type === 'success' ? '#065F46' : '#991B1B' }}>
            {statusMsg.text}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelSt}>Name</label>
            <input style={inputSt} value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label style={labelSt}>Subject</label>
            <input style={inputSt} value={editing.subject} onChange={e => setEditing(p => ({ ...p, subject: e.target.value }))} />
          </div>
          <div>
            <label style={labelSt}>Segment</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <select style={{ ...inputSt, width: 'auto', minWidth: '180px' }} value={editing.segment} onChange={e => setEditing(p => ({ ...p, segment: e.target.value }))}>
                {SEGMENTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <AudiencePreview segmentKey={editing.segment} />
            </div>
          </div>
          <div>
            <label style={labelSt}>HTML Body</label>
            <textarea
              style={{ ...inputSt, height: '300px', fontFamily: 'monospace', fontSize: '12px' }}
              value={editing.html_body || ''}
              onChange={e => setEditing(p => ({ ...p, html_body: e.target.value }))}
            />
          </div>
          <div>
            <label style={labelSt}>Schedule (optional)</label>
            <input type="datetime-local" style={{ ...inputSt, width: 'auto' }} value={editing.schedule_at || ''} onChange={e => setEditing(p => ({ ...p, schedule_at: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button style={btnPrimary} onClick={saveDraft} disabled={busy}>{busy ? 'Saving...' : 'Save Draft'}</button>
            <button style={{ ...btnPrimary, backgroundColor: '#065F46' }} onClick={sendNow} disabled={busy}>Send Now</button>
          </div>
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: INK }}>Campaigns</h3>
        <button style={btnPrimary} onClick={openNew}>New Campaign</button>
      </div>
      {statusMsg && (
        <div style={{ padding: '8px 12px', marginBottom: '12px', fontSize: '13px', backgroundColor: statusMsg.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: statusMsg.type === 'success' ? '#065F46' : '#991B1B' }}>
          {statusMsg.text}
        </div>
      )}
      {loading ? (
        <div style={{ color: MUTED, fontSize: '13px', padding: '20px 0' }}>Loading...</div>
      ) : campaigns.length === 0 ? (
        <div style={{ color: MUTED, fontSize: '13px', padding: '20px 0' }}>No campaigns yet. Create your first one.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${RULE}` }}>
              {['Name', 'Segment', 'Status', 'Sent', 'Open Rate', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: MUTED, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${RULE}`, cursor: 'pointer' }} onClick={() => c.status === 'draft' ? openEdit(c) : openStats(c)}>
                <td style={{ padding: '10px' }}>{c.name}</td>
                <td style={{ padding: '10px', color: MUTED }}>{c.segment}</td>
                <td style={{ padding: '10px' }}><Badge status={c.status} /></td>
                <td style={{ padding: '10px' }}>{c.sent_count || 0}</td>
                <td style={{ padding: '10px' }}>{c.open_count && c.sent_count ? `${Math.round((c.open_count / c.sent_count) * 100)}%` : '—'}</td>
                <td style={{ padding: '10px' }}>
                  {c.status === 'draft' && (
                    <button onClick={e => { e.stopPropagation(); deleteDraft(c.id); }} style={{ ...btnSecondary, padding: '4px 10px', fontSize: '11px', color: '#991B1B' }}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTOMATION TAB
// ═══════════════════════════════════════════════════════════════════════════════
function AutomationTab() {
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const showStatus = (type, text) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/crm/automations');
      setAutomations(r.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleStatus = async (a) => {
    const next = a.status === 'active' ? 'paused' : 'active';
    // Must have subject and html_body to activate
    if (next === 'active' && (!a.subject || !a.html_body)) {
      showStatus('error', 'Configure subject and HTML body before activating');
      return;
    }
    try {
      await api.patch(`/admin/crm/automations/${a.id}`, { status: next });
      load();
    } catch (e) {
      showStatus('error', e.response?.data?.error || 'Toggle failed');
    }
  };

  const openConfigure = (a) => {
    if (expandedId === a.id) { setExpandedId(null); return; }
    setExpandedId(a.id);
    setEditDraft({ subject: a.subject || '', html_body: a.html_body || '', trigger_days: a.trigger_days || '', segment: a.segment || 'all' });
  };

  const saveAutomation = async (id) => {
    setBusy(true);
    try {
      await api.patch(`/admin/crm/automations/${id}`, editDraft);
      showStatus('success', 'Saved');
      load();
    } catch (e) {
      showStatus('error', e.response?.data?.error || 'Save failed');
    }
    setBusy(false);
  };

  const triggerLabel = (a) => {
    if (a.trigger_type && a.trigger_days) return `${a.trigger_days} days after ${a.trigger_type.replace(/_/g, ' ')}`;
    if (a.trigger_type) return a.trigger_type.replace(/_/g, ' ');
    return '—';
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', color: INK }}>Automated Flows</h3>
      {statusMsg && (
        <div style={{ padding: '8px 12px', marginBottom: '12px', fontSize: '13px', backgroundColor: statusMsg.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: statusMsg.type === 'success' ? '#065F46' : '#991B1B' }}>
          {statusMsg.text}
        </div>
      )}
      {loading ? (
        <div style={{ color: MUTED, fontSize: '13px', padding: '20px 0' }}>Loading...</div>
      ) : automations.length === 0 ? (
        <div style={{ color: MUTED, fontSize: '13px', padding: '20px 0' }}>No automations configured.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {automations.map(a => (
            <div key={a.id} style={{ border: `1px solid ${RULE}`, padding: '16px', backgroundColor: '#FFF' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, color: INK, marginBottom: '4px' }}>{a.name}</div>
                  <div style={{ fontSize: '12px', color: MUTED }}>{triggerLabel(a)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '12px', color: MUTED, textAlign: 'right' }}>
                    <div>{a.total_sends || 0} sends</div>
                    {a.last_sent_at && <div>Last: {fmtDate(a.last_sent_at)}</div>}
                  </div>
                  {/* Toggle switch */}
                  <div
                    onClick={() => toggleStatus(a)}
                    style={{
                      width: '40px', height: '22px', borderRadius: '11px', cursor: 'pointer',
                      backgroundColor: a.status === 'active' ? '#065F46' : '#CCC',
                      position: 'relative', transition: 'background-color 0.2s',
                    }}
                  >
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#FFF',
                      position: 'absolute', top: '2px',
                      left: a.status === 'active' ? '20px' : '2px',
                      transition: 'left 0.2s',
                    }} />
                  </div>
                  <button style={{ ...btnSecondary, padding: '5px 12px', fontSize: '12px' }} onClick={() => openConfigure(a)}>
                    {expandedId === a.id ? 'Close' : 'Configure'}
                  </button>
                </div>
              </div>

              {/* Expanded edit form */}
              {expandedId === a.id && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${RULE}`, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={labelSt}>Subject</label>
                    <input style={inputSt} value={editDraft.subject} onChange={e => setEditDraft(p => ({ ...p, subject: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelSt}>HTML Body</label>
                    <textarea style={{ ...inputSt, height: '200px', fontFamily: 'monospace', fontSize: '12px' }} value={editDraft.html_body} onChange={e => setEditDraft(p => ({ ...p, html_body: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: '14px' }}>
                    <div style={{ flex: '0 0 120px' }}>
                      <label style={labelSt}>Trigger Days</label>
                      <input type="number" style={inputSt} value={editDraft.trigger_days} onChange={e => setEditDraft(p => ({ ...p, trigger_days: e.target.value }))} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelSt}>Segment</label>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <select style={{ ...inputSt, width: 'auto', minWidth: '180px' }} value={editDraft.segment} onChange={e => setEditDraft(p => ({ ...p, segment: e.target.value }))}>
                          {SEGMENTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                        <AudiencePreview segmentKey={editDraft.segment} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <button style={btnPrimary} onClick={() => saveAutomation(a.id)} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function EventsTab() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | form | detail
  const [editing, setEditing] = useState(null);
  const [detailEvent, setDetailEvent] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const showStatus = (type, text) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/crm/events');
      setEvents(r.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing({
      title: '', description: '', event_date: '', location: 'VES Pottery Studio, 75 Jalan Kelabu Asap, Singapore 278268',
      max_capacity: '', rsvp_deadline: '', segment: 'all',
    });
    setView('form');
  };

  const openDetail = async (ev) => {
    setDetailEvent(ev);
    try {
      const r = await api.get(`/admin/crm/events/${ev.id}/rsvps`);
      setRsvps(r.data || []);
    } catch { setRsvps([]); }
    setView('detail');
  };

  const createEvent = async () => {
    setBusy(true);
    try {
      await api.post('/admin/crm/events', editing);
      showStatus('success', 'Event created');
      setView('list');
      load();
    } catch (e) {
      showStatus('error', e.response?.data?.error || 'Create failed');
    }
    setBusy(false);
  };

  const sendInvites = async (id) => {
    if (!window.confirm('Send invitations to the target segment?')) return;
    setBusy(true);
    try {
      const r = await api.post(`/admin/crm/events/${id}/invite`);
      showStatus('success', `Invites sent to ${r.data?.sent || 0} recipients`);
      // refresh rsvps
      const rr = await api.get(`/admin/crm/events/${id}/rsvps`);
      setRsvps(rr.data || []);
      load();
    } catch (e) {
      showStatus('error', e.response?.data?.error || 'Send failed');
    }
    setBusy(false);
  };

  // ── RSVP Detail view ──
  if (view === 'detail' && detailEvent) {
    const attending = rsvps.filter(r => r.status === 'attending');
    const declined = rsvps.filter(r => r.status === 'declined');
    const noResponse = rsvps.filter(r => !r.status || r.status === 'invited');

    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <span onClick={() => setView('list')} style={{ cursor: 'pointer', color: TC, fontSize: '13px' }}>&larr; Back to events</span>
        </div>
        {statusMsg && (
          <div style={{ padding: '8px 12px', marginBottom: '12px', fontSize: '13px', backgroundColor: statusMsg.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: statusMsg.type === 'success' ? '#065F46' : '#991B1B' }}>
            {statusMsg.text}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', color: INK }}>{detailEvent.title}</h3>
            <div style={{ fontSize: '13px', color: MUTED }}>{fmtDate(detailEvent.event_date)}</div>
          </div>
          <button style={btnPrimary} onClick={() => sendInvites(detailEvent.id)} disabled={busy}>{busy ? 'Sending...' : 'Send Invites'}</button>
        </div>

        {/* RSVP summary */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Attending', count: attending.length, color: '#065F46' },
            { label: 'Declined', count: declined.length, color: '#991B1B' },
            { label: 'No Response', count: noResponse.length, color: MUTED },
          ].map(x => (
            <div key={x.label} style={{ padding: '12px 20px', backgroundColor: ALT, textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: x.color }}>{x.count}</div>
              <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{x.label}</div>
            </div>
          ))}
        </div>

        {/* RSVP list */}
        {rsvps.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${RULE}` }}>
                {['Name', 'Email', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: MUTED, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rsvps.map((r, i) => {
                const cust = r.customers || {};
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${RULE}` }}>
                    <td style={{ padding: '10px' }}>{[cust.first_name, cust.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td style={{ padding: '10px', color: MUTED }}>{cust.email || '—'}</td>
                    <td style={{ padding: '10px' }}><Badge status={r.status || 'invited'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── New Event Form ──
  if (view === 'form' && editing) {
    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <span onClick={() => setView('list')} style={{ cursor: 'pointer', color: TC, fontSize: '13px' }}>&larr; Back to events</span>
        </div>
        {statusMsg && (
          <div style={{ padding: '8px 12px', marginBottom: '12px', fontSize: '13px', backgroundColor: statusMsg.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: statusMsg.type === 'success' ? '#065F46' : '#991B1B' }}>
            {statusMsg.text}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelSt}>Title</label>
            <input style={inputSt} value={editing.title} onChange={e => setEditing(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div>
            <label style={labelSt}>Description</label>
            <textarea style={{ ...inputSt, height: '100px' }} value={editing.description} onChange={e => setEditing(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: '14px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelSt}>Event Date</label>
              <input type="date" style={inputSt} value={editing.event_date} onChange={e => setEditing(p => ({ ...p, event_date: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelSt}>RSVP Deadline (optional)</label>
              <input type="date" style={inputSt} value={editing.rsvp_deadline} onChange={e => setEditing(p => ({ ...p, rsvp_deadline: e.target.value }))} />
            </div>
          </div>
          <div>
            <label style={labelSt}>Location</label>
            <input style={inputSt} value={editing.location} onChange={e => setEditing(p => ({ ...p, location: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: '14px' }}>
            <div style={{ flex: '0 0 160px' }}>
              <label style={labelSt}>Max Capacity (optional)</label>
              <input type="number" style={inputSt} value={editing.max_capacity} onChange={e => setEditing(p => ({ ...p, max_capacity: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelSt}>Target Segment</label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <select style={{ ...inputSt, width: 'auto', minWidth: '180px' }} value={editing.segment} onChange={e => setEditing(p => ({ ...p, segment: e.target.value }))}>
                  {SEGMENTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <AudiencePreview segmentKey={editing.segment} />
              </div>
            </div>
          </div>
          <div style={{ marginTop: '4px' }}>
            <button style={btnPrimary} onClick={createEvent} disabled={busy}>{busy ? 'Creating...' : 'Create Event'}</button>
          </div>
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: INK }}>Events</h3>
        <button style={btnPrimary} onClick={openNew}>New Event</button>
      </div>
      {loading ? (
        <div style={{ color: MUTED, fontSize: '13px', padding: '20px 0' }}>Loading...</div>
      ) : events.length === 0 ? (
        <div style={{ color: MUTED, fontSize: '13px', padding: '20px 0' }}>No events yet. Create your first one.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${RULE}` }}>
              {['Title', 'Date', 'RSVPs', 'Status'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: MUTED, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map(ev => (
              <tr key={ev.id} style={{ borderBottom: `1px solid ${RULE}`, cursor: 'pointer' }} onClick={() => openDetail(ev)}>
                <td style={{ padding: '10px' }}>{ev.title}</td>
                <td style={{ padding: '10px', color: MUTED }}>{fmtDate(ev.event_date)}</td>
                <td style={{ padding: '10px' }}>{ev.rsvp_attending || 0} attending / {ev.rsvp_invited || 0} invited</td>
                <td style={{ padding: '10px' }}><Badge status={ev.status || 'upcoming'} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'automation', label: 'Automation' },
  { key: 'events', label: 'Events' },
];

export default function AdminCRM() {
  const [tab, setTab] = useState('campaigns');

  return (
    <AdminPage title="CRM">
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0', borderBottom: `1px solid ${RULE}`, marginBottom: '24px' }}>
        {TABS.map(t => (
          <div
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
              color: tab === t.key ? TC_DARK : MUTED,
              borderBottom: tab === t.key ? `2px solid ${TC}` : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'automation' && <AutomationTab />}
      {tab === 'events' && <EventsTab />}
    </AdminPage>
  );
}
