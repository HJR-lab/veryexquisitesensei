import { useState, useEffect } from 'react';
import axios from 'axios';
import Navigation from '../components/Navigation';

const API_URL = 'http://localhost:3000';

export default function GalleryNew() {
  const [pieces, setPieces] = useState([]);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [clayTypes, setClayTypes] = useState([]);
  const [glazes, setGlazes] = useState([]);
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editImageFiles, setEditImageFiles] = useState([]);
  const [editImagePreviewUrls, setEditImagePreviewUrls] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [viewMode, setViewMode] = useState('grid-with-details'); // 'grid-with-details' or 'grid-only'
  const [filterClayType, setFilterClayType] = useState('');
  const [filterGlaze, setFilterGlaze] = useState('');

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
  }, []);

  const fetchReferenceData = async () => {
    try {
      const token = localStorage.getItem('token');

      const [clayTypesRes, glazesRes] = await Promise.all([
        axios.get(`${API_URL}/api/reference/clay-types`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/api/reference/glazes`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setClayTypes(clayTypesRes.data.clayTypes || []);
      setGlazes(glazesRes.data.glazes || []);
    } catch (error) {
      console.error('Error fetching reference data:', error);
    }
  };

  const fetchPieces = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/pottery/pieces`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setPieces(response.data.pieces || []);
    } catch (error) {
      console.error('Error fetching pieces:', error);
    } finally {
      setLoading(false);
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
    setShowEditModal(true); // Open edit modal when clicking a piece
  };

  const resetAddModal = () => {
    setFormData({
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
    setImageFiles([]);
    setImagePreviewUrls([]);
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    setImageFiles(files);

    // Create preview URLs
    const previews = files.map(file => URL.createObjectURL(file));
    setImagePreviewUrls(previews);
  };

  const handleSubmitNew = async () => {
    try {
      setUploading(true);
      const token = localStorage.getItem('token');

      // Upload images first
      let imageUrls = [];
      if (imageFiles.length > 0) {
        const uploadFormData = new FormData();
        imageFiles.forEach(file => {
          uploadFormData.append('images', file);
        });

        const uploadRes = await axios.post(`${API_URL}/api/upload/images`, uploadFormData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        });

        imageUrls = uploadRes.data.images.map(img => img.url);
      }

      // Create pottery piece with properly formatted data
      const pieceData = {
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
        images: imageUrls
      };

      console.log('Creating pottery piece with data:', pieceData);

      const response = await axios.post(`${API_URL}/api/pottery/create-piece`, pieceData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('Pottery piece created:', response.data);

      // Reset form and close modal
      setShowAddModal(false);
      resetAddModal();

      // Refresh the pieces list
      await fetchPieces();
      alert('Pottery piece created successfully!');
    } catch (error) {
      console.error('Error creating piece:', error);
      console.error('Error details:', error.response?.data);
      alert(`Failed to create pottery piece: ${error.response?.data?.error || error.message}`);
    } finally {
      setUploading(false);
    }
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
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
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
    const newImageCount = files.length;
    const totalImages = currentImageCount + newImageCount;

    if (totalImages > 3) {
      alert(`You can only have a maximum of 3 images. You currently have ${currentImageCount} image(s).`);
      return;
    }

    setEditImageFiles(files);
    const previews = files.map(file => URL.createObjectURL(file));
    setEditImagePreviewUrls(previews);
  };

  const handleSaveChanges = async () => {
    if (!selectedPiece) return;

    try {
      setUploading(true);
      const token = localStorage.getItem('token');

      // Upload new images if any
      let newImageUrls = [];
      if (editImageFiles.length > 0) {
        const uploadFormData = new FormData();
        editImageFiles.forEach(file => {
          uploadFormData.append('images', file);
        });

        const uploadRes = await axios.post(`${API_URL}/api/upload/images`, uploadFormData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        });

        newImageUrls = uploadRes.data.images.map(img => img.url);
      }

      // Combine existing images with new ones (max 3)
      const allImages = [...(selectedPiece.images || []), ...newImageUrls].slice(0, 3);

      // Update pottery piece
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

      await axios.put(`${API_URL}/api/pottery/pieces/${selectedPiece.id}`, updateData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Close modal and reset
      setShowEditModal(false);
      setEditImageFiles([]);
      setEditImagePreviewUrls([]);
      setSelectedPiece(null);

      // Refresh pieces
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

    if (!confirm(`Are you sure you want to delete "${selectedPiece.title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setUploading(true);
      const token = localStorage.getItem('token');

      await axios.delete(`${API_URL}/api/pottery/pieces/${selectedPiece.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setShowEditModal(false);
      setSelectedPiece(null);
      await fetchPieces();
      alert('Piece deleted successfully!');
    } catch (error) {
      console.error('Error deleting piece:', error);
      alert(`Failed to delete piece: ${error.response?.data?.error || error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = (indexToRemove) => {
    if (!selectedPiece) return;
    const updatedImages = selectedPiece.images.filter((_, index) => index !== indexToRemove);
    setSelectedPiece({...selectedPiece, images: updatedImages});
    setFormData({...formData, images: updatedImages});
  };

  // Get filtered pieces based on clay type and glaze filters
  const filteredPieces = pieces.filter(piece => {
    const matchesClayType = !filterClayType || piece.clay_type === filterClayType;
    const matchesGlaze = !filterGlaze || (piece.glazes && piece.glazes.includes(filterGlaze));
    return matchesClayType && matchesGlaze;
  });

  // Get unique clay types from all pieces
  const uniqueClayTypes = [...new Set(pieces.map(p => p.clay_type).filter(Boolean))];

  // Get unique glazes from all pieces
  const uniqueGlazes = [...new Set(pieces.flatMap(p => p.glazes || []))].sort();

  if (loading) {
    return (
      <div className="min-h-screen bg-background font-display text-text">
        <Navigation />
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-10 h-10 border-3 border-border border-t-accent rounded-full animate-spin"></div>
          <p className="text-text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-display text-text">
      <Navigation />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-black leading-tight tracking-tighter">My Gallery</h1>
            <p className="text-text-muted text-base font-normal">Manage your pottery pieces.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'grid-with-details' ? 'grid-only' : 'grid-with-details')}
              className="flex items-center justify-center rounded-lg h-10 px-4 bg-border text-text text-sm font-bold gap-2 hover:bg-border/80 transition-colors"
            >
              <span className="material-symbols-outlined">
                {viewMode === 'grid-with-details' ? 'grid_view' : 'view_agenda'}
              </span>
              <span className="truncate">{viewMode === 'grid-with-details' ? 'Images Only' : 'Show Details'}</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-accent text-white text-sm font-bold leading-normal tracking-wide gap-2 hover:bg-accent/90 transition-colors"
            >
              <span className="material-symbols-outlined">add</span>
              <span className="truncate">Add New Work</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        {pieces.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Clay Type:</label>
              <select
                value={filterClayType}
                onChange={(e) => setFilterClayType(e.target.value)}
                className="form-select rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
              >
                <option value="">All Types</option>
                {uniqueClayTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Glaze:</label>
              <select
                value={filterGlaze}
                onChange={(e) => setFilterGlaze(e.target.value)}
                className="form-select rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
              >
                <option value="">All Glazes</option>
                {uniqueGlazes.map(glaze => (
                  <option key={glaze} value={glaze}>{glaze}</option>
                ))}
              </select>
            </div>

            {(filterClayType || filterGlaze) && (
              <button
                onClick={() => {
                  setFilterClayType('');
                  setFilterGlaze('');
                }}
                className="flex items-center gap-1 rounded-lg h-10 px-3 bg-red-500/10 text-red-500 text-sm font-bold hover:bg-red-500/20 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                Clear Filters
              </button>
            )}

            <div className="ml-auto text-sm text-text-muted">
              Showing {filteredPieces.length} of {pieces.length} pieces
            </div>
          </div>
        )}

        {/* Gallery Grid */}
        {pieces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="material-symbols-outlined text-6xl text-text-muted mb-4">photo_library</span>
            <h3 className="text-xl font-bold mb-2">No pottery pieces yet</h3>
            <p className="text-text-muted mb-4">Start building your gallery by adding your first piece</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center rounded-lg h-10 px-6 bg-accent text-white text-sm font-bold gap-2"
            >
              <span className="material-symbols-outlined">add</span>
              <span>Add Your First Piece</span>
            </button>
          </div>
        ) : filteredPieces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="material-symbols-outlined text-6xl text-text-muted mb-4">filter_alt_off</span>
            <h3 className="text-xl font-bold mb-2">No pieces match your filters</h3>
            <p className="text-text-muted mb-4">Try adjusting your clay type or glaze filters</p>
            <button
              onClick={() => {
                setFilterClayType('');
                setFilterGlaze('');
              }}
              className="flex items-center justify-center rounded-lg h-10 px-6 bg-accent text-white text-sm font-bold gap-2"
            >
              <span className="material-symbols-outlined">refresh</span>
              <span>Clear Filters</span>
            </button>
          </div>
        ) : viewMode === 'grid-only' ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            {filteredPieces.map((piece) => (
              <div
                key={piece.id}
                onClick={() => selectPiece(piece)}
                className="group relative bg-cover bg-center flex flex-col gap-3 justify-end aspect-square overflow-hidden rounded-lg cursor-pointer hover:ring-2 hover:ring-accent transition-all"
                style={{ backgroundImage: `url('${piece.images?.[0] || 'https://via.placeholder.com/300'}')` }}
              >
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="material-symbols-outlined text-white text-4xl">edit</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPieces.map((piece) => (
              <div
                key={piece.id}
                onClick={() => selectPiece(piece)}
                className="bg-background-alt rounded-xl border border-border overflow-hidden cursor-pointer hover:border-accent transition-colors"
              >
                <div
                  className="aspect-square bg-cover bg-center"
                  style={{ backgroundImage: `url('${piece.images?.[0] || 'https://via.placeholder.com/300'}')` }}
                ></div>
                <div className="p-4 space-y-2">
                  <h3 className="font-bold text-lg">{piece.title}</h3>
                  <p className="text-sm text-text-muted">{piece.clay_type}</p>
                  {piece.glazes && piece.glazes.length > 0 && (
                    <p className="text-xs text-text-muted">Glazes: {piece.glazes.join(', ')}</p>
                  )}
                  {piece.date_completed && (
                    <p className="text-xs text-text-muted">{piece.date_completed}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add New Work Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-background border-b border-border p-6 flex justify-between items-center">
              <h2 className="text-2xl font-black">Add New Work</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-background-alt rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium mb-2">Images</label>
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    id="image-upload"
                  />
                  <label htmlFor="image-upload" className="cursor-pointer">
                    <span className="material-symbols-outlined text-5xl text-text-muted mb-2 block">add_photo_alternate</span>
                    <p className="text-sm text-text-muted mb-1">Click to upload images</p>
                    <p className="text-xs text-text-muted">Support for multiple images</p>
                  </label>
                  {imagePreviewUrls.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mt-4">
                      {imagePreviewUrls.map((url, index) => (
                        <img key={index} src={url} alt={`Preview ${index + 1}`} className="w-full h-24 object-cover rounded-lg" />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Title */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Title *</label>
                  <input
                    type="text"
                    className="form-input w-full rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    placeholder="Enter piece title"
                  />
                </div>

                {/* Clay Type */}
                <div>
                  <label className="block text-sm font-medium mb-1">Clay Type *</label>
                  <select
                    className="form-select w-full rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
                    value={formData.clay_type}
                    onChange={(e) => setFormData({...formData, clay_type: e.target.value})}
                  >
                    <option value="">Select clay type</option>
                    {clayTypes.map(type => (
                      <option key={type.id} value={type.name}>{type.name}</option>
                    ))}
                  </select>
                </div>

                {/* Date Completed */}
                <div>
                  <label className="block text-sm font-medium mb-1">Date Completed *</label>
                  <input
                    type="date"
                    className="form-input w-full rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
                    value={formData.date_completed}
                    onChange={(e) => setFormData({...formData, date_completed: e.target.value})}
                  />
                </div>

                {/* Dimensions */}
                <div>
                  <label className="block text-sm font-medium mb-1">Height (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input w-full rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
                    value={formData.height}
                    onChange={(e) => setFormData({...formData, height: e.target.value})}
                    placeholder="0.0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Width (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input w-full rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
                    value={formData.width}
                    onChange={(e) => setFormData({...formData, width: e.target.value})}
                    placeholder="0.0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Length (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input w-full rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
                    value={formData.length}
                    onChange={(e) => setFormData({...formData, length: e.target.value})}
                    placeholder="0.0"
                  />
                </div>

                {/* Weight */}
                <div>
                  <label className="block text-sm font-medium mb-1">Original Weight (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input w-full rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
                    value={formData.original_weight}
                    onChange={(e) => setFormData({...formData, original_weight: e.target.value})}
                    placeholder="0.0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Final Weight (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input w-full rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
                    value={formData.final_weight}
                    onChange={(e) => setFormData({...formData, final_weight: e.target.value})}
                    placeholder="0.0"
                  />
                </div>
              </div>

              {/* Glazes */}
              <div>
                <label className="block text-sm font-medium mb-2">Glazes</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-background-alt rounded-lg border border-border">
                  {glazes.map(glaze => (
                    <label key={glaze.id} className="flex items-center gap-2 cursor-pointer hover:bg-background p-2 rounded">
                      <input
                        type="checkbox"
                        checked={formData.glazes.includes(glaze.name)}
                        onChange={() => toggleGlaze(glaze.name)}
                        className="rounded border-border text-accent focus:ring-accent"
                      />
                      <span className="text-sm">{glaze.name}</span>
                    </label>
                  ))}
                </div>
                {formData.glazes.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.glazes.map(glaze => (
                      <span key={glaze} className="inline-flex items-center gap-1 px-2 py-1 bg-accent/10 text-accent text-xs rounded-full">
                        {glaze}
                        <button onClick={() => toggleGlaze(glaze)} className="hover:bg-accent/20 rounded-full p-0.5">
                          <span className="material-symbols-outlined text-xs">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium mb-1">Tags</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="form-input flex-1 rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
                    placeholder="Add a tag and press Enter"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        addTag(e.target.value);
                        e.target.value = '';
                      }
                    }}
                  />
                </div>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-border text-text text-xs rounded-full">
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:bg-border/80 rounded-full p-0.5">
                          <span className="material-symbols-outlined text-xs">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1">Description / Notes</label>
                <textarea
                  className="form-textarea w-full rounded-lg border-border bg-background-alt text-text px-3 py-2 text-sm"
                  rows="4"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Add notes about your piece..."
                ></textarea>
              </div>

              {/* Public Toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is-public"
                  checked={formData.is_public}
                  onChange={(e) => setFormData({...formData, is_public: e.target.checked})}
                  className="rounded border-border text-accent focus:ring-accent"
                />
                <label htmlFor="is-public" className="text-sm font-medium cursor-pointer">
                  Make this piece public (visible in public gallery)
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 bg-background border-t border-border p-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-6 h-10 rounded-lg bg-border text-text text-sm font-bold hover:bg-border/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitNew}
                disabled={uploading || !formData.title || !formData.clay_type || !formData.date_completed}
                className="px-6 h-10 rounded-lg bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {uploading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                <span>{uploading ? 'Creating...' : 'Create Piece'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Work Modal */}
      {showEditModal && selectedPiece && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-background border-b border-border p-6 flex justify-between items-center">
              <h2 className="text-2xl font-black">Edit Work</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedPiece(null);
                }}
                className="p-2 hover:bg-background-alt rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Current Images */}
              <div>
                <label className="block text-sm font-medium mb-2">Current Images ({selectedPiece.images?.length || 0}/3)</label>
                {selectedPiece.images && selectedPiece.images.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {selectedPiece.images.map((image, index) => (
                      <div key={index} className="relative group">
                        <img src={image} alt={`Image ${index + 1}`} className="w-full h-32 object-cover rounded-lg" />
                        <button
                          onClick={() => handleRemoveImage(index)}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">No images yet</p>
                )}
              </div>

              {/* Add More Images */}
              {selectedPiece.images.length < 3 && (
                <div>
                  <label className="block text-sm font-medium mb-2">Add More Images</label>
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleEditImageSelect}
                      className="hidden"
                      id="edit-image-upload-modal"
                    />
                    <label htmlFor="edit-image-upload-modal" className="cursor-pointer">
                      <span className="material-symbols-outlined text-5xl text-text-muted mb-2 block">add_photo_alternate</span>
                      <p className="text-sm text-text-muted mb-1">Click to add more images</p>
                      <p className="text-xs text-text-muted">You can add {3 - selectedPiece.images.length} more image(s)</p>
                    </label>
                    {editImagePreviewUrls.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mt-4">
                        {editImagePreviewUrls.map((url, index) => (
                          <img key={index} src={url} alt={`Preview ${index + 1}`} className="w-full h-24 object-cover rounded-lg" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Title */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Title *</label>
                  <input
                    type="text"
                    className="form-input w-full rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                  />
                </div>

                {/* Clay Type */}
                <div>
                  <label className="block text-sm font-medium mb-1">Clay Type *</label>
                  <select
                    className="form-select w-full rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
                    value={formData.clay_type}
                    onChange={(e) => setFormData({...formData, clay_type: e.target.value})}
                  >
                    <option value="">Select clay type</option>
                    {clayTypes.map(type => (
                      <option key={type.id} value={type.name}>{type.name}</option>
                    ))}
                  </select>
                </div>

                {/* Date Completed */}
                <div>
                  <label className="block text-sm font-medium mb-1">Date Completed *</label>
                  <input
                    type="date"
                    className="form-input w-full rounded-lg border-border bg-background-alt text-text h-10 px-3 text-sm"
                    value={formData.date_completed}
                    onChange={(e) => setFormData({...formData, date_completed: e.target.value})}
                  />
                </div>
              </div>

              {/* Glazes */}
              <div>
                <label className="block text-sm font-medium mb-2">Glazes</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-background-alt rounded-lg border border-border">
                  {glazes.map(glaze => (
                    <label key={glaze.id} className="flex items-center gap-2 cursor-pointer hover:bg-background p-2 rounded">
                      <input
                        type="checkbox"
                        checked={formData.glazes.includes(glaze.name)}
                        onChange={() => toggleGlaze(glaze.name)}
                        className="rounded border-border text-accent focus:ring-accent"
                      />
                      <span className="text-sm">{glaze.name}</span>
                    </label>
                  ))}
                </div>
                {formData.glazes.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.glazes.map(glaze => (
                      <span key={glaze} className="inline-flex items-center gap-1 px-2 py-1 bg-accent/10 text-accent text-xs rounded-full">
                        {glaze}
                        <button onClick={() => toggleGlaze(glaze)} className="hover:bg-accent/20 rounded-full p-0.5">
                          <span className="material-symbols-outlined text-xs">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1">Description / Notes</label>
                <textarea
                  className="form-textarea w-full rounded-lg border-border bg-background-alt text-text px-3 py-2 text-sm"
                  rows="4"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Add notes about your piece..."
                ></textarea>
              </div>

              {/* Public Toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="edit-is-public"
                  checked={formData.is_public}
                  onChange={(e) => setFormData({...formData, is_public: e.target.checked})}
                  className="rounded border-border text-accent focus:ring-accent"
                />
                <label htmlFor="edit-is-public" className="text-sm font-medium cursor-pointer">
                  Make this piece public (visible in public gallery)
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 bg-background border-t border-border p-6 flex gap-3 justify-end">
              <button
                onClick={handleDeletePiece}
                disabled={uploading}
                className="mr-auto px-6 h-10 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedPiece(null);
                }}
                className="px-6 h-10 rounded-lg bg-border text-text text-sm font-bold hover:bg-border/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChanges}
                disabled={uploading || !formData.title || !formData.clay_type || !formData.date_completed}
                className="px-6 h-10 rounded-lg bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {uploading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                <span>{uploading ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
