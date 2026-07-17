import { useState, useEffect } from 'react';
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
const GREEN    = '#1E6B1E';
const RED      = '#B42318';
const AMBER    = '#B54708';

// ─── Obligation categories ────────────────────────────────────────────────────
const CAT_COLORS = {
  urgent_customer_reply:       RED,
  makeup_or_reschedule:        '#2E7D32',
  piece_collection:            '#8B5E3C',
  firing_or_piece_status:      '#D84315',
  course_or_next_cohort:       '#1565C0',
  membership_or_studio_access: '#6A1B9A',
  payment_or_refund_sensitive: '#7A271A',
  retention_risk:              AMBER,
  general:                     MUTED,
};

const CAT_LABELS = {
  urgent_customer_reply:       'Urgent Reply',
  makeup_or_reschedule:        'Makeup / Reschedule',
  piece_collection:            'Pieces',
  firing_or_piece_status:      'Firing / Piece Status',
  course_or_next_cohort:       'Course / Cohort',
  membership_or_studio_access: 'Membership / Access',
  payment_or_refund_sensitive: 'Payment / Refund',
  retention_risk:              'Retention Risk',
  general:                     'General',
};

const TABS = [
  { key: 'all',                         label: 'All' },
  { key: 'urgent_customer_reply',       label: 'Urgent' },
  { key: 'makeup_or_reschedule',        label: 'Makeup' },
  { key: 'piece_collection',            label: 'Pieces' },
  { key: 'firing_or_piece_status',      label: 'Firing' },
  { key: 'course_or_next_cohort',       label: 'Courses' },
  { key: 'membership_or_studio_access', label: 'Membership' },
  { key: 'payment_or_refund_sensitive', label: 'Payments' },
  { key: 'retention_risk',              label: 'Retention' },
  { key: 'general',                     label: 'General' },
];

const PRIORITY_COLORS = { urgent: RED, high: AMBER, normal: MUTED, low: '#667085' };

function formatLabel(value) {
  return (value || '').replace(/_/g, ' ');
}

function riskFlags(msg) {
  return Array.isArray(msg.risk_flags) ? msg.risk_flags : [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function CategoryBadge({ category }) {
  const color = CAT_COLORS[category] || MUTED;
  const label = CAT_LABELS[category] || category;
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase', padding: '2px 7px',
      backgroundColor: color + '18', color, border: `1px solid ${color}33`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function MessageRow({ msg, isExpanded, onToggle, onSend, onDismiss, onSaveDraft }) {
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftText, setDraftText]       = useState(msg.draft_reply || '');
  const [saving, setSaving]             = useState(false);

  const senderName = msg.from_name || msg.from_email;
  const studentName = msg.customers
    ? `${msg.customers.first_name} ${msg.customers.last_name}`.trim()
    : null;

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await onSaveDraft(msg.id, draftText);
      setEditingDraft(false);
    } finally {
      setSaving(false);
    }
  };

  const isDismissed = msg.status === 'dismissed';
  const isSent      = msg.status === 'sent';

  return (
    <div style={{ borderBottom: `1px solid ${RULE}` }}>
      {/* ── Summary row ── */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '12px 16px', cursor: 'pointer',
          backgroundColor: isExpanded ? TC_LIGHT : '#FFF',
          transition: 'background-color 0.12s',
          opacity: isDismissed ? 0.5 : 1,
        }}
      >
        {/* Category badge */}
        <div style={{ flexShrink: 0, width: '90px' }}>
          <CategoryBadge category={msg.category} />
        </div>

        {/* Sender + student */}
        <div style={{ flexShrink: 0, width: '160px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {senderName}
          </div>
          {studentName && (
            <div style={{ fontSize: '11px', color: TC, marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {studentName}
            </div>
          )}
        </div>

        {/* Subject + snippet */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{msg.subject || '(no subject)'}</span>
          {msg.body_snippet && (
            <span style={{ fontSize: '12px', color: MUTED, marginLeft: '8px' }}>— {msg.body_snippet}</span>
          )}
        </div>

        {/* Status / priority pills */}
        {msg.needs_human_review && !isSent && !isDismissed && (
          <span style={{ fontSize: '10px', fontWeight: 700, color: RED, letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}>Review</span>
        )}
        {msg.priority && (
          <span style={{ fontSize: '10px', fontWeight: 700, color: PRIORITY_COLORS[msg.priority] || MUTED, letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}>
            {msg.priority}
          </span>
        )}
        {isSent && (
          <span style={{ fontSize: '10px', fontWeight: 700, color: GREEN, letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}>Sent</span>
        )}
        {isDismissed && (
          <span style={{ fontSize: '10px', fontWeight: 700, color: MUTED, letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}>Dismissed</span>
        )}

        {/* Time + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', color: MUTED }}>{timeAgo(msg.received_at)}</span>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '16px', color: MUTED, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
          >
            expand_more
          </span>
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {isExpanded && (
        <div style={{ padding: '16px 20px 20px', backgroundColor: '#FDFBF9', borderTop: `1px solid ${RULE}` }}>

          {/* Obligation state */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            <div style={{ padding: '10px 12px', backgroundColor: '#FFF', border: `1px solid ${RULE}` }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, marginBottom: '4px' }}>Next Action</div>
              <div style={{ fontSize: '13px', color: INK, lineHeight: 1.45 }}>{msg.next_action || 'Review and decide the next action.'}</div>
            </div>
            <div style={{ padding: '10px 12px', backgroundColor: '#FFF', border: `1px solid ${RULE}` }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, marginBottom: '4px' }}>Owner / Status</div>
              <div style={{ fontSize: '13px', color: INK }}>{msg.owner || 'studio'} · {formatLabel(msg.status)}</div>
            </div>
            {riskFlags(msg).length > 0 && (
              <div style={{ padding: '10px 12px', backgroundColor: '#FFF7ED', border: `1px solid ${AMBER}33` }}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: AMBER, marginBottom: '4px' }}>Risk Flags</div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  {riskFlags(msg).map(flag => (
                    <span key={flag} style={{ fontSize: '10px', fontWeight: 700, color: AMBER, backgroundColor: '#FFF', border: `1px solid ${AMBER}33`, padding: '2px 6px', textTransform: 'uppercase' }}>
                      {formatLabel(flag)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* AI summary */}
          {msg.summary && (
            <div style={{
              padding: '10px 14px', marginBottom: '16px',
              backgroundColor: TC_LIGHT, borderLeft: `3px solid ${TC}`,
              fontSize: '13px', color: INK, lineHeight: '1.5',
            }}>
              <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: TC, display: 'block', marginBottom: '4px' }}>
                AI Summary
              </span>
              {msg.summary}
              {msg.confidence != null && (
                <span style={{ fontSize: '10px', color: MUTED, marginLeft: '8px' }}>
                  ({Math.round(msg.confidence * 100)}% confidence)
                </span>
              )}
            </div>
          )}

          {/* From / meta */}
          <div style={{ display: 'flex', gap: '24px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, marginBottom: '2px' }}>From</div>
              <div style={{ fontSize: '13px', color: INK }}>
                {msg.from_name ? <><strong>{msg.from_name}</strong> &lt;{msg.from_email}&gt;</> : msg.from_email}
              </div>
            </div>
            {studentName && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, marginBottom: '2px' }}>Matched Student</div>
                <div style={{ fontSize: '13px', color: TC, fontWeight: 600 }}>{studentName}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, marginBottom: '2px' }}>Received</div>
              <div style={{ fontSize: '13px', color: INK }}>{timeAgo(msg.received_at)}</div>
            </div>
          </div>

          {/* Email body */}
          {(msg.body_full || msg.body_snippet) && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, marginBottom: '6px' }}>Email Context</div>
              <div style={{
                padding: '12px 14px', border: `1px solid ${RULE}`, backgroundColor: '#FFF',
                fontSize: '13px', color: INK, lineHeight: '1.6', whiteSpace: 'pre-wrap', maxHeight: '260px', overflowY: 'auto',
              }}>
                {msg.body_full || msg.body_snippet}
              </div>
            </div>
          )}

          {/* Draft reply */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, marginBottom: '6px' }}>Draft Reply</div>
            {editingDraft ? (
              <div>
                <textarea
                  value={draftText}
                  onChange={e => setDraftText(e.target.value)}
                  rows={6}
                  style={{
                    width: '100%', padding: '10px 12px',
                    border: `1px solid ${TC}`, fontSize: '13px',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                    outline: 'none', color: INK, resize: 'vertical',
                    lineHeight: '1.6',
                  }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    onClick={handleSaveDraft}
                    disabled={saving}
                    style={{
                      padding: '7px 16px', backgroundColor: TC, color: '#FFF',
                      border: 'none', fontSize: '12px', fontWeight: 700,
                      letterSpacing: '0.04em', cursor: saving ? 'default' : 'pointer',
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditingDraft(false); setDraftText(msg.draft_reply || ''); }}
                    style={{
                      padding: '7px 16px', backgroundColor: 'transparent',
                      border: `1px solid ${RULE}`, fontSize: '12px', fontWeight: 700,
                      letterSpacing: '0.04em', cursor: 'pointer', color: MUTED,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setEditingDraft(true)}
                style={{
                  padding: '12px 14px', border: `1px solid ${RULE}`, backgroundColor: '#FFF',
                  fontSize: '13px', color: draftText ? INK : MUTED, lineHeight: '1.6',
                  whiteSpace: 'pre-wrap', cursor: 'text', minHeight: '60px',
                }}
              >
                {draftText || <em>Click to write a reply…</em>}
              </div>
            )}
          </div>

          {/* Action buttons */}
          {!isDismissed && !isSent && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => onSend(msg.id, draftText)}
                disabled={!draftText.trim()}
                style={{
                  padding: '8px 18px', backgroundColor: draftText.trim() ? TC : '#CCC',
                  color: '#FFF', border: 'none', fontSize: '12px', fontWeight: 700,
                  letterSpacing: '0.04em', cursor: draftText.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>send</span>
                Send Reply
              </button>
              <button
                onClick={() => setEditingDraft(true)}
                style={{
                  padding: '8px 16px', backgroundColor: 'transparent',
                  border: `1px solid ${RULE}`, fontSize: '12px', fontWeight: 700,
                  letterSpacing: '0.04em', cursor: 'pointer', color: INK,
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span>
                Edit
              </button>
              <button
                onClick={() => onDismiss(msg.id)}
                style={{
                  padding: '8px 16px', backgroundColor: 'transparent',
                  border: `1px solid ${RULE}`, fontSize: '12px', fontWeight: 700,
                  letterSpacing: '0.04em', cursor: 'pointer', color: MUTED,
                  display: 'flex', alignItems: 'center', gap: '6px',
                  marginLeft: 'auto',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                Dismiss
              </button>
            </div>
          )}
          {isSent && msg.sent_at && (
            <div style={{ fontSize: '12px', color: GREEN, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span>
              Reply sent {timeAgo(msg.sent_at)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminInbox() {
  const [connected,    setConnected]    = useState(null); // null = loading
  const [messages,     setMessages]     = useState([]);
  const [stats,        setStats]        = useState(null);
  const [activeTab,    setActiveTab]    = useState('all');
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [expandedId,   setExpandedId]   = useState(null);
  const [statusMsg,    setStatusMsg]    = useState(null); // { type: 'success'|'error', text }
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptInstructions, setPromptInstructions] = useState('');
  const [promptSaving, setPromptSaving] = useState(false);

  const showStatus = (type, text) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  // ── Load gmail connection status ─────────────────────────────────────────────
  useEffect(() => {
    api.get('/admin/settings/gmail')
      .then(res => setConnected(res.data.connected))
      .catch(() => setConnected(false));
  }, []);

  // ── Load messages + stats when connected ────────────────────────────────────
  useEffect(() => {
    if (!connected) return;
    loadMessages();
    loadStats();
  }, [connected, activeTab]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const params = {};
      if (activeTab !== 'all') params.category = activeTab;
      const { data } = await api.get('/admin/inbox', { params });
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load inbox:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data } = await api.get('/admin/inbox/stats');
      setStats(data);
    } catch (err) {
      console.error('Failed to load inbox stats:', err);
    }
  };

  // ── Refresh ──────────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data } = await api.post('/admin/inbox/refresh');
      showStatus('success', data.message || `Processed ${data.processed} message(s)`);
      await loadMessages();
      await loadStats();
    } catch (err) {
      showStatus('error', err.response?.data?.error || 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  // ── Connect Gmail ────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    try {
      const { data } = await api.get('/admin/settings/gmail/connect');
      if (data.url) window.location.href = data.url;
    } catch (err) {
      showStatus('error', 'Failed to get OAuth URL');
    }
  };

  // ── Save draft ───────────────────────────────────────────────────────────────
  const handleSaveDraft = async (id, draftReply) => {
    await api.put(`/admin/inbox/${id}`, { draft_reply: draftReply });
    setMessages(prev => prev.map(m => m.id === id ? { ...m, draft_reply: draftReply } : m));
  };

  // ── Send reply ───────────────────────────────────────────────────────────────
  const handleSend = async (id, draftText) => {
    // Save latest draft text first, then confirm
    if (!window.confirm('Send this human-approved reply now? AI drafts are never auto-sent.')) return;
    try {
      // Save draft before sending in case it was edited inline
      await api.put(`/admin/inbox/${id}`, { draft_reply: draftText });
      await api.post(`/admin/inbox/${id}/send`);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'sent', sent_at: new Date().toISOString(), draft_reply: draftText } : m));
      showStatus('success', 'Reply sent');
    } catch (err) {
      showStatus('error', err.response?.data?.error || 'Failed to send reply');
    }
  };

  // ── Dismiss ──────────────────────────────────────────────────────────────────
  const handleDismiss = async (id) => {
    try {
      await api.post(`/admin/inbox/${id}/dismiss`);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'dismissed' } : m));
      showStatus('success', 'Message dismissed');
    } catch (err) {
      showStatus('error', err.response?.data?.error || 'Failed to dismiss');
    }
  };

  // ── Tab count helper ─────────────────────────────────────────────────────────
  const tabCount = (key) => {
    if (!stats) return null;
    if (key === 'all') return stats.total || null;
    return stats.categories?.[key] ?? null;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  const headerActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      {/* Status message */}
      {statusMsg && (
        <span style={{ fontSize: '11px', fontWeight: 600, color: statusMsg.type === 'error' ? '#C0392B' : GREEN }}>
          {statusMsg.text}
        </span>
      )}

      {connected && (
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: '8px 16px', border: `1px solid ${RULE}`,
            backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            cursor: refreshing ? 'default' : 'pointer', color: refreshing ? MUTED : INK,
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>refresh</span>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      )}
    </div>
  );

  return (
    <AdminPage title="Inbox" actions={headerActions}>
        {/* ── Gmail not connected ── */}
        {connected === false && (
          <div style={{
            padding: '48px 32px', textAlign: 'center',
            border: `1px solid ${RULE}`, backgroundColor: '#FFF',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '40px', color: MUTED, display: 'block', marginBottom: '12px' }}>
              mail
            </span>
            <div style={{ fontSize: '16px', fontWeight: 700, color: INK, marginBottom: '6px' }}>Gmail not connected</div>
            <div style={{ fontSize: '13px', color: MUTED, marginBottom: '24px' }}>
              Connect your Gmail account to start receiving and replying to student emails from here.
            </div>
            <button
              onClick={handleConnect}
              style={{
                padding: '11px 28px', backgroundColor: TC, color: '#FFF',
                border: 'none', fontSize: '13px', fontWeight: 700,
                letterSpacing: '0.04em', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '8px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>link</span>
              Connect Gmail
            </button>
          </div>
        )}

        {/* ── Loading state for connection check ── */}
        {connected === null && (
          <div style={{ padding: '48px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Checking Gmail connection…</div>
        )}

        {/* ── Main inbox UI ── */}
        {connected === true && (
          <>
            {/* ── AI Instructions ── */}
            <div style={{ marginBottom: '16px' }}>
              <button
                onClick={() => {
                  if (!showPromptEditor) {
                    api.get('/admin/inbox/prompt').then(r => setPromptInstructions(r.data.instructions || ''));
                  }
                  setShowPromptEditor(!showPromptEditor);
                }}
                style={{ padding: '6px 14px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 600, color: MUTED, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>tune</span>
                {showPromptEditor ? 'Hide AI Instructions' : 'AI Instructions'}
              </button>
              {showPromptEditor && (
                <div style={{ marginTop: '10px', padding: '14px', border: `1px solid ${RULE}`, backgroundColor: '#FFF' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, marginBottom: '6px' }}>
                    Custom instructions for the AI when drafting replies
                  </div>
                  <div style={{ fontSize: '11px', color: MUTED, marginBottom: '10px' }}>
                    E.g. "Always mention rescheduling is free if 24h notice given" or "Sign off as Eve, not the studio"
                  </div>
                  <textarea
                    value={promptInstructions}
                    onChange={e => setPromptInstructions(e.target.value)}
                    rows={5}
                    placeholder="Add custom instructions for the AI here..."
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button
                      onClick={async () => {
                        setPromptSaving(true);
                        try {
                          await api.put('/admin/inbox/prompt', { instructions: promptInstructions });
                          showStatus('success', 'AI instructions saved');
                        } catch { showStatus('error', 'Failed to save'); }
                        setPromptSaving(false);
                      }}
                      disabled={promptSaving}
                      style={{ padding: '6px 16px', backgroundColor: INK, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {promptSaving ? 'Saving...' : 'Save Instructions'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Category tabs ── */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '0',
              borderBottom: `2px solid ${RULE}`, marginBottom: '24px',
            }}>
              {TABS.map(tab => {
                const isActive = activeTab === tab.key;
                const count    = tabCount(tab.key);
                return (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setExpandedId(null); }}
                    style={{
                      padding: '10px 14px', border: 'none', background: 'none',
                      fontSize: '12px', fontWeight: isActive ? 700 : 500,
                      color: isActive ? TC : MUTED, cursor: 'pointer',
                      borderBottom: isActive ? `2px solid ${TC}` : '2px solid transparent',
                      marginBottom: '-2px', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: '5px',
                    }}
                  >
                    {tab.label}
                    {count != null && count > 0 && (
                      <span style={{
                        fontSize: '10px', fontWeight: 700,
                        backgroundColor: isActive ? TC : MUTED + '33',
                        color: isActive ? '#FFF' : MUTED,
                        padding: '1px 5px', borderRadius: '8px',
                        minWidth: '16px', textAlign: 'center',
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Message list ── */}
            {loading ? (
              <div style={{ padding: '48px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading messages…</div>
            ) : messages.length === 0 ? (
              <div style={{
                padding: '48px 32px', textAlign: 'center',
                border: `1px solid ${RULE}`, backgroundColor: '#FFF',
                color: MUTED, fontSize: '13px',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '32px', display: 'block', marginBottom: '10px', color: MUTED }}>
                  inbox
                </span>
                No messages in this category.
              </div>
            ) : (
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF' }}>
                {messages.map(msg => (
                  <MessageRow
                    key={msg.id}
                    msg={msg}
                    isExpanded={expandedId === msg.id}
                    onToggle={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
                    onSend={handleSend}
                    onDismiss={handleDismiss}
                    onSaveDraft={handleSaveDraft}
                  />
                ))}
              </div>
            )}
          </>
        )}
    </AdminPage>
  );
}
