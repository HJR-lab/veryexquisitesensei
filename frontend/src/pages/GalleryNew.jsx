import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function GalleryNew() {
  const navigate = useNavigate();
  const { user } = useAuth();

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
            <button
              onClick={() => navigate('/upload')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 14px', border: 'none', backgroundColor: TC, color: '#FFF',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add_photo_alternate</span>
              Upload
            </button>
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
            {filteredPieces.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '48px', color: RULE, display: 'block', marginBottom: '12px' }}>photo_library</span>
                <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>No pieces yet</div>
                <div style={{ fontSize: '13px', color: MUTED, marginBottom: '20px' }}>Start building your gallery by uploading your first piece</div>
                <button
                  onClick={() => navigate('/upload')}
                  style={{
                    padding: '10px 20px', backgroundColor: TC, color: '#FFF', border: 'none',
                    fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  Upload First Piece
                </button>
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
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '28px', color: MUTED }}>image_not_supported</span>
                      </div>
                    )}
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
            <div style={{ aspectRatio: '1', overflow: 'hidden', backgroundColor: '#F0EDE9', margin: '12px 0 0' }}>
              {selectedPiece.images?.[0] ? (
                <img
                  src={selectedPiece.images[0]}
                  alt={selectedPiece.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
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
                    type="file"
                    multiple
                    accept="image/*"
                    capture="environment"
                    onChange={handleEditImageSelect}
                    id="edit-image-upload"
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="edit-image-upload" style={{
                    display: 'block', border: `1px dashed ${RULE}`, padding: '20px',
                    textAlign: 'center', cursor: 'pointer', backgroundColor: ALT,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '28px', color: MUTED, display: 'block', marginBottom: '6px' }}>add_photo_alternate</span>
                    <div style={{ fontSize: '12px', color: MUTED }}>Tap to add photos</div>
                  </label>
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

      {/* BOTTOM TAB BAR */}
      <BottomNav />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function BottomNav() {
  const tabs = [
    { id: 'home',    label: 'Home',    icon: 'home',           href: '/dashboard' },
    { id: 'classes', label: 'Classes', icon: 'calendar_month', href: '/classes' },
    { id: 'studio',  label: 'Studio',  icon: 'door_open',      href: '/studio-access' },
    { id: 'gallery', label: 'Gallery', icon: 'photo_library',  href: '/gallery' },
    { id: 'account', label: 'Account', icon: 'person',         href: '/account' },
  ];
  const active = 'gallery';
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      backgroundColor: '#FFFFFF', borderTop: `1px solid ${RULE}`,
      display: 'flex', height: '60px', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <a
            key={tab.id}
            href={tab.href}
            style={{
              flex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '2px', padding: '8px 0', position: 'relative', textDecoration: 'none',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '22px',
                color: isActive ? TC : '#BBBBBB',
                fontVariationSettings: isActive ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
              }}
            >
              {tab.icon}
            </span>
            <span style={{
              fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: isActive ? TC : '#BBBBBB',
            }}>
              {tab.label}
            </span>
            {isActive && (
              <span style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: '20px', height: '2px', backgroundColor: TC,
              }} />
            )}
          </a>
        );
      })}
    </nav>
  );
}
