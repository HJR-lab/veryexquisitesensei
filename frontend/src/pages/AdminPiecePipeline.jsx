import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import AdminPage from '../components/AdminPage';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';
const SUCCESS  = '#059669';
const WARN     = '#E65100';

// No 'unmatched' column: piece_batches.customer_id is NOT NULL and the log
// route requires a customerId, so that bucket could never fill.
const STATUS_ORDER = ['ready', 'in_cabinet', 'collecting', 'delivering', 'glaze_fired', 'bisque_fired', 'logged'];
const STATUS_LABELS = {
  logged: 'Logged / Drying',
  bisque_fired: 'Bisque Fired',
  glaze_fired: 'Glaze Fired',
  ready: 'Ready for Collection',
  collecting: 'Collection Scheduled',
  delivering: 'To Deliver',
  in_cabinet: 'In Cabinet',
};
const STATUS_COLORS = {
  logged: MUTED,
  bisque_fired: WARN,
  glaze_fired: WARN,
  ready: SUCCESS,
  collecting: SUCCESS,
  delivering: TC,
  in_cabinet: TC,
};
const NEXT_STATUS = {
  logged: 'bisque_fired',
  bisque_fired: 'glaze_fired',
  glaze_fired: 'ready',
};

// Shared button styles
const btnSt = {
  padding: '6px 12px',
  fontSize: '11px',
  fontWeight: 700,
  fontFamily: 'inherit',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  border: `1px solid ${RULE}`,
  backgroundColor: '#FFFFFF',
  color: INK,
  cursor: 'pointer',
};
const btnAccentSt = { ...btnSt, backgroundColor: TC, color: '#FFFFFF', border: `1px solid ${TC}` };
const btnSuccessSt = { ...btnSt, backgroundColor: SUCCESS, color: '#FFFFFF', border: `1px solid ${SUCCESS}` };
const btnWarnSt = { ...btnSt, backgroundColor: WARN, color: '#FFFFFF', border: `1px solid ${WARN}` };

export default function AdminPiecePipeline({ embedded = false }) {
  const [pipeline, setPipeline] = useState({ batches: {}, stats: {} });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selectedBatches, setSelectedBatches] = useState(new Set());
  const [firingRuns, setFiringRuns] = useState([]);
  const [showFiringRunForm, setShowFiringRunForm] = useState(false);
  const [firingRunType, setFiringRunType] = useState('bisque');
  const [firingRunNotes, setFiringRunNotes] = useState('');
  const [showRunHistory, setShowRunHistory] = useState(false);
  const [viewingBatch, setViewingBatch] = useState(null);
  const [showLogForm, setShowLogForm] = useState(false);

  // Close photo modal on Escape
  useEffect(() => {
    if (!viewingBatch) return;
    const onKey = (e) => { if (e.key === 'Escape') setViewingBatch(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewingBatch]);

  const fetchPipeline = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/pieces/pipeline');
      setPipeline(data);
    } catch (err) {
      console.error('Failed to fetch pipeline:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  const fetchFiringRuns = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/pieces/firing-runs');
      setFiringRuns(data.runs || []);
    } catch (err) {
      console.error('Failed to fetch firing runs:', err);
    }
  }, []);

  useEffect(() => { fetchFiringRuns(); }, [fetchFiringRuns]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const { data } = await api.get(`/admin/pieces/search?initials=${encodeURIComponent(searchQuery.trim())}`);
      setSearchResults(data.batches);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const handleStatusUpdate = async (batchId, newStatus) => {
    try {
      await api.put(`/admin/pieces/batches/${batchId}/status`, { status: newStatus });
      fetchPipeline();
      if (searchResults) handleSearch();
    } catch (err) {
      console.error('Status update failed:', err);
    }
  };

  const handleComplete = async (batchId, type) => {
    try {
      await api.put(`/admin/pieces/batches/${batchId}/complete`, { completionType: type });
      fetchPipeline();
    } catch (err) {
      console.error('Complete failed:', err);
    }
  };

  const handleBulkStatus = async (status) => {
    if (selectedBatches.size === 0) return;
    try {
      await api.post('/admin/pieces/bulk-status', { batchIds: Array.from(selectedBatches), status });
      setSelectedBatches(new Set());
      fetchPipeline();
    } catch (err) {
      console.error('Bulk update failed:', err);
    }
  };

  const handleCreateFiringRun = async () => {
    if (selectedBatches.size === 0) return;
    try {
      await api.post('/admin/pieces/firing-runs', {
        firingType: firingRunType,
        notes: firingRunNotes || null,
        batchIds: Array.from(selectedBatches),
      });
      setSelectedBatches(new Set());
      setShowFiringRunForm(false);
      setFiringRunNotes('');
      fetchPipeline();
      fetchFiringRuns();
    } catch (err) {
      console.error('Failed to create firing run:', err);
    }
  };

  const handleCompleteFiringRun = async (runId) => {
    try {
      await api.put(`/admin/pieces/firing-runs/${runId}/complete`);
      fetchPipeline();
      fetchFiringRuns();
    } catch (err) {
      console.error('Failed to complete firing run:', err);
    }
  };

  const handlePlaceInCabinet = async (batchId) => {
    try {
      await api.put(`/admin/pieces/batches/${batchId}/cabinet`);
      fetchPipeline();
    } catch (err) {
      console.error('Failed to place in cabinet:', err);
    }
  };

  const handleMarkCollected = async (batchId) => {
    try {
      await api.put(`/admin/pieces/batches/${batchId}/mark-collected`);
      fetchPipeline();
    } catch (err) {
      console.error('Failed to mark collected:', err);
    }
  };

  const handleShip = async (batchId, carrier, trackingNumber) => {
    try {
      const { data } = await api.put(`/admin/pieces/batches/${batchId}/ship`, { carrier, trackingNumber });
      if (data?.feeOutstanding > 0) {
        alert(`Shipped. $${Number(data.feeCharged).toFixed(2)} came off their credit — $${Number(data.feeOutstanding).toFixed(2)} still outstanding.`);
      }
      fetchPipeline();
    } catch (err) {
      console.error('Failed to mark shipped:', err);
      alert(err?.response?.data?.error || 'Failed to mark shipped');
    }
  };

  const handleAssignCustomer = async (batchId, customerId) => {
    try {
      await api.put(`/admin/pieces/batches/${batchId}/assign`, { customerId });
      fetchPipeline();
    } catch (err) {
      console.error('Failed to assign customer:', err);
    }
  };

  const handleFlagDiscrepancy = async (batchId, actualCount, reason) => {
    try {
      await api.put(`/admin/pieces/batches/${batchId}/discrepancy`, { actualCount, reason });
      fetchPipeline();
    } catch (err) {
      console.error('Failed to flag discrepancy:', err);
    }
  };

  const toggleSelect = (batchId) => {
    setSelectedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const daysSince = (dateStr) => {
    if (!dateStr) return null;
    return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <AdminPage embedded={embedded} title="Fire">
        <div style={{ fontSize: '13px', color: MUTED }}>Loading pipeline…</div>
      </AdminPage>
    );
  }

  const stats = pipeline.stats || {};

  return (
    <>
    <AdminPage
      embedded={embedded}
      title="Fire"
      actions={<button onClick={() => setShowLogForm(true)} style={btnAccentSt}>+ Log Batch</button>}
    >
        {/* Stats Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}`, marginBottom: '24px' }}>
          {['glaze_fired', 'ready', 'collecting', 'delivering', 'in_cabinet'].map(key => (
            <div key={key} style={{ padding: '20px 16px', backgroundColor: '#FFFFFF', textAlign: 'left' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1, color: STATUS_COLORS[key], marginBottom: '8px' }}>
                {stats[key]?.count || 0}
              </div>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '2px' }}>
                {STATUS_LABELS[key]}
              </div>
              <div style={{ fontSize: '10px', color: MUTED }}>
                {stats[key]?.pieces || 0} pieces
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, padding: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search by initials (e.g. JL)"
              style={{ flex: 1, padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '14px', fontFamily: 'inherit', letterSpacing: '1px', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
            />
            <button onClick={handleSearch} style={{ ...btnSt, backgroundColor: INK, color: '#FFFFFF', border: `1px solid ${INK}`, padding: '10px 20px' }}>
              Search
            </button>
          </div>

          {searchResults && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '8px' }}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </div>
              {searchResults.map(batch => (
                <BatchCard key={batch.id} batch={batch} daysSince={daysSince} onStatusUpdate={handleStatusUpdate} onComplete={handleComplete} onPlaceInCabinet={handlePlaceInCabinet} onMarkCollected={handleMarkCollected} onShip={handleShip} onOpenPhoto={setViewingBatch} onAssignCustomer={handleAssignCustomer} onFlagDiscrepancy={handleFlagDiscrepancy} />
              ))}
            </div>
          )}
        </div>

        {/* Bulk Actions */}
        {selectedBatches.size > 0 && (
          <div style={{ backgroundColor: INK, color: '#FFFFFF', padding: '12px 16px', marginBottom: '16px', position: 'sticky', top: '40px', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {selectedBatches.size} selected
              </span>
              <button onClick={() => handleBulkStatus('bisque_fired')} style={btnWarnSt}>→ Bisque Fired</button>
              <button onClick={() => handleBulkStatus('glaze_fired')} style={btnWarnSt}>→ Glaze Fired</button>
              <button onClick={() => handleBulkStatus('ready')} style={btnSuccessSt}>→ Ready</button>
              <button onClick={() => setShowFiringRunForm(!showFiringRunForm)} style={btnAccentSt}>Create Firing Run</button>
              <button
                onClick={() => setSelectedBatches(new Set())}
                style={{ ...btnSt, marginLeft: 'auto', backgroundColor: 'transparent', color: '#CCC', border: `1px solid rgba(255,255,255,0.2)` }}
              >
                Clear
              </button>
            </div>

            {showFiringRunForm && (
              <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.1)` }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#AAA', display: 'block', marginBottom: '5px' }}>Type</label>
                    <select
                      value={firingRunType}
                      onChange={e => setFiringRunType(e.target.value)}
                      style={{ padding: '7px 10px', border: `1px solid rgba(255,255,255,0.2)`, backgroundColor: 'rgba(255,255,255,0.05)', color: '#FFFFFF', fontSize: '12px', fontFamily: 'inherit' }}
                    >
                      <option value="bisque" style={{ color: INK }}>Bisque</option>
                      <option value="glaze" style={{ color: INK }}>Glaze</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <label style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#AAA', display: 'block', marginBottom: '5px' }}>Notes (optional)</label>
                    <input
                      value={firingRunNotes}
                      onChange={e => setFiringRunNotes(e.target.value)}
                      placeholder="e.g. Large kiln, cone 6"
                      style={{ width: '100%', padding: '7px 10px', border: `1px solid rgba(255,255,255,0.2)`, backgroundColor: 'rgba(255,255,255,0.05)', color: '#FFFFFF', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                    />
                  </div>
                  <button onClick={handleCreateFiringRun} style={{ ...btnWarnSt, padding: '8px 16px' }}>
                    Fire {selectedBatches.size} batch{selectedBatches.size !== 1 ? 'es' : ''}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pipeline Sections */}
        {STATUS_ORDER.map(statusKey => {
          const batchesForStatus = pipeline.batches?.[statusKey] || [];
          if (batchesForStatus.length === 0) return null;

          return (
            <div key={statusKey} style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ width: '8px', height: '8px', backgroundColor: STATUS_COLORS[statusKey] }} />
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: INK }}>
                  {STATUS_LABELS[statusKey]}
                </span>
                <span style={{ fontSize: '10px', color: MUTED }}>
                  — {batchesForStatus.length} batch{batchesForStatus.length !== 1 ? 'es' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}` }}>
                {batchesForStatus.map(batch => (
                  <BatchCard
                    key={batch.id}
                    batch={batch}
                    daysSince={daysSince}
                    onStatusUpdate={handleStatusUpdate}
                    onComplete={handleComplete}
                    onPlaceInCabinet={handlePlaceInCabinet}
                    onMarkCollected={handleMarkCollected}
                    onShip={handleShip}
                    onOpenPhoto={setViewingBatch}
                    onAssignCustomer={handleAssignCustomer}
                    onFlagDiscrepancy={handleFlagDiscrepancy}
                    selected={selectedBatches.has(batch.id)}
                    onToggleSelect={() => toggleSelect(batch.id)}
                    showCheckbox
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Firing Run History */}
        <div style={{ marginTop: '32px' }}>
          <button
            onClick={() => setShowRunHistory(!showRunHistory)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: MUTED, padding: 0, fontFamily: 'inherit' }}
          >
            {showRunHistory ? '▼' : '▶'} Firing Run History ({firingRuns.length})
          </button>

          {showRunHistory && (
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}` }}>
              {firingRuns.length === 0 && (
                <div style={{ backgroundColor: '#FFFFFF', padding: '16px', color: MUTED, fontSize: '13px' }}>No firing runs yet.</div>
              )}
              {firingRuns.map(run => (
                <div key={run.id} style={{ backgroundColor: '#FFFFFF', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>
                      {run.firing_type === 'bisque' ? 'Bisque' : 'Glaze'} Run
                    </span>
                    <span style={{ fontSize: '11px', color: MUTED }}>
                      {new Date(run.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                    </span>
                    {run.notes && <span style={{ fontSize: '11px', color: MUTED }}>— {run.notes}</span>}
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      padding: '3px 7px',
                      backgroundColor: run.status === 'completed' ? 'rgba(5,150,105,0.08)' : 'rgba(230,81,0,0.08)',
                      color: run.status === 'completed' ? SUCCESS : WARN,
                    }}>
                      {run.status}
                    </span>
                  </div>
                  {run.status !== 'completed' && (
                    <button onClick={() => handleCompleteFiringRun(run.id)} style={btnSuccessSt}>
                      Complete Run
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    </AdminPage>

      {/* Photo lightbox */}
      {viewingBatch && (
        <div
          onClick={() => setViewingBatch(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
            cursor: 'zoom-out',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}
          >
            <button
              onClick={() => setViewingBatch(null)}
              style={{ position: 'absolute', top: '-36px', right: 0, background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '24px', cursor: 'pointer', fontFamily: 'inherit', padding: 0, lineHeight: 1 }}
              aria-label="Close"
            >
              ✕
            </button>
            {viewingBatch.photo_urls && viewingBatch.photo_urls.length > 0 ? (
              <img
                src={viewingBatch.photo_urls[0]}
                alt="Batch"
                style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', backgroundColor: '#FFFFFF', border: `1px solid ${RULE}` }}
              />
            ) : (
              <div style={{ padding: '40px', backgroundColor: '#FFFFFF', color: MUTED }}>No photo</div>
            )}
            <div style={{ marginTop: '12px', color: '#FFFFFF', fontSize: '13px', textAlign: 'center' }}>
              <div style={{ fontWeight: 700 }}>
                {viewingBatch.customers?.first_name} {viewingBatch.customers?.last_name}
                {' · '}<strong>{viewingBatch.initials}</strong>
                {' · '}{viewingBatch.piece_count} pcs
              </div>
              <div style={{ color: '#AAA', fontSize: '11px', marginTop: '2px' }}>
                {viewingBatch.course_enrollments?.course_title || viewingBatch.course_enrollments?.course_variant_title || 'Course'}
                {' · '}{STATUS_LABELS[viewingBatch.status] || viewingBatch.status}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Batch modal (admin-on-behalf-of-student) */}
      {showLogForm && (
        <LogBatchModal
          onClose={() => setShowLogForm(false)}
          onSaved={() => { setShowLogForm(false); fetchPipeline(); }}
        />
      )}
    </>
  );
}

function LogBatchModal({ onClose, onSaved }) {
  const emptyRow = () => ({ initials: '', pieceCount: '', match: null, status: '', notes: '' });
  const [batchDate, setBatchDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [rows, setRows] = useState(() => Array.from({ length: 10 }, emptyRow));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null); // { saved, unmatched }
  const [knownInitials, setKnownInitials] = useState([]); // [{ initials, student, pieceCount }]
  const [activeDropdown, setActiveDropdown] = useState(null); // row index

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Load all known initials on mount
  useEffect(() => {
    api.get('/admin/pieces/initials')
      .then(({ data }) => setKnownInitials(data.initials || []))
      .catch(() => {});
  }, []);

  const updateRow = (idx, field, value) => {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: field === 'initials' ? value.toUpperCase() : value };
      // Auto-match initials to student
      if (field === 'initials' && value.trim().length >= 2) {
        api.get(`/admin/pieces/search?initials=${encodeURIComponent(value.trim().toUpperCase())}`)
          .then(({ data }) => {
            const matches = data.matches || [];
            setRows(prev2 => {
              const n = [...prev2];
              if (matches.length > 0) {
                n[idx] = { ...n[idx], match: matches[0], status: 'matched' };
              } else {
                n[idx] = { ...n[idx], match: null, status: value.trim() ? 'unmatched' : '' };
              }
              return n;
            });
          })
          .catch(() => {});
      } else if (field === 'initials' && !value.trim()) {
        next[idx].match = null;
        next[idx].status = '';
      }
      return next;
    });
  };

  const addRows = () => setRows(prev => [...prev, ...Array.from({ length: 5 }, emptyRow)]);

  const submit = async () => {
    const filledRows = rows.filter(r => r.initials.trim() && r.pieceCount && parseInt(r.pieceCount) > 0);
    if (filledRows.length === 0) { setError('Enter at least one row'); return; }

    setError(null);
    setSaving(true);
    const saved = [];
    const unmatched = [];

    for (const row of filledRows) {
      if (!row.match) {
        unmatched.push(row);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append('customerId', String(row.match.id));
        fd.append('pieceCount', String(parseInt(row.pieceCount)));
        fd.append('initials', row.initials.trim());
        await api.post('/admin/pieces/log', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        saved.push(row);
      } catch (err) {
        unmatched.push({ ...row, error: err.response?.data?.error || 'Failed' });
      }
    }

    setSaving(false);
    setResults({ saved, unmatched });
    if (unmatched.length === 0) {
      setTimeout(() => onSaved(), 1000);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto', padding: '24px', fontFamily: 'Atak, sans-serif', color: INK }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '4px' }}>Admin</div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Log Batch</h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: MUTED, padding: 0 }}>✕</button>
        </div>

        {results ? (
          /* ── Results view ── */
          <div>
            {results.saved.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#2E7D32', marginBottom: '6px' }}>Saved ({results.saved.length})</div>
                {results.saved.map((r, i) => (
                  <div key={i} style={{ fontSize: '12px', padding: '4px 0', color: INK }}>
                    {r.initials} — {r.pieceCount} pcs → {r.match?.first_name} {r.match?.last_name}
                  </div>
                ))}
              </div>
            )}
            {results.unmatched.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: WARN, marginBottom: '6px' }}>Unmatched ({results.unmatched.length})</div>
                {results.unmatched.map((r, i) => (
                  <div key={i} style={{ fontSize: '12px', padding: '4px 0', color: WARN }}>
                    {r.initials} — {r.pieceCount} pcs {r.error ? `(${r.error})` : '— no student found'}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={onSaved} style={btnAccentSt}>Done</button>
            </div>
          </div>
        ) : (
          /* ── Entry form ── */
          <>
            {/* Batch date */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '6px' }}>Batch Date</label>
              <input
                type="date"
                value={batchDate}
                onChange={e => setBatchDate(e.target.value)}
                style={{ padding: '8px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', outline: 'none', width: '180px' }}
              />
            </div>

            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '30px 80px 70px 1fr', gap: '8px', padding: '6px 0', marginBottom: '4px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: MUTED, letterSpacing: '0.06em' }}>#</span>
              <span style={{ fontSize: '9px', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Initials</span>
              <span style={{ fontSize: '9px', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Pieces</span>
              <span style={{ fontSize: '9px', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Student Match</span>
            </div>

            {rows.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '30px 80px 70px 1fr', gap: '8px', alignItems: 'center', padding: '3px 0' }}>
                <span style={{ fontSize: '10px', color: MUTED, fontWeight: 600 }}>{i + 1}</span>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={row.initials}
                    onChange={e => { updateRow(i, 'initials', e.target.value); setActiveDropdown(i); }}
                    onFocus={() => setActiveDropdown(i)}
                    onBlur={() => setTimeout(() => setActiveDropdown(null), 150)}
                    placeholder="JL"
                    maxLength={5}
                    style={{ padding: '7px 8px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '2px', outline: 'none', boxSizing: 'border-box', width: '100%' }}
                  />
                  {activeDropdown === i && knownInitials.length > 0 && (() => {
                    const filtered = knownInitials.filter(k =>
                      !row.initials || k.initials.startsWith(row.initials.toUpperCase())
                    );
                    if (filtered.length === 0) return null;
                    return (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#FFF', border: `1px solid ${RULE}`, borderTop: 'none', maxHeight: '150px', overflowY: 'auto', zIndex: 10 }}>
                        {filtered.map(k => (
                          <button
                            key={k.initials}
                            onMouseDown={e => {
                              e.preventDefault();
                              setRows(prev => {
                                const n = [...prev];
                                n[i] = { ...n[i], initials: k.initials, match: k.student, status: 'matched', notes: k.notes || '' };
                                return n;
                              });
                              setActiveDropdown(null);
                            }}
                            style={{ display: 'block', width: '100%', padding: '6px 8px', textAlign: 'left', background: 'none', border: 'none', borderBottom: `1px solid ${RULE}`, cursor: 'pointer', fontFamily: 'inherit' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = ALT}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '2px', fontSize: '13px' }}>{k.initials}</span>
                            <span style={{ fontSize: '11px', color: MUTED, marginLeft: '8px' }}>
                              {k.student ? `${k.student.first_name} ${k.student.last_name}` : '—'}
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <input
                  type="number"
                  min="1"
                  value={row.pieceCount}
                  onChange={e => updateRow(i, 'pieceCount', e.target.value)}
                  placeholder="0"
                  style={{ padding: '7px 8px', border: `1px solid ${RULE}`, fontSize: '13px', outline: 'none', boxSizing: 'border-box', width: '100%' }}
                />
                <div>
                  <span style={{
                    fontSize: '11px', fontWeight: 600,
                    color: row.status === 'matched' ? '#2E7D32' : row.status === 'unmatched' ? WARN : MUTED,
                  }}>
                    {row.status === 'matched' && row.match ? `${row.match.first_name} ${row.match.last_name}` : row.status === 'unmatched' ? 'No match' : '—'}
                  </span>
                  {row.status === 'matched' && row.notes && (
                    <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px' }}>{row.notes}</div>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={addRows}
              style={{ marginTop: '8px', background: 'none', border: `1px dashed ${RULE}`, padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: MUTED, cursor: 'pointer', width: '100%' }}
            >
              + Add 5 more rows
            </button>

            {error && <div style={{ fontSize: '12px', color: WARN, marginTop: '12px' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={onClose} style={btnSt} disabled={saving}>Cancel</button>
              <button onClick={submit} style={btnAccentSt} disabled={saving}>
                {saving ? 'Saving…' : `Log ${rows.filter(r => r.initials.trim() && r.pieceCount).length} Batches`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// The studio ships the parcel itself, so this records what the courier gave back
// rather than booking anything. Tracking is required: the whole point of the
// deliver path is that the student gets a number to follow, and shipping without
// one just recreates the silence this replaced.
function ShipControl({ batch, onShip }) {
  const [open, setOpen] = useState(false);
  const [carrier, setCarrier] = useState(batch.tracking_carrier || '');
  const [tracking, setTracking] = useState(batch.tracking_number || '');

  const inputSt = {
    padding: '5px 8px',
    fontSize: '11px',
    fontFamily: 'inherit',
    border: `1px solid ${RULE}`,
    backgroundColor: '#FFFFFF',
    color: INK,
    width: '110px',
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={btnAccentSt}>
        Ship &amp; Track
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        list={`carriers-${batch.id}`}
        value={carrier}
        onChange={e => setCarrier(e.target.value)}
        placeholder="Carrier"
        style={inputSt}
      />
      <datalist id={`carriers-${batch.id}`}>
        <option value="SingPost" />
        <option value="NinjaVan" />
        <option value="J&T" />
        <option value="Qxpress" />
        <option value="Lalamove" />
        <option value="Grab" />
      </datalist>
      <input
        value={tracking}
        onChange={e => setTracking(e.target.value)}
        placeholder="Tracking no."
        style={{ ...inputSt, width: '140px' }}
      />
      <button
        onClick={() => onShip(batch.id, carrier.trim(), tracking.trim())}
        disabled={!tracking.trim()}
        style={{ ...btnAccentSt, opacity: tracking.trim() ? 1 : 0.45, cursor: tracking.trim() ? 'pointer' : 'not-allowed' }}
      >
        Send
      </button>
      <button onClick={() => setOpen(false)} style={btnSt}>Cancel</button>
    </div>
  );
}

function BatchCard({ batch, daysSince, onStatusUpdate, onComplete, onPlaceInCabinet, onMarkCollected, onShip, onOpenPhoto, onAssignCustomer, onFlagDiscrepancy, selected, onToggleSelect, showCheckbox }) {
  const [showAssign, setShowAssign] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignResults, setAssignResults] = useState([]);
  const [initialsMatches, setInitialsMatches] = useState([]);
  const [loadedInitials, setLoadedInitials] = useState(false);
  const [showDiscrepancy, setShowDiscrepancy] = useState(false);
  const [discActual, setDiscActual] = useState('');
  const [discReason, setDiscReason] = useState('');

  const student = batch.customers || {};
  const enrollment = batch.course_enrollments || {};
  const courseName = enrollment.course_title || enrollment.course_variant_title || 'Course';
  const photoUrl = batch.photo_urls && batch.photo_urls.length > 0 ? batch.photo_urls[0] : null;
  const nextStatus = NEXT_STATUS[batch.status];
  const isReady = ['ready', 'collecting', 'delivering'].includes(batch.status);
  const daysReady = isReady ? daysSince(batch.ready_at) : null;
  const noResponse = isReady && !batch.delivery_method && daysReady >= 7;
  const isUnmatched = !batch.customer_id;
  const hasDiscrepancyNote = (batch.notes || '').includes('[Discrepancy:');

  const [searchedVariants, setSearchedVariants] = useState([]);

  // Auto-search by initials when assign panel opens (includes fuzzy 0/O, 1/I etc.)
  const openAssignPanel = async () => {
    setShowAssign(true);
    if (!loadedInitials && batch.initials) {
      try {
        const { data } = await api.get(`/admin/pieces/search?initials=${encodeURIComponent(batch.initials)}`);
        setInitialsMatches(data.matches || []);
        setSearchedVariants(data.variants || []);
        setLoadedInitials(true);
      } catch (err) {
        console.error('Initials search failed:', err);
      }
    }
  };

  const searchStudents = async (q) => {
    setAssignSearch(q);
    if (q.length < 2) { setAssignResults([]); return; }
    try {
      const { data } = await api.get(`/admin/students/search?q=${encodeURIComponent(q)}`);
      setAssignResults(data.students || []);
    } catch (err) {
      console.error('Student search failed:', err);
    }
  };

  const doAssign = (customerId) => {
    onAssignCustomer(batch.id, customerId);
    setShowAssign(false);
    setAssignSearch('');
    setAssignResults([]);
  };

  const doFlagDiscrepancy = () => {
    if (!discActual || !discReason.trim()) return;
    onFlagDiscrepancy(batch.id, parseInt(discActual), discReason.trim());
    setShowDiscrepancy(false);
    setDiscActual('');
    setDiscReason('');
  };

  return (
    <div style={{
      backgroundColor: selected ? TC_LIGHT : isUnmatched ? '#FFF5F5' : '#FFFFFF',
      padding: '14px 16px',
      borderLeft: selected ? `3px solid ${TC}` : isUnmatched ? '3px solid #C03030' : '3px solid transparent',
    }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        {showCheckbox && (
          <input type="checkbox" checked={selected} onChange={onToggleSelect} style={{ cursor: 'pointer', flexShrink: 0 }} />
        )}

        {photoUrl && (
          <img
            src={photoUrl}
            alt="Batch"
            onClick={() => onOpenPhoto && onOpenPhoto(batch)}
            style={{ width: '72px', height: '72px', objectFit: 'cover', flexShrink: 0, border: `1px solid ${RULE}`, cursor: onOpenPhoto ? 'zoom-in' : 'default' }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '2px' }}>
            {isUnmatched
              ? <span style={{ color: '#C03030' }}>Unmatched — {batch.initials}</span>
              : `${student.first_name} ${student.last_name}`
            }
          </div>
          <div style={{ fontSize: '11px', color: MUTED }}>
            {courseName} · {batch.piece_count} pcs · <strong style={{ color: INK }}>{batch.initials}</strong>
            {daysReady !== null && ` · Ready ${daysReady}d ago`}
            {batch.delivery_method === 'collect' && <span style={{ color: SUCCESS, fontWeight: 700 }}> · Collecting</span>}
            {batch.delivery_method === 'deliver' && <span style={{ color: TC, fontWeight: 700 }}> · Delivery</span>}
            {batch.collection_date && <span style={{ color: TC }}> · Pickup: {new Date(batch.collection_date).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
            {hasDiscrepancyNote && <span style={{ color: WARN, fontWeight: 700 }}> · Count adjusted</span>}
          </div>
          {noResponse && (
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: WARN, marginTop: '4px' }}>⚠ No response</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
          {isUnmatched && (
            <button onClick={() => showAssign ? setShowAssign(false) : openAssignPanel()} style={{ ...btnSt, color: '#C03030', borderColor: '#C03030' }}>
              Assign Student
            </button>
          )}
          {!showDiscrepancy && !hasDiscrepancyNote && (
            <button onClick={() => setShowDiscrepancy(!showDiscrepancy)} style={{ ...btnSt, fontSize: '10px' }}>
              Flag Count
            </button>
          )}
          {nextStatus && (
            <button
              onClick={() => onStatusUpdate(batch.id, nextStatus)}
              style={nextStatus === 'ready' ? btnSuccessSt : btnWarnSt}
            >
              {nextStatus === 'ready' ? 'Mark Ready' : `→ ${STATUS_LABELS[nextStatus]}`}
            </button>
          )}
          {batch.status === 'collecting' && (
            <>
              {batch.collection_date && (() => {
                const d = new Date(batch.collection_date);
                const today = new Date(); today.setHours(0,0,0,0);
                const diffDays = Math.ceil((d - today) / 86400000);
                const urgent = diffDays <= 1;
                return (
                  <div style={{
                    padding: '4px 10px', backgroundColor: urgent ? '#FFF3E0' : TC_LIGHT,
                    border: `1px solid ${urgent ? '#E65100' : TC}`,
                    color: urgent ? '#E65100' : TC,
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    display: 'flex', alignItems: 'center',
                  }}>
                    {d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {urgent && diffDays === 0 && ' · TODAY'}
                    {urgent && diffDays === 1 && ' · TOMORROW'}
                  </div>
                );
              })()}
              <button onClick={() => onPlaceInCabinet(batch.id)} style={btnAccentSt}>
                Place in Cabinet
              </button>
            </>
          )}
          {batch.status === 'delivering' && (
            <ShipControl batch={batch} onShip={onShip} />
          )}
          {batch.status === 'in_cabinet' && (
            <button onClick={() => onMarkCollected(batch.id)} style={btnSt}>
              Mark Collected
            </button>
          )}
          {batch.status === 'ready' && (
            <>
              <button onClick={() => onComplete(batch.id, 'collected')} style={btnSt}>
                Collected
              </button>
              <button onClick={() => onComplete(batch.id, 'shipped')} style={btnSt}>
                Shipped
              </button>
            </>
          )}
        </div>
      </div>

      {/* Assign student panel */}
      {showAssign && (
        <div style={{ marginTop: '10px', padding: '12px', backgroundColor: '#FFF0F0', border: '1px solid #E0C0C0', borderRadius: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#C03030', marginBottom: '4px' }}>
            Who is "{batch.initials}"? — {batch.piece_count} pcs
          </div>
          {searchedVariants.length > 1 && (
            <div style={{ fontSize: '10px', color: MUTED, marginBottom: '8px' }}>
              Also checked: {searchedVariants.filter(v => v !== batch.initials.toUpperCase()).join(', ')}
            </div>
          )}

          {/* Batch photo for visual matching */}
          {photoUrl && (
            <div style={{ marginBottom: '8px' }}>
              <img src={photoUrl} alt="Piece" style={{ width: '120px', height: '120px', objectFit: 'cover', border: `1px solid ${RULE}` }} />
              <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px' }}>Match by size/style if initials are unclear</div>
            </div>
          )}

          {/* Auto-suggested matches from initials */}
          {initialsMatches.length > 0 && !assignSearch && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', color: MUTED, marginBottom: '4px' }}>Suggested matches</div>
              <div style={{ border: '1px solid #e0e0e0', backgroundColor: '#fff' }}>
                {initialsMatches.map(s => (
                  <div
                    key={s.id}
                    onClick={() => doAssign(s.id)}
                    style={{ padding: '8px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}
                    onMouseOver={e => e.currentTarget.style.backgroundColor = TC_LIGHT}
                    onMouseOut={e => e.currentTarget.style.backgroundColor = '#fff'}
                  >
                    <span style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</span>
                    <span style={{ color: MUTED }}>{s.email}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {initialsMatches.length === 0 && loadedInitials && !assignSearch && (
            <div style={{ fontSize: '11px', color: WARN, marginBottom: '8px' }}>No students found matching initials "{batch.initials}"</div>
          )}

          {/* Manual search fallback */}
          <div style={{ fontSize: '10px', color: MUTED, marginBottom: '4px' }}>
            {initialsMatches.length > 0 ? 'Or search manually' : 'Search by name or email'}
          </div>
          <input
            type="text"
            value={assignSearch}
            onChange={e => searchStudents(e.target.value)}
            placeholder="Type name or email…"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', marginBottom: '4px' }}
          />
          {assignResults.length > 0 && (
            <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #e0e0e0', backgroundColor: '#fff' }}>
              {assignResults.map(s => (
                <div
                  key={s.id}
                  onClick={() => doAssign(s.id)}
                  style={{ padding: '8px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}
                  onMouseOver={e => e.currentTarget.style.backgroundColor = TC_LIGHT}
                  onMouseOut={e => e.currentTarget.style.backgroundColor = '#fff'}
                >
                  <span style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</span>
                  <span style={{ color: MUTED }}>{s.email}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Flag discrepancy panel */}
      {showDiscrepancy && (
        <div style={{ marginTop: '10px', padding: '12px', backgroundColor: '#FFF8E1', border: '1px solid #E0D6A8', borderRadius: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: WARN, marginBottom: '8px' }}>
            Piece count discrepancy — student logged {batch.piece_count}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: '10px', color: MUTED, display: 'block', marginBottom: '3px' }}>Found</label>
              <input
                type="number"
                min="0"
                value={discActual}
                onChange={e => setDiscActual(e.target.value)}
                placeholder="#"
                style={{ width: '60px', padding: '7px 8px', border: '1px solid #ddd', fontSize: '13px', fontFamily: 'inherit', textAlign: 'center' }}
                autoFocus
              />
            </div>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ fontSize: '10px', color: MUTED, display: 'block', marginBottom: '3px' }}>What happened?</label>
              <select
                value={discReason}
                onChange={e => setDiscReason(e.target.value)}
                style={{ width: '100%', padding: '7px 8px', border: '1px solid #ddd', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' }}
              >
                <option value="">Select reason…</option>
                <option value="Student miscounted">Student miscounted</option>
                <option value="Piece broke during bisque firing">Broke during bisque firing</option>
                <option value="Piece broke during glaze firing">Broke during glaze firing</option>
                <option value="Piece cracked while drying">Cracked while drying</option>
                <option value="Piece not found in studio">Not found in studio</option>
                <option value="Other — see notes">Other</option>
              </select>
            </div>
            <button
              onClick={doFlagDiscrepancy}
              disabled={!discActual || !discReason}
              style={{ ...btnWarnSt, padding: '8px 14px', opacity: (!discActual || !discReason) ? 0.4 : 1 }}
            >
              Save
            </button>
            <button onClick={() => setShowDiscrepancy(false)} style={{ ...btnSt, padding: '8px 10px' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
