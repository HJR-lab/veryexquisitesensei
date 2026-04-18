import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';
const SUCCESS  = '#059669';
const WARN     = '#E65100';

const STATUS_ORDER = ['ready', 'in_cabinet', 'collecting', 'glaze_fired', 'bisque_fired', 'logged'];
const STATUS_LABELS = {
  logged: 'Logged / Drying',
  bisque_fired: 'Bisque Fired',
  glaze_fired: 'Glaze Fired',
  ready: 'Ready for Collection',
  collecting: 'Collection Scheduled',
  in_cabinet: 'In Cabinet',
};
const STATUS_COLORS = {
  logged: MUTED,
  bisque_fired: WARN,
  glaze_fired: WARN,
  ready: SUCCESS,
  collecting: SUCCESS,
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

export default function AdminPiecePipeline() {
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
      <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
        <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px 60px' }}>
          <div style={{ fontSize: '13px', color: MUTED }}>Loading pipeline…</div>
        </main>
      </div>
    );
  }

  const stats = pipeline.stats || {};

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* Header */}
        <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>
              Admin
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>
              Fire
            </h1>
          </div>
          <button onClick={() => setShowLogForm(true)} style={btnAccentSt}>
            + Log Batch
          </button>
        </div>

        {/* Stats Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}`, marginBottom: '24px' }}>
          {['glaze_fired', 'ready', 'collecting', 'in_cabinet'].map(key => (
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
                <BatchCard key={batch.id} batch={batch} daysSince={daysSince} onStatusUpdate={handleStatusUpdate} onComplete={handleComplete} onPlaceInCabinet={handlePlaceInCabinet} onMarkCollected={handleMarkCollected} onOpenPhoto={setViewingBatch} />
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
                    onOpenPhoto={setViewingBatch}
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
      </main>

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
    </div>
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

function BatchCard({ batch, daysSince, onStatusUpdate, onComplete, onPlaceInCabinet, onMarkCollected, onOpenPhoto, selected, onToggleSelect, showCheckbox }) {
  const student = batch.customers || {};
  const enrollment = batch.course_enrollments || {};
  const courseName = enrollment.course_title || enrollment.course_variant_title || 'Course';
  const photoUrl = batch.photo_urls && batch.photo_urls.length > 0 ? batch.photo_urls[0] : null;
  const nextStatus = NEXT_STATUS[batch.status];
  const isReady = ['ready', 'collecting', 'delivering'].includes(batch.status);
  const daysReady = isReady ? daysSince(batch.ready_at) : null;
  const noResponse = isReady && !batch.delivery_method && daysReady >= 7;

  return (
    <div style={{
      backgroundColor: selected ? TC_LIGHT : '#FFFFFF',
      padding: '14px 16px',
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      borderLeft: selected ? `3px solid ${TC}` : '3px solid transparent',
    }}>
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
          {student.first_name} {student.last_name}
        </div>
        <div style={{ fontSize: '11px', color: MUTED }}>
          {courseName} · {batch.piece_count} pcs · <strong style={{ color: INK }}>{batch.initials}</strong>
          {daysReady !== null && ` · Ready ${daysReady}d ago`}
          {batch.delivery_method === 'collect' && <span style={{ color: SUCCESS, fontWeight: 700 }}> · Collecting</span>}
          {batch.delivery_method === 'deliver' && <span style={{ color: TC, fontWeight: 700 }}> · Delivery</span>}
          {batch.collection_date && <span style={{ color: TC }}> · Pickup: {new Date(batch.collection_date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>}
        </div>
        {noResponse && (
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: WARN, marginTop: '4px' }}>⚠ No response</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {nextStatus && (
          <button
            onClick={() => onStatusUpdate(batch.id, nextStatus)}
            style={nextStatus === 'ready' ? btnSuccessSt : btnWarnSt}
          >
            {nextStatus === 'ready' ? 'Mark Ready' : `→ ${STATUS_LABELS[nextStatus]}`}
          </button>
        )}
        {batch.status === 'collecting' && (
          <button onClick={() => onPlaceInCabinet(batch.id)} style={btnAccentSt}>
            Place in Cabinet
          </button>
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
  );
}
