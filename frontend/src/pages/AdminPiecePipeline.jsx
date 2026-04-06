import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

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
  logged: '#888',
  bisque_fired: '#E65100',
  glaze_fired: '#E65100',
  ready: '#2D8C4E',
  collecting: '#2D8C4E',
  in_cabinet: '#C4622D',
};
const NEXT_STATUS = {
  logged: 'bisque_fired',
  bisque_fired: 'glaze_fired',
  glaze_fired: 'ready',
};

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
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading pipeline...</div>;
  }

  const stats = pipeline.stats || {};

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ margin: '0 0 20px', fontSize: 24, color: '#282828' }}>Piece Pipeline</h1>

      {/* Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
        {['logged', 'bisque_fired', 'glaze_fired', 'ready', 'collecting', 'in_cabinet'].map(key => (
          <div key={key} style={{ textAlign: 'center', padding: 16, background: 'white', borderRadius: 10, border: '1px solid #e0e0e0' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: STATUS_COLORS[key] }}>{stats[key]?.count || 0}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{STATUS_LABELS[key]}</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>{stats[key]?.pieces || 0} pieces</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ background: 'white', borderRadius: 10, padding: 16, marginBottom: 24, border: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search by initials (e.g. JL)"
            style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, letterSpacing: 2, fontWeight: 600 }}
          />
          <button onClick={handleSearch} style={{ padding: '10px 20px', background: '#282828', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
            Search
          </button>
        </div>

        {searchResults && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</div>
            {searchResults.map(batch => (
              <BatchCard key={batch.id} batch={batch} daysSince={daysSince} onStatusUpdate={handleStatusUpdate} onComplete={handleComplete} onPlaceInCabinet={handlePlaceInCabinet} onMarkCollected={handleMarkCollected} />
            ))}
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedBatches.size > 0 && (
        <div style={{ background: '#282828', color: 'white', borderRadius: 10, padding: 12, marginBottom: 16, position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13 }}>{selectedBatches.size} selected</span>
            <button onClick={() => handleBulkStatus('bisque_fired')} style={{ padding: '6px 12px', background: '#E65100', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>→ Bisque Fired</button>
            <button onClick={() => handleBulkStatus('glaze_fired')} style={{ padding: '6px 12px', background: '#E65100', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>→ Glaze Fired</button>
            <button onClick={() => handleBulkStatus('ready')} style={{ padding: '6px 12px', background: '#2D8C4E', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>→ Ready</button>
            <button onClick={() => setShowFiringRunForm(!showFiringRunForm)} style={{ padding: '6px 12px', background: '#C4622D', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Create Firing Run</button>
            <button onClick={() => setSelectedBatches(new Set())} style={{ marginLeft: 'auto', padding: '6px 12px', background: 'transparent', color: '#aaa', border: '1px solid #555', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>Clear</button>
          </div>

          {showFiringRunForm && (
            <div style={{ marginTop: 12, padding: 12, background: '#333', borderRadius: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 4 }}>Type</label>
                  <select value={firingRunType} onChange={e => setFiringRunType(e.target.value)} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #555', background: '#444', color: 'white', fontSize: 13 }}>
                    <option value="bisque">Bisque</option>
                    <option value="glaze">Glaze</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
                  <input value={firingRunNotes} onChange={e => setFiringRunNotes(e.target.value)} placeholder="e.g. Large kiln, cone 6" style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #555', background: '#444', color: 'white', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <button onClick={handleCreateFiringRun} style={{ padding: '8px 20px', background: '#E65100', color: 'white', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-end' }}>
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
          <div key={statusKey} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: STATUS_COLORS[statusKey], textTransform: 'uppercase', marginBottom: 8 }}>
              {STATUS_LABELS[statusKey]} ({batchesForStatus.length} batch{batchesForStatus.length !== 1 ? 'es' : ''})
            </div>
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
        );
      })}

      {/* Firing Run History */}
      <div style={{ marginTop: 32 }}>
        <button
          onClick={() => setShowRunHistory(!showRunHistory)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#888', padding: 0 }}
        >
          {showRunHistory ? '▼' : '▶'} Firing Run History ({firingRuns.length})
        </button>

        {showRunHistory && (
          <div style={{ marginTop: 12 }}>
            {firingRuns.length === 0 && (
              <div style={{ color: '#888', fontSize: 13 }}>No firing runs yet.</div>
            )}
            {firingRuns.map(run => (
              <div key={run.id} style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: 8, padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {run.firing_type === 'bisque' ? 'Bisque' : 'Glaze'} Run
                  </span>
                  <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                    {new Date(run.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                  </span>
                  {run.notes && <span style={{ fontSize: 12, color: '#aaa', marginLeft: 8 }}>— {run.notes}</span>}
                  <span style={{
                    marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                    background: run.status === 'completed' ? '#E8F5E9' : '#FFF3E0',
                    color: run.status === 'completed' ? '#2D8C4E' : '#E65100',
                  }}>
                    {run.status}
                  </span>
                </div>
                {run.status !== 'completed' && (
                  <button
                    onClick={() => handleCompleteFiringRun(run.id)}
                    style={{ padding: '6px 14px', background: '#2D8C4E', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                  >
                    Complete Run
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
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
      background: 'white', border: `1px solid ${selected ? '#C4622D' : '#e0e0e0'}`,
      borderRadius: 8, padding: 12, marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center',
    }}>
      {showCheckbox && (
        <input type="checkbox" checked={selected} onChange={onToggleSelect} style={{ cursor: 'pointer' }} />
      )}

      {photoUrl && (
        <img src={photoUrl} alt="Batch" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{student.first_name} {student.last_name}</div>
        <div style={{ fontSize: 12, color: '#888' }}>
          {courseName} · {batch.piece_count} pcs · <strong>{batch.initials}</strong>
          {daysReady !== null && ` · Ready ${daysReady}d ago`}
          {batch.delivery_method === 'collect' && <span style={{ color: '#2D8C4E', fontWeight: 600 }}> · Collecting</span>}
          {batch.delivery_method === 'deliver' && <span style={{ color: '#C4622D', fontWeight: 600 }}> · Delivery</span>}
          {batch.collection_date && <span style={{ color: '#C4622D' }}> · Pickup: {new Date(batch.collection_date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>}
        </div>
        {noResponse && (
          <div style={{ fontSize: 11, color: '#E65100', fontWeight: 600, marginTop: 2 }}>⚠️ No response</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
        {nextStatus && (
          <button
            onClick={() => onStatusUpdate(batch.id, nextStatus)}
            style={{
              padding: '6px 12px',
              background: nextStatus === 'ready' ? '#2D8C4E' : '#E65100',
              color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600,
            }}
          >
            {nextStatus === 'ready' ? 'Mark Ready' : `→ ${STATUS_LABELS[nextStatus]}`}
          </button>
        )}
        {batch.status === 'collecting' && (
          <button
            onClick={() => onPlaceInCabinet(batch.id)}
            style={{ padding: '6px 12px', background: '#C4622D', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
          >
            Place in Cabinet
          </button>
        )}
        {batch.status === 'in_cabinet' && (
          <button
            onClick={() => onMarkCollected(batch.id)}
            style={{ padding: '6px 12px', background: '#1565C0', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
          >
            Mark Collected
          </button>
        )}
        {batch.status === 'ready' && (
          <>
            <button
              onClick={() => onComplete(batch.id, 'collected')}
              style={{ padding: '6px 12px', background: '#1565C0', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
            >
              Collected
            </button>
            <button
              onClick={() => onComplete(batch.id, 'shipped')}
              style={{ padding: '6px 12px', background: '#1565C0', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
            >
              Shipped
            </button>
          </>
        )}
      </div>
    </div>
  );
}
