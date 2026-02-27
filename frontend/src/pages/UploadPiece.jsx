import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

/* ─── VES palette ─── */
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const BG       = '#F5F3F0';

export default function UploadPiece() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    title: '',
    dateCompleted: new Date().toISOString().split('T')[0],
    notes: '',
    clayType: '',
    glazes: [],
    tags: [],
    height: '',
    width: '',
    length: '',
    isPublic: false
  });

  const [images, setImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [clayTypes, setClayTypes] = useState([]);
  const [availableGlazes, setAvailableGlazes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDimensions, setShowDimensions] = useState(false);

  useEffect(() => { loadReferenceData(); }, []);

  const loadReferenceData = async () => {
    try {
      const [clayResponse, glazeResponse] = await Promise.all([
        api.get('/reference/clay-types'),
        api.get('/reference/glazes')
      ]);
      setClayTypes(clayResponse.data.clayTypes || []);
      setAvailableGlazes(glazeResponse.data.glazes || []);
      if (clayResponse.data.clayTypes?.length > 0) {
        setFormData(prev => ({ ...prev, clayType: clayResponse.data.clayTypes[0].name }));
      }
    } catch (err) {
      console.error('Error loading reference data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length + images.length > 5) { setError('Maximum 5 images allowed'); return; }
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (files.some(f => !validTypes.includes(f.type))) { setError('Only JPEG, PNG, and WebP images are allowed'); return; }
    if (files.some(f => f.size > 5 * 1024 * 1024)) { setError('Each image must be less than 5MB'); return; }
    setImages(prev => [...prev, ...files]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreviews(prev => [...prev, reader.result]);
      reader.readAsDataURL(file);
    });
    setError('');
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const toggleGlaze = (glazeName) => {
    setFormData(prev => ({
      ...prev,
      glazes: prev.glazes.includes(glazeName)
        ? prev.glazes.filter(g => g !== glazeName)
        : [...prev.glazes, glazeName]
    }));
  };

  const handleTagInput = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      e.preventDefault();
      const newTag = e.target.value.trim();
      if (!formData.tags.includes(newTag)) {
        setFormData(prev => ({ ...prev, tags: [...prev.tags, newTag] }));
      }
      e.target.value = '';
    }
  };

  const removeTag = (tagToRemove) => {
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tagToRemove) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setUploading(true);
    setUploadProgress(0);
    try {
      let imageUrls = [];
      if (images.length > 0) {
        const imageFormData = new FormData();
        images.forEach(image => imageFormData.append('images', image));
        const uploadResponse = await api.post('/upload/images', imageFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
          }
        });
        imageUrls = uploadResponse.data.images.map(img => img.url);
      }
      await api.post('/pottery/create-piece', {
        title: formData.title,
        date_completed: formData.dateCompleted,
        clay_type: formData.clayType,
        glazes: formData.glazes,
        description: formData.notes,
        height: formData.height ? parseFloat(formData.height) : null,
        width: formData.width ? parseFloat(formData.width) : null,
        length: formData.length ? parseFloat(formData.length) : null,
        images: imageUrls,
        tags: formData.tags,
        is_public: formData.isPublic
      });
      setSuccess(true);
      setTimeout(() => navigate('/gallery'), 2000);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Failed to upload pottery piece');
    } finally {
      setUploading(false);
    }
  };

  /* ─── shared input style ─── */
  const inputStyle = {
    width: '100%', padding: '12px 14px', border: `1px solid ${RULE}`,
    borderRadius: '8px', fontSize: '15px', fontFamily: 'inherit',
    background: '#fff', color: INK, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };
  const labelStyle = {
    display: 'block', fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em',
    textTransform: 'uppercase', color: MUTED, marginBottom: '6px',
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: MUTED, fontSize: '14px' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, paddingBottom: '100px' }}>

      {/* ─── Header ─── */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${RULE}`, position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '540px', margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => navigate('/gallery')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: 0, color: INK, fontSize: '14px' }}
          >
            <span style={{ fontSize: '18px', lineHeight: 1 }}>&larr;</span>
            Gallery
          </button>
          <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: TC }}>New Piece</span>
          <div style={{ width: '70px' }} />
        </div>
      </div>

      {/* ─── Success banner ─── */}
      {success && (
        <div style={{ maxWidth: '540px', margin: '16px auto 0', padding: '14px 18px', background: '#E8F5E8', borderRadius: '10px', color: '#2E7D32', fontSize: '14px', textAlign: 'center', marginLeft: '20px', marginRight: '20px' }}>
          Piece added! Redirecting to gallery...
        </div>
      )}

      {/* ─── Error banner ─── */}
      {error && (
        <div style={{ maxWidth: '540px', margin: '16px auto 0', padding: '14px 18px', background: '#FDECEC', borderRadius: '10px', color: '#C62828', fontSize: '14px', textAlign: 'center', marginLeft: '20px', marginRight: '20px' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ maxWidth: '540px', margin: '0 auto', padding: '20px 20px 0' }}>

        {/* ─── Photo Upload ─── */}
        <div style={{ marginBottom: '28px' }}>
          <input
            type="file" id="images" multiple accept="image/*" capture="environment"
            onChange={handleImageSelect} disabled={uploading || images.length >= 5}
            style={{ display: 'none' }}
          />

          {imagePreviews.length === 0 ? (
            <label htmlFor="images" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '220px', border: `2px dashed rgba(196,98,45,0.3)`, borderRadius: '16px',
              background: TC_LIGHT, cursor: images.length >= 5 ? 'not-allowed' : 'pointer',
              opacity: images.length >= 5 ? 0.5 : 1, transition: 'all 0.2s',
            }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', boxShadow: '0 2px 8px rgba(196,98,45,0.15)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '26px', color: TC }}>photo_camera</span>
              </div>
              <span style={{ fontSize: '15px', fontWeight: 600, color: TC_DARK }}>Take a Photo</span>
              <span style={{ fontSize: '12px', color: MUTED, marginTop: '4px' }}>or choose from library · up to 5</span>
            </label>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: imagePreviews.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '8px' }}>
                {imagePreviews.map((preview, index) => (
                  <div key={index} style={{
                    position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#ddd',
                    aspectRatio: imagePreviews.length === 1 ? '4/3' : '1',
                    ...(imagePreviews.length === 3 && index === 0 ? { gridColumn: '1 / -1', aspectRatio: '2/1' } : {}),
                  }}>
                    <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <button type="button" onClick={() => removeImage(index)} disabled={uploading} style={{
                      position: 'absolute', top: '8px', right: '8px', width: '28px', height: '28px',
                      borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff',
                      fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backdropFilter: 'blur(4px)',
                    }}>×</button>
                    {index === 0 && (
                      <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.5)', borderRadius: '6px', padding: '3px 8px', fontSize: '10px', color: '#fff', fontWeight: 600, letterSpacing: '0.04em', backdropFilter: 'blur(4px)' }}>COVER</div>
                    )}
                  </div>
                ))}

                {images.length < 5 && (
                  <label htmlFor="images" style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    aspectRatio: '1', borderRadius: '12px', border: `2px dashed ${RULE}`,
                    background: '#fff', cursor: 'pointer', transition: 'border-color 0.2s',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '24px', color: MUTED }}>add_photo_alternate</span>
                    <span style={{ fontSize: '11px', color: MUTED, marginTop: '4px' }}>{images.length}/5</span>
                  </label>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── Title ─── */}
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Title *</label>
          <input
            type="text" name="title" value={formData.title} onChange={handleInputChange}
            required placeholder="e.g., Blue Celadon Bowl" disabled={uploading}
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = TC}
            onBlur={e => e.target.style.borderColor = RULE}
          />
        </div>

        {/* ─── Clay + Date row ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <div>
            <label style={labelStyle}>Clay Type *</label>
            <select
              name="clayType" value={formData.clayType} onChange={handleInputChange}
              required disabled={uploading}
              style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
              onFocus={e => e.target.style.borderColor = TC}
              onBlur={e => e.target.style.borderColor = RULE}
            >
              {clayTypes.map(clay => (
                <option key={clay.id} value={clay.name}>{clay.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date Completed *</label>
            <input
              type="date" name="dateCompleted" value={formData.dateCompleted}
              onChange={handleInputChange} required disabled={uploading}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = TC}
              onBlur={e => e.target.style.borderColor = RULE}
            />
          </div>
        </div>

        {/* ─── Glazes ─── */}
        {availableGlazes.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Glazes</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {availableGlazes.map(glaze => {
                const selected = formData.glazes.includes(glaze.name);
                return (
                  <button
                    key={glaze.id} type="button" onClick={() => toggleGlaze(glaze.name)} disabled={uploading}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '7px 14px', borderRadius: '20px', fontSize: '13px', fontFamily: 'inherit',
                      cursor: 'pointer', transition: 'all 0.2s', border: 'none',
                      background: selected ? TC : '#fff',
                      color: selected ? '#fff' : INK,
                      boxShadow: selected ? 'none' : `inset 0 0 0 1px ${RULE}`,
                    }}
                  >
                    {glaze.colorHex && (
                      <span style={{
                        width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0,
                        backgroundColor: glaze.colorHex, border: `1px solid ${selected ? 'rgba(255,255,255,0.3)' : RULE}`,
                      }} />
                    )}
                    {glaze.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Notes ─── */}
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            name="notes" value={formData.notes} onChange={handleInputChange}
            rows="3" placeholder="What did you learn? What would you do differently?"
            disabled={uploading}
            style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
            onFocus={e => e.target.style.borderColor = TC}
            onBlur={e => e.target.style.borderColor = RULE}
          />
        </div>

        {/* ─── Dimensions (collapsible) ─── */}
        <div style={{ marginBottom: '20px' }}>
          <button
            type="button"
            onClick={() => setShowDimensions(!showDimensions)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em',
              textTransform: 'uppercase', color: MUTED,
            }}
          >
            Dimensions (cm)
            <span style={{ fontSize: '14px', transform: showDimensions ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>&#9662;</span>
          </button>
          {showDimensions && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '10px' }}>
              {['height', 'width', 'length'].map(dim => (
                <div key={dim}>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>{dim.charAt(0).toUpperCase() + dim.slice(1)}</label>
                  <input
                    type="number" name={dim} value={formData[dim]} onChange={handleInputChange}
                    step="0.1" placeholder="—" disabled={uploading}
                    style={{ ...inputStyle, textAlign: 'center', padding: '10px 8px' }}
                    onFocus={e => e.target.style.borderColor = TC}
                    onBlur={e => e.target.style.borderColor = RULE}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Tags ─── */}
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Tags</label>
          <input
            type="text" placeholder="Type and press Enter"
            onKeyDown={handleTagInput} disabled={uploading}
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = TC}
            onBlur={e => e.target.style.borderColor = RULE}
          />
          {formData.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {formData.tags.map(tag => (
                <span key={tag} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  padding: '4px 10px', background: TC_LIGHT, borderRadius: '14px',
                  fontSize: '12px', color: TC_DARK, fontWeight: 500,
                }}>
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} disabled={uploading} style={{
                    background: 'none', border: 'none', color: TC, cursor: 'pointer',
                    padding: 0, fontSize: '14px', lineHeight: 1, marginLeft: '2px',
                  }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ─── Share toggle ─── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', background: '#fff', borderRadius: '10px',
          border: `1px solid ${RULE}`, marginBottom: '28px',
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: INK }}>Share to Community</div>
            <div style={{ fontSize: '12px', color: MUTED, marginTop: '2px' }}>Visible in the studio gallery</div>
          </div>
          <label style={{ position: 'relative', width: '48px', height: '28px', cursor: 'pointer' }}>
            <input
              type="checkbox" name="isPublic" checked={formData.isPublic}
              onChange={handleInputChange} disabled={uploading}
              style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
            />
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '14px', transition: 'background 0.25s',
              background: formData.isPublic ? TC : '#D4D4D4',
            }}>
              <span style={{
                position: 'absolute', top: '3px', width: '22px', height: '22px', borderRadius: '50%',
                background: '#fff', transition: 'left 0.25s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                left: formData.isPublic ? '23px' : '3px',
              }} />
            </span>
          </label>
        </div>

        {/* ─── Upload progress ─── */}
        {uploading && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ height: '4px', background: RULE, borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', background: TC, borderRadius: '2px',
                width: `${uploadProgress}%`, transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ textAlign: 'center', fontSize: '12px', color: MUTED, marginTop: '8px' }}>
              Uploading... {uploadProgress}%
            </div>
          </div>
        )}

        {/* ─── Submit ─── */}
        <button
          type="submit"
          disabled={uploading || !formData.title || !formData.clayType}
          style={{
            width: '100%', padding: '16px', border: 'none', borderRadius: '12px',
            fontSize: '15px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            background: (uploading || !formData.title || !formData.clayType) ? '#D4D4D4' : TC,
            color: (uploading || !formData.title || !formData.clayType) ? MUTED : '#fff',
            transition: 'all 0.2s', letterSpacing: '0.02em',
          }}
        >
          {uploading ? 'Uploading...' : 'Add to Gallery'}
        </button>

      </form>
    </div>
  );
}
