import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/UploadPiece.css';

export default function UploadPiece() {
  const { user, logout } = useAuth();
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

  // Reference data
  const [clayTypes, setClayTypes] = useState([]);
  const [availableGlazes, setAvailableGlazes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReferenceData();
  }, []);

  const loadReferenceData = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = {
        headers: { Authorization: `Bearer ${token}` }
      };

      const [clayResponse, glazeResponse] = await Promise.all([
        axios.get('/api/reference/clay-types', config),
        axios.get('/api/reference/glazes', config)
      ]);

      setClayTypes(clayResponse.data.clayTypes || []);
      setAvailableGlazes(glazeResponse.data.glazes || []);

      // Set default clay type
      if (clayResponse.data.clayTypes && clayResponse.data.clayTypes.length > 0) {
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
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);

    if (files.length + images.length > 5) {
      setError('Maximum 5 images allowed');
      return;
    }

    // Validate file types
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const invalidFiles = files.filter(file => !validTypes.includes(file.type));

    if (invalidFiles.length > 0) {
      setError('Only JPEG, PNG, and WebP images are allowed');
      return;
    }

    // Validate file sizes (5MB each)
    const oversizedFiles = files.filter(file => file.size > 5 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      setError('Each image must be less than 5MB');
      return;
    }

    setImages(prev => [...prev, ...files]);

    // Create previews
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => [...prev, reader.result]);
      };
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
        setFormData(prev => ({
          ...prev,
          tags: [...prev.tags, newTag]
        }));
      }
      e.target.value = '';
    }
  };

  const removeTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setUploading(true);
    setUploadProgress(0);

    try {
      const token = localStorage.getItem('token');
      const config = {
        headers: {
          Authorization: `Bearer ${token}`
        }
      };

      // Step 1: Upload images
      let imageUrls = [];
      if (images.length > 0) {
        const imageFormData = new FormData();
        images.forEach(image => {
          imageFormData.append('images', image);
        });

        const uploadResponse = await axios.post('/api/upload/images', imageFormData, {
          ...config,
          headers: {
            ...config.headers,
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        });

        imageUrls = uploadResponse.data.images.map(img => img.url);
      }

      // Step 2: Create pottery piece
      const pieceData = {
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
      };

      // Add to user's pieces (this will be handled by a new endpoint)
      await axios.post('/api/pottery/create-piece', pieceData, config);

      setSuccess(true);
      setTimeout(() => {
        navigate('/gallery');
      }, 2000);

    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Failed to upload pottery piece');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="upload-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="upload-container">
      <header className="upload-header">
        <div className="header-content">
          <div>
            <button onClick={() => navigate('/gallery')} className="btn-back">
              ← Back to Gallery
            </button>
            <h1>Add New Pottery Piece</h1>
            <p className="subtitle">Document your creation</p>
          </div>
          <button onClick={logout} className="btn-logout">
            Sign Out
          </button>
        </div>
      </header>

      {success && (
        <div className="alert alert-success">
          Pottery piece uploaded successfully! Redirecting to gallery...
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="upload-form">
        {/* Image Upload Section */}
        <section className="form-section">
          <h2>Photos</h2>
          <p className="section-description">Upload up to 5 images of your piece (JPEG, PNG, or WebP, max 5MB each)</p>

          <div className="image-upload-area">
            <input
              type="file"
              id="images"
              multiple
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleImageSelect}
              disabled={uploading || images.length >= 5}
              style={{ display: 'none' }}
            />
            <label htmlFor="images" className={`upload-label ${images.length >= 5 ? 'disabled' : ''}`}>
              <span className="upload-icon">+</span>
              <span>Add Photos ({images.length}/5)</span>
            </label>
          </div>

          {imagePreviews.length > 0 && (
            <div className="image-previews">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="image-preview">
                  <img src={preview} alt={`Preview ${index + 1}`} />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="btn-remove-image"
                    disabled={uploading}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Basic Info Section */}
        <section className="form-section">
          <h2>Basic Information</h2>

          <div className="form-group">
            <label htmlFor="title">Piece Title *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              required
              placeholder="e.g., Blue Celadon Bowl"
              disabled={uploading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="dateCompleted">Date Completed *</label>
            <input
              type="date"
              id="dateCompleted"
              name="dateCompleted"
              value={formData.dateCompleted}
              onChange={handleInputChange}
              required
              disabled={uploading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes & Reflections</label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows="4"
              placeholder="What did you learn? What would you do differently?"
              disabled={uploading}
            />
          </div>
        </section>

        {/* Technical Details Section */}
        <section className="form-section">
          <h2>Technical Details</h2>

          <div className="form-group">
            <label htmlFor="clayType">Clay Type *</label>
            <select
              id="clayType"
              name="clayType"
              value={formData.clayType}
              onChange={handleInputChange}
              required
              disabled={uploading}
            >
              {clayTypes.map(clay => (
                <option key={clay.id} value={clay.name}>{clay.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Glazes</label>
            <div className="glaze-grid">
              {availableGlazes.map(glaze => (
                <button
                  key={glaze.id}
                  type="button"
                  className={`glaze-chip ${formData.glazes.includes(glaze.name) ? 'selected' : ''}`}
                  onClick={() => toggleGlaze(glaze.name)}
                  disabled={uploading}
                >
                  {glaze.colorHex && (
                    <span className="glaze-color" style={{ backgroundColor: glaze.colorHex }} />
                  )}
                  {glaze.name}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="height">Height (cm)</label>
              <input
                type="number"
                id="height"
                name="height"
                value={formData.height}
                onChange={handleInputChange}
                step="0.1"
                placeholder="0.0"
                disabled={uploading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="width">Width (cm)</label>
              <input
                type="number"
                id="width"
                name="width"
                value={formData.width}
                onChange={handleInputChange}
                step="0.1"
                placeholder="0.0"
                disabled={uploading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="length">Length (cm)</label>
              <input
                type="number"
                id="length"
                name="length"
                value={formData.length}
                onChange={handleInputChange}
                step="0.1"
                placeholder="0.0"
                disabled={uploading}
              />
            </div>
          </div>
        </section>

        {/* Organization Section */}
        <section className="form-section">
          <h2>Organization</h2>

          <div className="form-group">
            <label htmlFor="tags">Tags</label>
            <input
              type="text"
              id="tags"
              placeholder="Press Enter to add tags (e.g., wheel-thrown, functional, beginner)"
              onKeyDown={handleTagInput}
              disabled={uploading}
            />
            {formData.tags.length > 0 && (
              <div className="tag-list">
                {formData.tags.map(tag => (
                  <span key={tag} className="tag">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      disabled={uploading}
                      className="tag-remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="isPublic"
                checked={formData.isPublic}
                onChange={handleInputChange}
                disabled={uploading}
              />
              <span>Make this piece public in the gallery showcase</span>
            </label>
          </div>
        </section>

        {uploading && (
          <div className="upload-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
            <p>Uploading... {uploadProgress}%</p>
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            onClick={() => navigate('/gallery')}
            className="btn-secondary"
            disabled={uploading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={uploading || !formData.title || !formData.clayType}
          >
            {uploading ? 'Uploading...' : 'Add Pottery Piece'}
          </button>
        </div>
      </form>
    </div>
  );
}
