import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const STATUS_ORDER = ['ready', 'glaze_fired', 'bisque_fired', 'logged'];
const STATUS_LABELS = {
  logged: 'Logged / Drying',
  bisque_fired: 'Bisque Fired',
  glaze_fired: 'Glaze Fired',
  ready: 'Ready for Collection',
};
const STATUS_COLORS = {
  logged: '#888',
  bisque_fired: '#E65100',
  glaze_fired: '#E65100',
  ready: '#2D8C4E',
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
  const [readyModal, setReadyModal] = useState(null);
  const [expandedPhoto, setExpandedPhoto] = useState(null);

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

  const handleMarkReady = (batch) => {
    setReadyModal(batch);
  };

  const handleConfirmReady = async () => {
    if (!readyModal) return;
    await handleStatusUpdate(readyModal.id, 'ready');
    setReadyModal(null);
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {['logged', 'bisque_fired', 'glaze_fired', 'ready'].map(key => (
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
              <BatchCard key={batch.id} batch={batch} daysSince={daysSince} onStatusUpdate={handleStatusUpdate} onMarkReady={handleMarkReady} onComplete={handleComplete} onExpandPhoto={setExpandedPhoto} />
            ))}
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedBatches.size > 0 && (
        <div style={{ background: '#282828', color: 'white', borderRadius: 10, padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
          <span style={{ fontSize: 13 }}>{selectedBatches.size} selected</span>
          <button onClick={() => handleBulkStatus('bisque_fired')} style={{ padding: '6px 12px', background: '#E65100', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>→ Bisque Fired</button>
          <button onClick={() => handleBulkStatus('glaze_fired')} style={{ padding: '6px 12px', background: '#E65100', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>→ Glaze Fired</button>
          <button onClick={() => handleBulkStatus('ready')} style={{ padding: '6px 12px', background: '#2D8C4E', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>→ Ready</button>
          <button onClick={() => setSelectedBatches(new Set())} style={{ marginLeft: 'auto', padding: '6px 12px', background: 'transparent', color: '#aaa', border: '1px solid #555', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>Clear</button>
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
                onMarkReady={handleMarkReady}
                onComplete={handleComplete}
                onExpandPhoto={setExpandedPhoto}
                selected={selectedBatches.has(batch.id)}
                onToggleSelect={() => toggleSelect(batch.id)}
                showCheckbox
              />
            ))}
          </div>
        );
      })}

      {/* Mark Ready Confirmation Modal */}
      {readyModal && (
        <ConfirmReadyModal
          batch={readyModal}
          onConfirm={handleConfirmReady}
          onClose={() => setReadyModal(null)}
        />
      )}

      {/* Full-size Photo Viewer */}
      {expandedPhoto && (
        <div
          onClick={() => setExpandedPhoto(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 20 }}
        >
          <img src={expandedPhoto} alt="Full size" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

function ConfirmReadyModal({ batch, onConfirm, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const student = batch.customers || {};
  const enrollment = batch.course_enrollments || {};
  const courseName = enrollment.course_title || enrollment.course_variant_title || 'Course';
  const photos = batch.photo_urls || [];

  const handleConfirm = async () => {
    setSubmitting(true);
    await onConfirm();
    setSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, maxWidth: 480, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, color: '#282828' }}>Confirm Pieces Ready</h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#888' }}>
          Verify the fired pieces match the student's photos below. The student will be notified by email and in-app notification.
        </p>

        {/* Student info */}
        <div style={{ background: '#F5F3F0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{student.first_name} {student.last_name}</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
            {courseName} · {batch.piece_count} piece{batch.piece_count !== 1 ? 's' : ''} · Initials: <strong>{batch.initials}</strong>
          </div>
          {batch.notes && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{batch.notes}</div>}
        </div>

        {/* Student photos — large for verification */}
        {photos.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>
              Student's Photos ({photos.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {photos.map((url, i) => (
                <img key={i} src={url} alt={`Piece ${i + 1}`} style={{ width: '100%', maxHeight: 250, objectFit: 'cover', borderRadius: 8 }} />
              ))}
            </div>
          </div>
        )}

        {photos.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: '#E65100', background: '#FFF3E0', borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
            No photos uploaded by student
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: 14, background: '#f5f5f5', color: '#666', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            style={{ flex: 1, padding: 14, background: submitting ? '#aaa' : '#2D8C4E', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
          >
            {submitting ? 'Notifying...' : 'Confirm Ready & Notify'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchCard({ batch, daysSince, onStatusUpdate, onMarkReady, onComplete, onExpandPhoto, selected, onToggleSelect, showCheckbox }) {
  const student = batch.customers || {};
  const enrollment = batch.course_enrollments || {};
  const courseName = enrollment.course_title || enrollment.course_variant_title || 'Course';
  const photos = batch.photo_urls || [];
  const photoUrl = photos.length > 0 ? photos[0] : null;
  const nextStatus = NEXT_STATUS[batch.status];
  const isReady = ['ready', 'collecting', 'delivering'].includes(batch.status);
  const daysReady = isReady ? daysSince(batch.ready_at) : null;
  const noResponse = isReady && !batch.delivery_method && daysReady >= 7;

  return (
    <div style={{
      background: 'white', border: `1px solid ${selected ? '#C4622D' : '#e0e0e0'}`,
      borderRadius: 8, padding: 12, marginBottom: 8,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {showCheckbox && (
          <input type="checkbox" checked={selected} onChange={onToggleSelect} style={{ cursor: 'pointer', flexShrink: 0 }} />
        )}

        {/* Thumbnail — tap to expand */}
        {photoUrl && (
          <img
            src={photoUrl}
            alt="Pieces"
            onClick={() => onExpandPhoto(photoUrl)}
            style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, flexShrink: 0, cursor: 'pointer', border: '1px solid #e0e0e0' }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{student.first_name} {student.last_name}</div>
          <div style={{ fontSize: 12, color: '#888' }}>
            {courseName} · {batch.piece_count} pcs · <strong>{batch.initials}</strong>
            {photos.length > 1 && <span style={{ color: '#C4622D' }}> · {photos.length} photos</span>}
            {daysReady !== null && ` · Ready ${daysReady}d ago`}
            {batch.delivery_method === 'collect' && <span style={{ color: '#2D8C4E', fontWeight: 600 }}> · Collecting</span>}
            {batch.delivery_method === 'deliver' && <span style={{ color: '#C4622D', fontWeight: 600 }}> · Delivery</span>}
          </div>
          {batch.notes && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{batch.notes}</div>}
          {noResponse && (
            <div style={{ fontSize: 11, color: '#E65100', fontWeight: 600, marginTop: 2 }}>No response</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {nextStatus && nextStatus !== 'ready' && (
            <button
              onClick={() => onStatusUpdate(batch.id, nextStatus)}
              style={{
                padding: '6px 12px', background: '#E65100',
                color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600,
              }}
            >
              {`→ ${STATUS_LABELS[nextStatus]}`}
            </button>
          )}
          {nextStatus === 'ready' && (
            <button
              onClick={() => onMarkReady(batch)}
              style={{
                padding: '6px 12px', background: '#2D8C4E',
                color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600,
              }}
            >
              Mark Ready
            </button>
          )}
          {isReady && (
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

      {/* Extra photos row — show thumbnails if > 1 photo */}
      {photos.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, marginLeft: showCheckbox ? 28 : 0, overflowX: 'auto' }}>
          {photos.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Photo ${i + 1}`}
              onClick={() => onExpandPhoto(url)}
              style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', flexShrink: 0, border: '1px solid #e0e0e0' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
