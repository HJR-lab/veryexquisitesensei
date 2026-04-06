import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const STATUS_CONFIG = {
  logged: { label: 'Logged', color: '#888', bg: '#f5f5f5' },
  bisque_fired: { label: 'Bisque Fired', color: '#888', bg: '#f5f5f5' },
  glaze_fired: { label: 'Glaze Firing', color: '#E65100', bg: '#FFF3E0' },
  ready: { label: 'Ready!', color: '#2D8C4E', bg: '#E8F5E9' },
  collecting: { label: 'Collection Scheduled', color: '#2D8C4E', bg: '#E8F5E9' },
  in_cabinet: { label: 'In Cabinet', color: '#C4622D', bg: '#FFF3E0' },
  delivering: { label: 'Delivery', color: '#C4622D', bg: '#FFF3E0' },
  collected: { label: 'Collected', color: '#1565C0', bg: '#E3F2FD' },
  shipped: { label: 'Shipped', color: '#1565C0', bg: '#E3F2FD' },
  recycled: { label: 'Recycled', color: '#888', bg: '#f5f5f5' },
};

// Embeddable component — used inside GalleryNew as a tab
export default function MyPieces() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogForm, setShowLogForm] = useState(false);
  const [enrollments, setEnrollments] = useState([]);

  // Log form state
  const [logForm, setLogForm] = useState({
    courseEnrollmentId: '',
    pieceCount: 7,
    initials: '',
    notes: '',
    photos: [],
  });
  const [uploading, setUploading] = useState(false);
  const [collectionDates, setCollectionDates] = useState({});

  const fetchBatches = useCallback(async () => {
    try {
      const { data } = await api.get('/pieces/my-batches');
      setBatches(data.batches || []);
    } catch (err) {
      console.error('Failed to fetch batches:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
    // Fetch enrollments for the log form dropdown
    api.get('/pottery/pieces').then(({ data }) => {
      // We need course enrollments — use admin endpoint or a dedicated one
    }).catch(() => {});
    // Fetch customer profile for initials
    api.get('/auth/me').then(({ data }) => {
      if (data.customer?.initials) {
        setLogForm(f => ({ ...f, initials: data.customer.initials }));
      }
    }).catch(() => {});
  }, [fetchBatches]);

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('images', f));
      const { data } = await api.post('/upload/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setLogForm(f => ({
        ...f,
        photos: [...f.photos, ...data.images.map(img => img.url)],
      }));
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitLog = async () => {
    if (!logForm.initials || !logForm.pieceCount) return;

    try {
      setUploading(true);
      await api.post('/pieces/log', {
        courseEnrollmentId: logForm.courseEnrollmentId || null,
        pieceCount: logForm.pieceCount,
        initials: logForm.initials,
        notes: logForm.notes,
        photoUrls: JSON.stringify(logForm.photos),
      });
      setShowLogForm(false);
      setLogForm({ courseEnrollmentId: '', pieceCount: 7, initials: logForm.initials, notes: '', photos: [] });
      fetchBatches();
    } catch (err) {
      console.error('Failed to log pieces:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleDeliveryChoice = async (batchId, method) => {
    try {
      const payload = { method };
      if (method === 'collect') {
        const date = collectionDates[batchId];
        if (!date) return;
        payload.collectionDate = date;
      }
      await api.put(`/pieces/batches/${batchId}/delivery`, payload);
      fetchBatches();
    } catch (err) {
      console.error('Failed to set delivery:', err);
    }
  };

  const handleConfirmCollected = async (batchId) => {
    try {
      await api.put(`/pieces/batches/${batchId}/confirm-collected`);
      fetchBatches();
    } catch (err) {
      console.error('Failed to confirm collection:', err);
    }
  };

  const getMinCollectionDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
        Loading your pieces...
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          onClick={() => setShowLogForm(!showLogForm)}
          style={{ padding: '8px 16px', background: '#C4622D', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}
        >
          {showLogForm ? 'Cancel' : '+ Log Pieces'}
        </button>
      </div>

      {/* Log Form */}
      {showLogForm && (
        <div style={{ background: '#F5F3F0', padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 12 }}>Log Your Pieces</div>

          {/* Photo upload */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              Photo of all your pieces
            </label>
            {logForm.photos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                {logForm.photos.map((url, i) => (
                  <img key={i} src={url} alt={`Piece ${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
                ))}
              </div>
            )}
            <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} disabled={uploading} />
            {uploading && <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>Uploading...</span>}
          </div>

          {/* Piece count */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              How many pieces?
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => setLogForm(f => ({ ...f, pieceCount: Math.max(1, f.pieceCount - 1) }))}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #ddd', background: 'white', fontSize: 18, cursor: 'pointer' }}
              >−</button>
              <span style={{ fontSize: 24, fontWeight: 700, color: '#C4622D', minWidth: 30, textAlign: 'center' }}>
                {logForm.pieceCount}
              </span>
              <button
                onClick={() => setLogForm(f => ({ ...f, pieceCount: f.pieceCount + 1 }))}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #ddd', background: 'white', fontSize: 18, cursor: 'pointer' }}
              >+</button>
            </div>
          </div>

          {/* Initials */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              Your initials (inscribed on pieces)
            </label>
            <input
              type="text"
              value={logForm.initials}
              onChange={e => setLogForm(f => ({ ...f, initials: e.target.value }))}
              maxLength={5}
              style={{ width: 100, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 18, textAlign: 'center', letterSpacing: 4, fontWeight: 600 }}
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              Notes <span style={{ color: '#aaa' }}>(optional)</span>
            </label>
            <input
              type="text"
              value={logForm.notes}
              onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. 3 bowls, 2 mugs, 2 plates"
              style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          <button
            onClick={handleSubmitLog}
            disabled={!logForm.initials || !logForm.pieceCount || uploading}
            style={{
              width: '100%', padding: 14, background: (!logForm.initials || uploading) ? '#ccc' : '#C4622D',
              color: 'white', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Submit Pieces
          </button>
        </div>
      )}

      {/* Batch List */}
      {batches.length === 0 && !showLogForm && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#888' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏺</div>
          <p>No pieces logged yet. Tap "Log My Pieces" after glazing!</p>
        </div>
      )}

      {batches.map(batch => {
        const statusConfig = STATUS_CONFIG[batch.status] || STATUS_CONFIG.logged;
        const photoUrl = batch.photo_urls && batch.photo_urls.length > 0 ? batch.photo_urls[0] : null;
        const courseName = batch.course_enrollments?.course_title || batch.course_enrollments?.course_variant_title || 'Course';

        return (
          <div
            key={batch.id}
            style={{
              background: statusConfig.bg, border: `1px solid ${batch.status === 'ready' ? '#A5D6A7' : '#e0e0e0'}`,
              borderRadius: 12, padding: 16, marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: '#282828' }}>{courseName}</div>
              <span style={{
                background: statusConfig.color, color: 'white', fontSize: 11,
                padding: '2px 10px', borderRadius: 99, fontWeight: 600,
              }}>
                {statusConfig.label}
              </span>
            </div>

            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
              {batch.piece_count} piece{batch.piece_count !== 1 ? 's' : ''} · Initials: {batch.initials}
              {batch.pieces_allowed && batch.piece_count > batch.pieces_allowed && (
                <span style={{ color: '#E65100', marginLeft: 8 }}>
                  ({batch.piece_count - batch.pieces_allowed} extra @ $20 each)
                </span>
              )}
            </div>

            {photoUrl && (
              <img
                src={photoUrl}
                alt="Batch photo"
                style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }}
              />
            )}

            {batch.notes && (
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{batch.notes}</div>
            )}

            {/* Ready — choose collect (with date) or deliver */}
            {batch.status === 'ready' && (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Pick a collection date (at least 2 days from now)</label>
                  <input
                    type="date"
                    min={getMinCollectionDate()}
                    value={collectionDates[batch.id] || ''}
                    onChange={e => setCollectionDates(prev => ({ ...prev, [batch.id]: e.target.value }))}
                    style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 14, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleDeliveryChoice(batch.id, 'collect')}
                    disabled={!collectionDates[batch.id]}
                    style={{
                      flex: 1, padding: 10, background: collectionDates[batch.id] ? '#2D8C4E' : '#ccc',
                      color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    I'll Collect
                  </button>
                  <button
                    onClick={() => handleDeliveryChoice(batch.id, 'deliver')}
                    style={{ flex: 1, padding: 10, background: 'white', color: '#C4622D', border: '1px solid #C4622D', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Deliver ($10)
                  </button>
                </div>
              </div>
            )}

            {/* Collecting — waiting for studio */}
            {batch.status === 'collecting' && (
              <div style={{ fontSize: 13, color: '#2D8C4E', fontWeight: 600, marginTop: 4 }}>
                Collection scheduled for {new Date(batch.collection_date).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}
                <div style={{ fontSize: 12, color: '#888', fontWeight: 400, marginTop: 2 }}>Waiting for studio to prepare your pieces</div>
              </div>
            )}

            {/* In Cabinet — confirm collection */}
            {batch.status === 'in_cabinet' && (
              <div>
                <div style={{ fontSize: 13, color: '#C4622D', fontWeight: 600, marginBottom: 8 }}>
                  Your pieces are in the glass cabinet outside — pick them up anytime!
                </div>
                <button
                  onClick={() => handleConfirmCollected(batch.id)}
                  style={{ width: '100%', padding: 12, background: '#2D8C4E', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                >
                  I've Collected My Pieces
                </button>
              </div>
            )}

            {/* Delivering */}
            {batch.status === 'delivering' && (
              <div style={{ fontSize: 13, color: '#C4622D', fontWeight: 600, marginTop: 4 }}>
                Delivery requested ($10) — we'll ship it to you!
              </div>
            )}

            {/* Collected */}
            {batch.status === 'collected' && (
              <div style={{ fontSize: 13, color: '#1565C0', fontWeight: 600, marginTop: 4 }}>
                Collected{batch.completed_at ? ` on ${new Date(batch.completed_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}` : ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
