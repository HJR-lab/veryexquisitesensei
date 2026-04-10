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
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>
            Admin
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>
            Fire
          </h1>
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
                <BatchCard key={batch.id} batch={batch} daysSince={daysSince} onStatusUpdate={handleStatusUpdate} onComplete={handleComplete} onPlaceInCabinet={handlePlaceInCabinet} onMarkCollected={handleMarkCollected} />
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
    </div>
  );
}

function BatchCard({ batch, daysSince, onStatusUpdate, onComplete, onPlaceInCabinet, onMarkCollected, selected, onToggleSelect, showCheckbox }) {
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
        <img src={photoUrl} alt="Batch" style={{ width: '48px', height: '48px', objectFit: 'cover', flexShrink: 0, border: `1px solid ${RULE}` }} />
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
