import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminNav from '../components/AdminNav';
import axios from 'axios';

export default function AdminGallery() {
  const navigate = useNavigate();

  const [pieces, setPieces] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedStudent, setSelectedStudent] = useState('all');
  const [selectedClayType, setSelectedClayType] = useState('all');
  const [selectedGlaze, setSelectedGlaze] = useState('all');
  const [filterPublic, setFilterPublic] = useState('all'); // all, public, private
  const [filterFeatured, setFilterFeatured] = useState('all'); // all, featured, not-featured
  const [searchTerm, setSearchTerm] = useState('');

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load all students
      const studentsRes = await axios.get('/api/admin/customers');
      setStudents(studentsRes.data.customers);

      // Load all pottery pieces using dedicated endpoint
      const piecesRes = await axios.get('/api/admin/pottery/all');
      setPieces(piecesRes.data.pieces || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFeatured = async (piece) => {
    try {
      const res = await axios.put(`/api/admin/pottery/${piece.id}/toggle-featured`);

      // Update local state
      setPieces(pieces.map(p =>
        p.id === piece.id ? { ...p, featured: res.data.featured } : p
      ));
    } catch (error) {
      console.error('Failed to toggle featured:', error);
      alert('Failed to toggle featured status');
    }
  };

  const togglePublic = async (piece) => {
    try {
      const res = await axios.put(`/api/admin/pottery/${piece.id}/toggle-public`);

      // Update local state
      setPieces(pieces.map(p =>
        p.id === piece.id ? { ...p, is_public: res.data.isPublic } : p
      ));
    } catch (error) {
      console.error('Failed to toggle public:', error);
      alert('Failed to toggle public status');
    }
  };

  // Get unique values for filters
  const uniqueClayTypes = [...new Set(pieces.map(p => p.clay_type).filter(Boolean))];
  const uniqueGlazes = [...new Set(pieces.flatMap(p => p.glazes || []))].sort();

  // Apply all filters
  const filteredPieces = pieces.filter(piece => {
    const matchesStudent = selectedStudent === 'all' || piece.studentId === parseInt(selectedStudent);
    const matchesClayType = selectedClayType === 'all' || piece.clay_type === selectedClayType;
    const matchesGlaze = selectedGlaze === 'all' || (piece.glazes && piece.glazes.includes(selectedGlaze));
    const matchesPublic = filterPublic === 'all' ||
      (filterPublic === 'public' && piece.is_public) ||
      (filterPublic === 'private' && !piece.is_public);
    const matchesFeatured = filterFeatured === 'all' ||
      (filterFeatured === 'featured' && piece.featured) ||
      (filterFeatured === 'not-featured' && !piece.featured);
    const matchesSearch = !searchTerm ||
      piece.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      piece.studentName?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStudent && matchesClayType && matchesGlaze && matchesPublic && matchesFeatured && matchesSearch;
  });

  const clearFilters = () => {
    setSelectedStudent('all');
    setSelectedClayType('all');
    setSelectedGlaze('all');
    setFilterPublic('all');
    setFilterFeatured('all');
    setSearchTerm('');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AdminNav active="gallery" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 text-text-muted hover:text-accent transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              <span>Back to Dashboard</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-text mb-2">Student Gallery</h1>
              <p className="text-text-muted">
                {filteredPieces.length} of {pieces.length} pieces
                {filteredPieces.length !== pieces.length && ' (filtered)'}
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-background-alt border border-border rounded-xl p-6">
            <p className="text-sm text-text-muted mb-1">Total Pieces</p>
            <p className="text-3xl font-bold text-text">{pieces.length}</p>
          </div>
          <div className="bg-background-alt border border-border rounded-xl p-6">
            <p className="text-sm text-text-muted mb-1">Public</p>
            <p className="text-3xl font-bold text-green-500">
              {pieces.filter(p => p.is_public).length}
            </p>
          </div>
          <div className="bg-background-alt border border-border rounded-xl p-6">
            <p className="text-sm text-text-muted mb-1">Featured</p>
            <p className="text-3xl font-bold text-accent">
              {pieces.filter(p => p.featured).length}
            </p>
          </div>
          <div className="bg-background-alt border border-border rounded-xl p-6">
            <p className="text-sm text-text-muted mb-1">Students</p>
            <p className="text-3xl font-bold text-blue-500">{students.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-background-alt border border-border rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-text">Filters</h2>
            {(selectedStudent !== 'all' || selectedClayType !== 'all' || selectedGlaze !== 'all' ||
              filterPublic !== 'all' || filterFeatured !== 'all' || searchTerm) && (
              <button
                onClick={clearFilters}
                className="text-sm text-accent hover:text-accent/80 transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">Search</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search title or student..."
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              />
            </div>

            {/* Student */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">Student</label>
              <select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              >
                <option value="all">All Students</option>
                {students.map(student => (
                  <option key={student.dbId} value={student.dbId}>
                    {student.firstName} {student.lastName}
                  </option>
                ))}
              </select>
            </div>

            {/* Clay Type */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">Clay Type</label>
              <select
                value={selectedClayType}
                onChange={(e) => setSelectedClayType(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              >
                <option value="all">All Types</option>
                {uniqueClayTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Glaze */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">Glaze</label>
              <select
                value={selectedGlaze}
                onChange={(e) => setSelectedGlaze(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              >
                <option value="all">All Glazes</option>
                {uniqueGlazes.map(glaze => (
                  <option key={glaze} value={glaze}>{glaze}</option>
                ))}
              </select>
            </div>

            {/* Public/Private */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">Visibility</label>
              <select
                value={filterPublic}
                onChange={(e) => setFilterPublic(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              >
                <option value="all">All</option>
                <option value="public">Public Only</option>
                <option value="private">Private Only</option>
              </select>
            </div>

            {/* Featured */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">Featured</label>
              <select
                value={filterFeatured}
                onChange={(e) => setFilterFeatured(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              >
                <option value="all">All</option>
                <option value="featured">Featured Only</option>
                <option value="not-featured">Not Featured</option>
              </select>
            </div>
          </div>
        </div>

        {/* Gallery Grid */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-text-muted">Loading gallery...</p>
          </div>
        ) : filteredPieces.length === 0 ? (
          <div className="bg-background-alt border border-border rounded-xl p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-text-muted mb-4 block">
              photo_library
            </span>
            <h3 className="text-xl font-bold text-text mb-2">No Pieces Found</h3>
            <p className="text-text-muted mb-6">
              {pieces.length === 0 ? 'No pottery pieces in the gallery yet' : 'Try adjusting your filters'}
            </p>
            {pieces.length > 0 && (
              <button
                onClick={clearFilters}
                className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredPieces.map((piece) => (
              <div
                key={piece.id}
                className="group bg-background-alt rounded-xl border border-border overflow-hidden hover:border-accent transition-all"
              >
                {/* Image */}
                <div className="relative aspect-square">
                  <div
                    className="w-full h-full bg-cover bg-center"
                    style={{ backgroundImage: `url('${piece.images?.[0] || 'https://via.placeholder.com/400'}')` }}
                  />

                  {/* Quick Actions Overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => togglePublic(piece)}
                      className={`p-3 rounded-lg ${
                        piece.is_public ? 'bg-green-500' : 'bg-gray-500'
                      } text-white hover:scale-110 transition-transform`}
                      title={piece.is_public ? 'Make Private' : 'Make Public'}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {piece.is_public ? 'visibility' : 'visibility_off'}
                      </span>
                    </button>

                    <button
                      onClick={() => toggleFeatured(piece)}
                      className={`p-3 rounded-lg ${
                        piece.featured ? 'bg-accent' : 'bg-gray-500'
                      } text-white hover:scale-110 transition-transform`}
                      title={piece.featured ? 'Unfeature' : 'Feature'}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {piece.featured ? 'star' : 'star_border'}
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedPiece(piece);
                        setShowEditModal(true);
                      }}
                      className="p-3 rounded-lg bg-blue-500 text-white hover:scale-110 transition-transform"
                      title="Edit"
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>
                    </button>
                  </div>

                  {/* Badges */}
                  <div className="absolute top-2 right-2 flex gap-2">
                    {piece.featured && (
                      <span className="px-2 py-1 bg-accent/90 text-white rounded text-xs font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">star</span>
                        Featured
                      </span>
                    )}
                    {piece.is_public && (
                      <span className="px-2 py-1 bg-green-500/90 text-white rounded text-xs font-medium">
                        Public
                      </span>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-bold text-text mb-1 truncate">{piece.title}</h3>
                  <p className="text-sm text-accent mb-2 truncate">{piece.studentName}</p>
                  <div className="space-y-1">
                    <p className="text-xs text-text-muted truncate">
                      <span className="font-medium">Clay:</span> {piece.clay_type || 'N/A'}
                    </p>
                    {piece.glazes && piece.glazes.length > 0 && (
                      <p className="text-xs text-text-muted truncate">
                        <span className="font-medium">Glazes:</span> {piece.glazes.join(', ')}
                      </p>
                    )}
                    {piece.date_completed && (
                      <p className="text-xs text-text-muted">
                        {new Date(piece.date_completed).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Edit Modal - Placeholder */}
      {showEditModal && selectedPiece && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background-alt border border-border rounded-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-text mb-4">Edit Piece</h2>
            <p className="text-text-muted mb-6">
              Editing: {selectedPiece.title}
            </p>
            <p className="text-sm text-text-muted mb-6">
              Full edit modal coming soon. Use student gallery for detailed editing.
            </p>
            <button
              onClick={() => setShowEditModal(false)}
              className="w-full px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
