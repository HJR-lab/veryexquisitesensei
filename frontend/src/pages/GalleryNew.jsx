import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import ImpersonationBanner from '../components/ImpersonationBanner';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// Shown only while a delivery fee is genuinely outstanding. Uploading a
// screenshot records a claim; the studio still has to check the bank, so the
// copy promises confirmation rather than pretending the balance is cleared.
function PayNowBox({ batch, paynow, onUploaded }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const owed = Number(batch.delivery_fee_outstanding) || 0;
  const sent = !!batch.payment_uploaded_at;

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('receipt', file);
      await api.post(`/pieces/batches/${batch.id}/payment-receipt`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await onUploaded();
    } catch (err) {
      setError(err?.response?.data?.error || 'Upload failed — try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 8, padding: 10, background: ALT, border: `1px solid ${RULE}` }} onClick={e => e.stopPropagation()}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TC, marginBottom: 6 }}>
        ${owed.toFixed(2)} delivery fee
      </div>
      {paynow ? (
        <div style={{ fontSize: 11, color: INK, lineHeight: 1.5, marginBottom: 8 }}>
          PayNow to UEN <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{paynow.uen}</span> ({paynow.payee}),
          then upload the screenshot here.
        </div>
      ) : (
        <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, marginBottom: 8 }}>
          Contact the studio to settle this.
        </div>
      )}
      {sent ? (
        <div style={{ fontSize: 11, color: '#2D8C4E', fontWeight: 600 }}>
          Screenshot received — we&rsquo;ll confirm once we&rsquo;ve checked.
        </div>
      ) : (
        <label style={{ display: 'inline-block', padding: '5px 12px', background: INK, color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Uploading…' : 'Upload screenshot'}
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={e => upload(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
        </label>
      )}
      {error && <div style={{ fontSize: 11, color: '#C03030', marginTop: 6 }}>{error}</div>}
    </div>
  );
}

export default function GalleryNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // The pieces-ready email sends both CTAs here, distinguished only by ?intent.
  // Both buttons used to land on the same URL, so the click carried nothing and
  // the student had to choose all over again. We honour the click by scrolling
  // to the batch and pre-highlighting the option they picked — but never by
  // submitting it. "Deliver" costs $10; a single tap in an email must not commit
  // a charge, and a mis-tap on "Collect" would lock in a date they never saw.
  const emailIntent = searchParams.get('intent');
  const firingSectionRef = useRef(null);
  const intentAppliedRef = useRef(false);
  const [intentHighlight, setIntentHighlight] = useState(null);

  // Redirect admin to dashboard instead of gallery
  useEffect(() => {
    if (user?.isAdmin && !user?.isImpersonating) {
      navigate('/admin', { replace: true });
    }
  }, [user, navigate]);

  // --- gallery sub-tab ---
  const [galleryTab, setGalleryTab] = useState('mine'); // 'mine' | 'community'

  // --- piece data ---
  const [pieces, setPieces] = useState([]);
  const [communityPieces, setCommunityPieces] = useState([]);
  const [firingBatches, setFiringBatches] = useState([]);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- reference data ---
  const [clayTypes, setClayTypes] = useState([]);
  const [glazes, setGlazes] = useState([]);

  // --- upload / edit state ---
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [editImageFiles, setEditImageFiles] = useState([]);
  const [editImagePreviewUrls, setEditImagePreviewUrls] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);

  // --- batch edit state ---
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchForm, setBatchForm] = useState({ pieceCount: 0, initials: '', notes: '', photos: [] });
  const [batchUploading, setBatchUploading] = useState(false);

  // Per-batch chosen collection date for the inline "ready" row picker
  const [collectionDates, setCollectionDates] = useState({});
  const [paynow, setPaynow] = useState(null);

  useEffect(() => {
    api.get('/policy/fees')
      .then(({ data }) => setPaynow(data?.PAYNOW || null))
      .catch(() => setPaynow(null)); // the card degrades to "contact the studio"
  }, []);

  // Batches arrive after the first render and refetch on every upload, so this
  // is guarded to fire once — otherwise a later refetch would yank the page back
  // to the pipeline mid-scroll.
  useEffect(() => {
    if (intentAppliedRef.current) return;
    if (!emailIntent || !['collect', 'deliver'].includes(emailIntent)) return;
    if (!firingBatches.some(b => b.status === 'ready')) return;
    intentAppliedRef.current = true;
    setIntentHighlight(emailIntent);
    setGalleryTab('mine');
    // Wait a frame so the section exists before we scroll to it.
    const id = requestAnimationFrame(() => {
      firingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(id);
  }, [emailIntent, firingBatches]);

  // --- filters ---
  const [filterClayType, setFilterClayType] = useState('');
  const [filterGlaze, setFilterGlaze] = useState('');

  // --- form ---
  const [formData, setFormData] = useState({
    title: '',
    clay_type: '',
    date_completed: '',
    glazes: [],
    height: '',
    width: '',
    length: '',
    original_weight: '',
    final_weight: '',
    description: '',
    tags: [],
    is_public: false,
    images: []
  });

  useEffect(() => {
    fetchPieces();
    fetchReferenceData();
    fetchCommunityPieces();
    fetchFiringBatches();
  }, []);

  const fetchReferenceData = async () => {
    try {
      const [clayTypesRes, glazesRes] = await Promise.all([
        api.get('/reference/clay-types'),
        api.get('/reference/glazes')
      ]);
      setClayTypes(clayTypesRes.data.clayTypes || []);
      setGlazes(glazesRes.data.glazes || []);
    } catch (error) {
      console.error('Error fetching reference data:', error);
    }
  };

  const fetchPieces = async () => {
    try {
      const response = await api.get('/pottery/pieces');
      setPieces(response.data.pieces || []);
    } catch (error) {
      console.error('Error fetching pieces:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCommunityPieces = async () => {
    try {
      const response = await api.get('/pottery/community');
      setCommunityPieces(response.data.pieces || []);
    } catch (error) {
      // Community endpoint may not exist yet — silently ignore
      console.info('Community pieces not available:', error.message);
    }
  };

  const fetchFiringBatches = async () => {
    try {
      const { data } = await api.get('/pieces/my-batches');
      // Still in the pipeline, plus recently shipped ones — a parcel in transit is
      // the moment the student most wants the tracking number, and dropping it the
      // instant it ships hides exactly that. Collected and recycled are done.
      const RECENT_SHIP_DAYS = 30;
      const active = (data.batches || []).filter(b => {
        if (['collected', 'recycled'].includes(b.status)) return false;
        // An unpaid delivery fee outlives the tracking window — hiding the batch
        // would take the PayNow instructions away with it.
        if (Number(b.delivery_fee_outstanding) > 0) return true;
        if (b.status !== 'shipped') return true;
        if (!b.shipped_at) return false;
        return (Date.now() - new Date(b.shipped_at)) < RECENT_SHIP_DAYS * 86400000;
      });
      setFiringBatches(active);
    } catch (err) {
      console.info('Firing batches not available:', err.message);
    }
  };

  const minCollectionDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 2); // server enforces 48hr advance
    return d.toISOString().slice(0, 10);
  };

  const handleDeliveryChoice = async (batchId, method) => {
    try {
      const payload = { method };
      if (method === 'collect') {
        const date = collectionDates[batchId];
        if (!date) {
          alert('Pick a collection date (at least 2 days from today) before tapping Collect.');
          return;
        }
        payload.collectionDate = date;
      }
      await api.put(`/pieces/batches/${batchId}/delivery`, payload);
      setCollectionDates(prev => { const next = { ...prev }; delete next[batchId]; return next; });
      fetchFiringBatches();
    } catch (err) {
      console.error('Failed to set delivery:', err);
      alert(`Failed: ${err.response?.data?.error || err.message}`);
    }
  };

  // Download a remote image to the user's device. Supabase URLs are cross-origin,
  // so <a download> alone won't trigger a save — fetch into a blob first.
  const downloadImage = async (url, filename) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'jpg').split('+')[0];
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename ? `${filename}.${ext}` : `pottery-photo.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Could not download. On mobile, try long-pressing the image to save.');
    }
  };

  // --- Batch edit handlers ---
  const openBatchEdit = (batch) => {
    setSelectedBatch(batch);
    setBatchForm({
      pieceCount: batch.piece_count || 0,
      initials: batch.initials || '',
      notes: batch.notes || '',
      photos: Array.isArray(batch.photo_urls) ? batch.photo_urls : [],
    });
  };

  const closeBatchEdit = () => {
    setSelectedBatch(null);
    setBatchForm({ pieceCount: 0, initials: '', notes: '', photos: [] });
  };

  const handleBatchPhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setBatchUploading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('images', f));
      const { data } = await api.post('/upload/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBatchForm(f => ({
        ...f,
        photos: [...f.photos, ...data.images.map(img => img.url)],
      }));
    } catch (err) {
      console.error('Photo upload failed:', err);
      alert('Photo upload failed. Please try again.');
    } finally {
      setBatchUploading(false);
      e.target.value = '';
    }
  };

  const removeBatchPhoto = (index) => {
    setBatchForm(f => ({ ...f, photos: f.photos.filter((_, i) => i !== index) }));
  };

  const handleSaveBatch = async () => {
    if (!selectedBatch) return;
    if (!batchForm.initials || batchForm.pieceCount < 1) {
      alert('Please enter initials and at least 1 piece.');
      return;
    }
    setBatchUploading(true);
    try {
      await api.put(`/pieces/batches/${selectedBatch.id}`, {
        pieceCount: batchForm.pieceCount,
        initials: batchForm.initials,
        notes: batchForm.notes,
        photoUrls: batchForm.photos,
      });
      closeBatchEdit();
      await fetchFiringBatches();
    } catch (err) {
      console.error('Failed to save batch:', err);
      alert(`Failed to save: ${err.response?.data?.error || err.message}`);
    } finally {
      setBatchUploading(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (!selectedBatch) return;
    if (!confirm('Delete this batch? This cannot be undone.')) return;
    setBatchUploading(true);
    try {
      await api.delete(`/pieces/batches/${selectedBatch.id}`);
      closeBatchEdit();
      await fetchFiringBatches();
    } catch (err) {
      console.error('Failed to delete batch:', err);
      alert(`Failed to delete: ${err.response?.data?.error || err.message}`);
    } finally {
      setBatchUploading(false);
    }
  };

  const selectPiece = (piece) => {
    setSelectedPiece(piece);
    setEditImageFiles([]);
    setEditImagePreviewUrls([]);
    setFormData({
      title: piece.title || '',
      clay_type: piece.clay_type || '',
      date_completed: piece.date_completed || '',
      glazes: piece.glazes || [],
      height: piece.height || '',
      width: piece.width || '',
      length: piece.length || '',
      original_weight: piece.original_weight || '',
      final_weight: piece.final_weight || '',
      description: piece.description || '',
      tags: piece.tags || [],
      is_public: piece.is_public || false,
      images: piece.images || []
    });
  };

  const closePieceDetail = () => {
    setSelectedPiece(null);
  };

  const openEditModal = () => {
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setSelectedPiece(null);
    setEditImageFiles([]);
    setEditImagePreviewUrls([]);
  };

  const toggleGlaze = (glazeName) => {
    setFormData(prev => ({
      ...prev,
      glazes: prev.glazes.includes(glazeName)
        ? prev.glazes.filter(g => g !== glazeName)
        : [...prev.glazes, glazeName]
    }));
  };

  const addTag = (tag) => {
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, tag] }));
    }
  };

  const removeTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleEditImageSelect = (e) => {
    const files = Array.from(e.target.files);
    const currentImageCount = selectedPiece?.images?.length || 0;
    const totalImages = currentImageCount + files.length;
    if (totalImages > 3) {
      alert(`You can only have a maximum of 3 images. You currently have ${currentImageCount} image(s).`);
      return;
    }
    setEditImageFiles(files);
    setEditImagePreviewUrls(files.map(file => URL.createObjectURL(file)));
  };

  const handleSaveChanges = async () => {
    if (!selectedPiece) return;
    try {
      setUploading(true);
      let newImageUrls = [];
      if (editImageFiles.length > 0) {
        const uploadFormData = new FormData();
        editImageFiles.forEach(file => uploadFormData.append('images', file));
        const uploadRes = await api.post('/upload/images', uploadFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        newImageUrls = uploadRes.data.images.map(img => img.url);
      }
      const allImages = [...(selectedPiece.images || []), ...newImageUrls].slice(0, 3);
      const updateData = {
        title: formData.title,
        clay_type: formData.clay_type,
        date_completed: formData.date_completed,
        glazes: formData.glazes,
        height: formData.height || null,
        width: formData.width || null,
        length: formData.length || null,
        original_weight: formData.original_weight || null,
        final_weight: formData.final_weight || null,
        description: formData.description || '',
        tags: formData.tags,
        is_public: formData.is_public,
        images: allImages
      };
      await api.put(`/pottery/pieces/${selectedPiece.id}`, updateData);
      closeEditModal();
      await fetchPieces();
      alert('Changes saved successfully!');
    } catch (error) {
      console.error('Error saving changes:', error);
      alert(`Failed to save changes: ${error.response?.data?.error || error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePiece = async () => {
    if (!selectedPiece) return;
    if (!confirm(`Are you sure you want to delete "${selectedPiece.title}"? This action cannot be undone.`)) return;
    try {
      setUploading(true);
      await api.delete(`/pottery/pieces/${selectedPiece.id}`);
      closeEditModal();
      closePieceDetail();
      await fetchPieces();
      alert('Piece deleted successfully!');
    } catch (error) {
      console.error('Error deleting piece:', error);
      alert(`Failed to delete piece: ${error.response?.data?.error || error.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Toggle is_public on the server and reflect locally
  const handleTogglePublic = async (piece) => {
    try {
      const newValue = !piece.is_public;
      await api.put(`/pottery/pieces/${piece.id}`, {
        ...piece,
        is_public: newValue
      });
      // Update local state
      setPieces(prev => prev.map(p => p.id === piece.id ? { ...p, is_public: newValue } : p));
      if (selectedPiece && selectedPiece.id === piece.id) {
        setSelectedPiece(prev => ({ ...prev, is_public: newValue }));
        setFormData(prev => ({ ...prev, is_public: newValue }));
      }
    } catch (error) {
      console.error('Error toggling public:', error);
      alert(`Failed to update sharing: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleRemoveImage = (indexToRemove) => {
    if (!selectedPiece) return;
    const updatedImages = selectedPiece.images.filter((_, index) => index !== indexToRemove);
    setSelectedPiece({ ...selectedPiece, images: updatedImages });
    setFormData({ ...formData, images: updatedImages });
  };

  const filteredPieces = pieces.filter(piece => {
    const matchesClayType = !filterClayType || piece.clay_type === filterClayType;
    const matchesGlaze = !filterGlaze || (piece.glazes && piece.glazes.includes(filterGlaze));
    return matchesClayType && matchesGlaze;
  });

  // ─── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '32px', height: '32px', border: `3px solid ${RULE}`, borderTopColor: TC,
            borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px'
          }} />
          <div style={{ fontSize: '13px', color: MUTED }}>Loading…</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ─── Helper: format date ──────────────────────────────────────────────────
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>

      <ImpersonationBanner />

      {/* TOP BAR */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES"
            style={{ height: '26px', width: 'auto' }}
          />
        </div>
      </header>

      <main style={{ maxWidth: '520px', margin: '0 auto', padding: '0 0 88px' }}>

        {/* PAGE HEADER */}
        <div style={{ padding: '28px 20px 0', borderBottom: `1px solid ${RULE}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: '0 0 4px' }}>Gallery</h1>
              <div style={{ fontSize: '13px', color: MUTED }}>{pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'}</div>
            </div>
          </div>

          {/* SUB-TABS */}
          <div style={{ display: 'flex' }}>
            {[{ id: 'mine', label: 'My Work' }, { id: 'community', label: 'Community' }].map(t => (
              <button
                key={t.id}
                onClick={() => setGalleryTab(t.id)}
                style={{
                  flex: 1, padding: '10px', border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: galleryTab === t.id ? INK : MUTED,
                  borderBottom: `2px solid ${galleryTab === t.id ? INK : 'transparent'}`,
                  transition: 'all 0.15s ease',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* MY WORK TAB */}
        {galleryTab === 'mine' && (
          <div style={{ padding: '16px 20px' }}>

            {/* FIRING PIPELINE */}
            {firingBatches.length > 0 && (
              <div ref={firingSectionRef} style={{ marginBottom: 20, scrollMarginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>
                  In Progress
                </div>
                {firingBatches.map(batch => {
                  const firstReadyId = firingBatches.find(b => b.status === 'ready')?.id;
                  const statusMap = {
                    logged: { label: 'Drying', color: MUTED },
                    bisque_fired: { label: 'Bisque Fired', color: MUTED },
                    glaze_fired: { label: 'Glaze Firing', color: '#E65100' },
                    ready: { label: 'Ready!', color: '#2D8C4E' },
                    collecting: { label: 'Collecting', color: '#2D8C4E' },
                    in_cabinet: { label: 'In Cabinet', color: '#2D8C4E' },
                    delivering: { label: 'To Deliver', color: TC },
                    shipped: { label: 'On Its Way', color: TC },
                  };
                  const st = statusMap[batch.status] || statusMap.logged;
                  const isReady = batch.status === 'ready';
                  const photoUrl = batch.photo_urls?.[0];
                  const courseName = batch.course_enrollments?.course_title || batch.course_enrollments?.course_variant_title || 'Course';

                  return (
                    <div
                      key={batch.id}
                      onClick={() => openBatchEdit(batch)}
                      style={{
                        display: 'flex', gap: 12, padding: '12px 0',
                        borderBottom: `1px solid ${RULE}`, cursor: 'pointer',
                      }}
                    >
                      {/* Thumbnail */}
                      <div style={{ width: 56, height: 56, flexShrink: 0, backgroundColor: ALT, overflow: 'hidden' }}>
                        {photoUrl ? (
                          <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: MUTED }}>local_fire_department</span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{courseName}</div>
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                            color: st.color, padding: '2px 6px', border: `1px solid ${st.color}`,
                          }}>{st.label}</span>
                        </div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                          {batch.piece_count} piece{batch.piece_count !== 1 ? 's' : ''} · {batch.initials}
                        </div>

                        {/* Collect (with date) / Deliver buttons */}
                        {isReady && (
                          <div style={{ marginTop: 8 }}>
                            {intentHighlight === 'deliver' && (
                              <div style={{ fontSize: 10, color: TC, fontWeight: 700, marginBottom: 4 }}>
                                You chose delivery — confirm below to arrange it.
                              </div>
                            )}
                            <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>
                              Pick a collection date (at least 2 days from today)
                            </div>
                            <input
                              type="date"
                              autoFocus={intentHighlight === 'collect' && batch.id === firstReadyId}
                              min={minCollectionDate()}
                              value={collectionDates[batch.id] || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => { e.stopPropagation(); setCollectionDates(prev => ({ ...prev, [batch.id]: e.target.value })); }}
                              style={{ padding: '4px 6px', border: `1px solid ${RULE}`, fontSize: 11, marginBottom: 6, width: '100%', boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeliveryChoice(batch.id, 'collect'); }}
                                disabled={!collectionDates[batch.id]}
                                style={{
                                  padding: '5px 12px',
                                  background: collectionDates[batch.id] ? '#2D8C4E' : '#ccc',
                                  color: 'white', border: 'none',
                                  fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                                  cursor: collectionDates[batch.id] ? 'pointer' : 'not-allowed',
                                }}
                              >Collect</button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeliveryChoice(batch.id, 'deliver'); }}
                                style={{
                                  padding: '5px 12px',
                                  background: intentHighlight === 'deliver' ? TC : 'transparent',
                                  color: intentHighlight === 'deliver' ? '#fff' : TC,
                                  border: `1px solid ${TC}`,
                                  fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer',
                                }}
                              >Deliver ($10)</button>
                            </div>
                          </div>
                        )}
                        {batch.status === 'collecting' && (
                          <div style={{ fontSize: 11, color: '#2D8C4E', fontWeight: 600, marginTop: 4 }}>
                            {batch.collection_date
                              ? `Collecting ${new Date(batch.collection_date).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}`
                              : 'Come visit the studio to collect'}
                          </div>
                        )}
                        {batch.status === 'in_cabinet' && (
                          <div style={{ fontSize: 11, color: '#2D8C4E', fontWeight: 600, marginTop: 4 }}>
                            Out in the cabinet — come pick {batch.piece_count !== 1 ? 'them' : 'it'} up
                          </div>
                        )}
                        {batch.status === 'delivering' && (
                          <div style={{ fontSize: 11, color: TC, fontWeight: 600, marginTop: 4 }}>
                            Delivery arranged ($10) — we&rsquo;ll send tracking when it goes out
                          </div>
                        )}
                        {batch.status === 'shipped' && (
                          <div style={{ fontSize: 11, color: TC, fontWeight: 600, marginTop: 4 }}>
                            {batch.tracking_number
                              ? <>Sent{batch.tracking_carrier ? ` via ${batch.tracking_carrier}` : ''} · <span style={{ fontFamily: 'monospace' }}>{batch.tracking_number}</span></>
                              : 'On its way to you'}
                          </div>
                        )}
                        {Number(batch.delivery_fee_outstanding) > 0 && (
                          <PayNowBox batch={batch} paynow={paynow} onUploaded={fetchFiringBatches} />
                        )}
                        {batch.payment_confirmed_at && (
                          <div style={{ fontSize: 11, color: '#2D8C4E', fontWeight: 600, marginTop: 4 }}>
                            Delivery fee received — thank you
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* FINISHED WORKS */}
            {filteredPieces.length > 0 && firingBatches.length > 0 && (
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>
                Finished Works
              </div>
            )}

            {/* Action Buttons — always visible */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button
                onClick={() => navigate('/upload?type=firing')}
                style={{
                  flex: 1, padding: '14px 12px', border: 'none', borderRadius: '10px', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                  fontFamily: 'inherit', background: TC, color: '#fff',
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.7 }}>Step 1</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>local_fire_department</span>
                  Log for Firing
                </span>
              </button>
              <button
                onClick={() => navigate('/upload?type=finished')}
                style={{
                  flex: 1, padding: '14px 12px', border: 'none', borderRadius: '10px', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                  fontFamily: 'inherit', background: '#fff', color: TC,
                  boxShadow: `inset 0 0 0 1px ${TC}`,
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.7 }}>Step 2</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>photo_library</span>
                  Upload Finished Work
                </span>
              </button>
            </div>

            {filteredPieces.length === 0 && firingBatches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '48px', color: RULE, display: 'block', marginBottom: '12px' }}>photo_library</span>
                <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>No pieces yet</div>
                <div style={{ fontSize: '13px', color: MUTED }}>Log your pieces for firing after glazing</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                {filteredPieces.map(piece => (
                  <div
                    key={piece.id}
                    onClick={() => selectPiece(piece)}
                    style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', backgroundColor: '#F0EDE9', cursor: 'pointer' }}
                  >
                    {piece.images?.[0] ? (
                      <img
                        src={piece.images[0]}
                        alt={piece.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                      />
                    ) : null}
                    <div style={{ width: '100%', height: '100%', display: piece.images?.[0] ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '28px', color: MUTED }}>image_not_supported</span>
                    </div>
                    {/* Public indicator badge */}
                    {piece.is_public && (
                      <div style={{
                        position: 'absolute', top: '6px', right: '6px',
                        backgroundColor: TC, width: '18px', height: '18px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '11px', color: '#FFF', fontVariationSettings: "'FILL' 1" }}>visibility</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* COMMUNITY TAB */}
        {galleryTab === 'community' && (
          <div style={{ padding: '20px' }}>
            <p style={{ fontSize: '13px', color: MUTED, marginBottom: '18px', lineHeight: 1.5 }}>
              Get inspired by what your fellow potters are making.
            </p>
            {communityPieces.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '48px', color: RULE, display: 'block', marginBottom: '12px' }}>groups</span>
                <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Nothing shared yet</div>
                <div style={{ fontSize: '13px', color: MUTED }}>Be the first to share a piece with the community!</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {communityPieces.map(p => (
                  <div
                    key={p.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedPiece({ ...p, isCommunity: true })}
                  >
                    <div style={{ aspectRatio: '1', overflow: 'hidden', backgroundColor: '#F0EDE9', marginBottom: '8px' }}>
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '28px', color: MUTED }}>image_not_supported</span>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '1px' }}>{p.title}</div>
                    <div style={{ fontSize: '11px', color: MUTED }}>
                      by {p.student_name || p.user?.name || 'Student'} · {p.clay_type || ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* BATCH EDIT BOTTOM SHEET */}
      {selectedBatch && (() => {
        const canEdit = selectedBatch.status === 'logged';
        const canDelete = selectedBatch.status === 'logged';
        return (
          <>
            <div
              onClick={closeBatchEdit}
              style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 70 }}
            />
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 71,
              backgroundColor: '#FFFFFF', maxWidth: '520px', margin: '0 auto',
              maxHeight: '90vh', overflowY: 'auto',
              borderTopLeftRadius: '16px', borderTopRightRadius: '16px',
            }}>
              {/* Sticky header */}
              <div style={{
                position: 'sticky', top: 0, backgroundColor: '#FFFFFF',
                borderBottom: `1px solid ${RULE}`, padding: '16px 20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {canEdit ? 'Edit Batch' : 'Batch Details'}
                </div>
                <button onClick={closeBatchEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: MUTED }}>close</span>
                </button>
              </div>

              <div style={{ padding: 20 }}>
                {!canEdit && (
                  <div style={{
                    padding: 12, backgroundColor: ALT, border: `1px solid ${RULE}`,
                    fontSize: 12, color: MUTED, marginBottom: 16, lineHeight: 1.5,
                  }}>
                    This batch is already in the firing pipeline, so it can't be edited or deleted.
                    Need a change? Ask the studio.
                  </div>
                )}

                {/* Photos */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>
                    Photos ({batchForm.photos.length})
                  </div>
                  {batchForm.photos.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                      {batchForm.photos.map((url, i) => (
                        <div key={i} style={{ position: 'relative' }}>
                          <img src={url} alt={`Batch ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                          {canEdit && (
                            <button
                              onClick={() => removeBatchPhoto(i)}
                              style={{
                                position: 'absolute', top: 4, right: 4,
                                width: 22, height: 22, borderRadius: '50%',
                                backgroundColor: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#FFF' }}>close</span>
                            </button>
                          )}
                          <button
                            onClick={() => downloadImage(url, `batch-${selectedBatch.id}-photo-${i + 1}`)}
                            style={{
                              position: 'absolute', bottom: 4, right: 4,
                              width: 22, height: 22, borderRadius: '50%',
                              backgroundColor: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            title="Download photo"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#FFF' }}>download</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <>
                      <input
                        type="file" accept="image/*" capture="environment" multiple
                        onChange={handleBatchPhotoUpload}
                        disabled={batchUploading}
                        id="batch-photo-camera"
                        style={{ display: 'none' }}
                      />
                      <input
                        type="file" accept="image/*" multiple
                        onChange={handleBatchPhotoUpload}
                        disabled={batchUploading}
                        id="batch-photo-library"
                        style={{ display: 'none' }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <label htmlFor="batch-photo-camera" style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          border: `1px dashed ${RULE}`, padding: 14,
                          cursor: batchUploading ? 'wait' : 'pointer', backgroundColor: ALT,
                          fontSize: 12, color: MUTED, fontWeight: 600,
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>photo_camera</span>
                          {batchUploading ? 'Uploading…' : 'Take Photo'}
                        </label>
                        <label htmlFor="batch-photo-library" style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          border: `1px dashed ${RULE}`, padding: 14,
                          cursor: batchUploading ? 'wait' : 'pointer', backgroundColor: ALT,
                          fontSize: 12, color: MUTED, fontWeight: 600,
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>photo_library</span>
                          Choose from Library
                        </label>
                      </div>
                    </>
                  )}
                </div>

                {/* Piece count */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>
                    Piece count
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      onClick={() => setBatchForm(f => ({ ...f, pieceCount: Math.max(1, f.pieceCount - 1) }))}
                      disabled={!canEdit}
                      style={{ width: 36, height: 36, borderRadius: '50%', border: `1px solid ${RULE}`, background: '#fff', fontSize: 18, cursor: canEdit ? 'pointer' : 'not-allowed', opacity: canEdit ? 1 : 0.5 }}
                    >−</button>
                    <span style={{ fontSize: 22, fontWeight: 700, color: TC, minWidth: 30, textAlign: 'center' }}>
                      {batchForm.pieceCount}
                    </span>
                    <button
                      onClick={() => setBatchForm(f => ({ ...f, pieceCount: f.pieceCount + 1 }))}
                      disabled={!canEdit}
                      style={{ width: 36, height: 36, borderRadius: '50%', border: `1px solid ${RULE}`, background: '#fff', fontSize: 18, cursor: canEdit ? 'pointer' : 'not-allowed', opacity: canEdit ? 1 : 0.5 }}
                    >+</button>
                  </div>
                </div>

                {/* Initials */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>
                    Your mark
                  </label>
                  <input
                    type="text"
                    value={batchForm.initials}
                    onChange={e => setBatchForm(f => ({ ...f, initials: e.target.value.toUpperCase() }))}
                    disabled={!canEdit}
                    maxLength={10}
                    style={{
                      width: 120, padding: 10, border: `1px solid ${RULE}`, backgroundColor: ALT,
                      fontSize: 18, textAlign: 'center', letterSpacing: 4, fontWeight: 600,
                      boxSizing: 'border-box', outline: 'none',
                    }}
                  />
                </div>

                {/* Notes */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>
                    Notes
                  </label>
                  <textarea
                    rows={3}
                    value={batchForm.notes}
                    onChange={e => setBatchForm(f => ({ ...f, notes: e.target.value }))}
                    disabled={!canEdit}
                    placeholder="e.g. 3 bowls, 2 mugs, 2 plates"
                    style={{
                      width: '100%', padding: 10, border: `1px solid ${RULE}`, backgroundColor: ALT,
                      fontSize: 14, boxSizing: 'border-box', outline: 'none', resize: 'vertical',
                    }}
                  />
                </div>
              </div>

              {/* Sticky footer */}
              {(canEdit || canDelete) && (
                <div style={{
                  position: 'sticky', bottom: 0, backgroundColor: '#FFFFFF',
                  borderTop: `1px solid ${RULE}`, padding: '16px 20px',
                  display: 'flex', gap: 8,
                }}>
                  {canDelete && (
                    <button
                      onClick={handleDeleteBatch}
                      disabled={batchUploading}
                      style={{
                        padding: '12px 16px', border: '1px solid rgba(200,50,50,0.3)', backgroundColor: 'transparent',
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                        cursor: batchUploading ? 'not-allowed' : 'pointer', color: '#C03030', opacity: batchUploading ? 0.5 : 1,
                      }}
                    >Delete</button>
                  )}
                  <button
                    onClick={closeBatchEdit}
                    style={{
                      flex: 1, padding: 12, border: `1px solid ${RULE}`, backgroundColor: 'transparent',
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      cursor: 'pointer', color: MUTED,
                    }}
                  >Cancel</button>
                  {canEdit && (
                    <button
                      onClick={handleSaveBatch}
                      disabled={batchUploading || !batchForm.initials || batchForm.pieceCount < 1}
                      style={{
                        flex: 2, padding: 12, border: 'none', backgroundColor: TC, color: '#FFF',
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                        cursor: batchUploading ? 'not-allowed' : 'pointer',
                        opacity: (batchUploading || !batchForm.initials || batchForm.pieceCount < 1) ? 0.5 : 1,
                      }}
                    >
                      {batchUploading ? 'Saving…' : 'Save Changes'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* PIECE DETAIL BOTTOM SHEET */}
      {selectedPiece && !showEditModal && (
        <>
          {/* Backdrop */}
          <div
            onClick={closePieceDetail}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 60 }}
          />
          {/* Sheet */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61,
            backgroundColor: '#FFFFFF',
            maxWidth: '520px', margin: '0 auto',
            maxHeight: '85vh', overflowY: 'auto',
          }}>
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: '36px', height: '3px', backgroundColor: RULE }} />
            </div>

            {/* Image */}
            <div style={{ aspectRatio: '1', overflow: 'hidden', backgroundColor: '#F0EDE9', margin: '12px 0 0', position: 'relative' }}>
              {selectedPiece.images?.[0] ? (
                <>
                  <img
                    src={selectedPiece.images[0]}
                    alt={selectedPiece.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  <button
                    onClick={() => downloadImage(
                      selectedPiece.images[0],
                      `${(selectedPiece.title || 'piece').replace(/[^a-z0-9-_]+/gi, '-')}`
                    )}
                    style={{
                      position: 'absolute', bottom: 12, right: 12,
                      padding: '8px 14px', backgroundColor: 'rgba(0,0,0,0.65)', color: '#FFF',
                      border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    title="Save photo to device"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
                    Save Photo
                  </button>
                </>
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '48px', color: MUTED }}>image_not_supported</span>
                </div>
              )}
            </div>

            <div style={{ padding: '20px 20px 40px' }}>
              {/* Title row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '2px' }}>{selectedPiece.title}</div>
                  {selectedPiece.isCommunity
                    ? <div style={{ fontSize: '13px', color: MUTED }}>by {selectedPiece.student_name || selectedPiece.user?.name || 'Student'}</div>
                    : <div style={{ fontSize: '13px', color: MUTED }}>{selectedPiece.clay_type}{selectedPiece.date_completed ? ` · ${formatDate(selectedPiece.date_completed)}` : ''}</div>
                  }
                </div>
                <button
                  onClick={closePieceDetail}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px', color: MUTED }}>close</span>
                </button>
              </div>

              {/* Meta tags row */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {[
                  selectedPiece.clay_type,
                  ...(selectedPiece.glazes || []),
                  selectedPiece.date_completed ? formatDate(selectedPiece.date_completed) : null,
                ].filter(Boolean).map((tag, i) => (
                  <span key={i} style={{
                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    padding: '4px 8px', backgroundColor: ALT, color: MUTED,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>

              {/* Share toggle (own pieces only) */}
              {!selectedPiece.isCommunity && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px', border: `1px solid ${RULE}`, backgroundColor: ALT, marginBottom: '0',
                }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '2px' }}>Share with community</div>
                    <div style={{ fontSize: '11px', color: MUTED }}>Visible to other VES students for inspiration</div>
                  </div>
                  {/* Toggle */}
                  <button
                    onClick={() => handleTogglePublic(selectedPiece)}
                    style={{
                      width: '44px', height: '24px',
                      backgroundColor: selectedPiece.is_public ? TC : '#DDD',
                      borderRadius: '12px', border: 'none', cursor: 'pointer',
                      position: 'relative', transition: 'background-color 0.2s ease', flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '3px',
                      left: selectedPiece.is_public ? '23px' : '3px',
                      width: '18px', height: '18px', borderRadius: '50%',
                      backgroundColor: '#FFF', transition: 'left 0.2s ease',
                    }} />
                  </button>
                </div>
              )}

              {/* Edit / Delete actions (own pieces only) */}
              {!selectedPiece.isCommunity && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <button
                    onClick={openEditModal}
                    style={{
                      flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent',
                      fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      cursor: 'pointer', color: MUTED,
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleDeletePiece}
                    disabled={uploading}
                    style={{
                      flex: 1, padding: '12px', border: '1px solid rgba(200,50,50,0.3)', backgroundColor: 'transparent',
                      fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      cursor: uploading ? 'not-allowed' : 'pointer', color: '#C03030',
                      opacity: uploading ? 0.5 : 1,
                    }}
                  >
                    {uploading ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* EDIT MODAL */}
      {showEditModal && selectedPiece && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 80,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: '#FFFFFF', width: '100%', maxWidth: '520px',
            maxHeight: '92vh', overflowY: 'auto',
            borderTopLeftRadius: '16px', borderTopRightRadius: '16px',
          }}>
            {/* Header */}
            <div style={{
              position: 'sticky', top: 0, backgroundColor: '#FFFFFF',
              borderBottom: `1px solid ${RULE}`, padding: '20px 20px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>Edit Piece</div>
              <button onClick={closeEditModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: MUTED }}>close</span>
              </button>
            </div>

            <div style={{ padding: '20px' }}>

              {/* Current images */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '10px' }}>
                  Images ({selectedPiece.images?.length || 0}/3)
                </div>
                {selectedPiece.images && selectedPiece.images.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    {selectedPiece.images.map((image, index) => (
                      <div key={index} style={{ position: 'relative' }}>
                        <img src={image} alt={`Image ${index + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                        <button
                          onClick={() => handleRemoveImage(index)}
                          style={{
                            position: 'absolute', top: '4px', right: '4px',
                            backgroundColor: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer',
                            width: '22px', height: '22px', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '13px', color: '#FFF' }}>close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: MUTED }}>No images yet</div>
                )}
              </div>

              {/* Add more images */}
              {(selectedPiece.images?.length || 0) < 3 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '10px' }}>
                    Add Images (up to {3 - (selectedPiece.images?.length || 0)} more)
                  </div>
                  <input
                    type="file" multiple accept="image/*" capture="environment"
                    onChange={handleEditImageSelect}
                    id="edit-image-camera"
                    style={{ display: 'none' }}
                  />
                  <input
                    type="file" multiple accept="image/*"
                    onChange={handleEditImageSelect}
                    id="edit-image-library"
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label htmlFor="edit-image-camera" style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      border: `1px dashed ${RULE}`, padding: 16, cursor: 'pointer', backgroundColor: ALT,
                      fontSize: 12, color: MUTED, fontWeight: 600,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>photo_camera</span>
                      Take Photo
                    </label>
                    <label htmlFor="edit-image-library" style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      border: `1px dashed ${RULE}`, padding: 16, cursor: 'pointer', backgroundColor: ALT,
                      fontSize: 12, color: MUTED, fontWeight: 600,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>photo_library</span>
                      Choose from Library
                    </label>
                  </div>
                  {editImagePreviewUrls.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '8px' }}>
                      {editImagePreviewUrls.map((url, index) => (
                        <img key={index} src={url} alt={`Preview ${index + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Title */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '6px' }}>Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, backgroundColor: ALT,
                    fontSize: '14px', color: INK, boxSizing: 'border-box', outline: 'none',
                  }}
                />
              </div>

              {/* Clay Type */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '6px' }}>Clay Type *</label>
                <select
                  value={formData.clay_type}
                  onChange={(e) => setFormData({ ...formData, clay_type: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, backgroundColor: ALT,
                    fontSize: '14px', color: INK, boxSizing: 'border-box', outline: 'none', appearance: 'auto',
                  }}
                >
                  <option value="">Select clay type</option>
                  {clayTypes.map(type => (
                    <option key={type.id} value={type.name}>{type.name}</option>
                  ))}
                </select>
              </div>

              {/* Date Completed */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '6px' }}>Date Completed *</label>
                <input
                  type="date"
                  value={formData.date_completed}
                  onChange={(e) => setFormData({ ...formData, date_completed: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, backgroundColor: ALT,
                    fontSize: '14px', color: INK, boxSizing: 'border-box', outline: 'none',
                  }}
                />
              </div>

              {/* Glazes */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '6px' }}>Glazes</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', maxHeight: '160px', overflowY: 'auto', padding: '8px', backgroundColor: ALT, border: `1px solid ${RULE}` }}>
                  {glazes.map(glaze => (
                    <label key={glaze.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 0' }}>
                      <input
                        type="checkbox"
                        checked={formData.glazes.includes(glaze.name)}
                        onChange={() => toggleGlaze(glaze.name)}
                        style={{ accentColor: TC }}
                      />
                      <span style={{ fontSize: '13px' }}>{glaze.name}</span>
                    </label>
                  ))}
                </div>
                {formData.glazes.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {formData.glazes.map(glaze => (
                      <span key={glaze} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '3px 8px', backgroundColor: TC_LIGHT, color: TC_DARK,
                        fontSize: '11px', fontWeight: 700,
                      }}>
                        {glaze}
                        <button onClick={() => toggleGlaze(glaze)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', lineHeight: 1, color: TC_DARK }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '6px' }}>Notes</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Add notes about your piece…"
                  style={{
                    width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, backgroundColor: ALT,
                    fontSize: '14px', color: INK, boxSizing: 'border-box', outline: 'none', resize: 'vertical',
                  }}
                />
              </div>

              {/* Public toggle */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px', border: `1px solid ${RULE}`, backgroundColor: ALT,
                marginBottom: '24px',
              }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '2px' }}>Share with community</div>
                  <div style={{ fontSize: '11px', color: MUTED }}>Visible to other VES students for inspiration</div>
                </div>
                <button
                  onClick={() => setFormData(prev => ({ ...prev, is_public: !prev.is_public }))}
                  style={{
                    width: '44px', height: '24px',
                    backgroundColor: formData.is_public ? TC : '#DDD',
                    borderRadius: '12px', border: 'none', cursor: 'pointer',
                    position: 'relative', transition: 'background-color 0.2s ease', flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: '3px',
                    left: formData.is_public ? '23px' : '3px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    backgroundColor: '#FFF', transition: 'left 0.2s ease',
                  }} />
                </button>
              </div>
            </div>

            {/* Footer buttons */}
            <div style={{
              position: 'sticky', bottom: 0, backgroundColor: '#FFFFFF',
              borderTop: `1px solid ${RULE}`, padding: '16px 20px',
              display: 'flex', gap: '8px',
            }}>
              <button
                onClick={handleDeletePiece}
                disabled={uploading}
                style={{
                  padding: '12px 16px', border: '1px solid rgba(200,50,50,0.3)', backgroundColor: 'transparent',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  cursor: uploading ? 'not-allowed' : 'pointer', color: '#C03030', opacity: uploading ? 0.5 : 1,
                }}
              >
                Delete
              </button>
              <button
                onClick={closeEditModal}
                style={{
                  flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  cursor: 'pointer', color: MUTED,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChanges}
                disabled={uploading || !formData.title || !formData.clay_type || !formData.date_completed}
                style={{
                  flex: 2, padding: '12px', border: 'none', backgroundColor: TC, color: '#FFF',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  cursor: (uploading || !formData.title || !formData.clay_type || !formData.date_completed) ? 'not-allowed' : 'pointer',
                  opacity: (uploading || !formData.title || !formData.clay_type || !formData.date_completed) ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}
              >
                {uploading && (
                  <span style={{
                    display: 'inline-block', width: '14px', height: '14px',
                    border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FFF',
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                  }} />
                )}
                {uploading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
