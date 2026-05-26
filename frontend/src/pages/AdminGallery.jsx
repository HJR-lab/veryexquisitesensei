import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import AdminPage from '../components/AdminPage';

export default function AdminGallery() {
  const [pieces, setPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const fetchPieces = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/gallery/pieces');
      setPieces(data.pieces || []);
    } catch (err) {
      console.error('Failed to fetch pieces:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPieces(); }, [fetchPieces]);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (q.length < 3) return;
    setIsSearching(true);
    try {
      const { data } = await api.get(`/admin/gallery/search?initials=${encodeURIComponent(q)}`);
      setPieces(data.pieces || []);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    fetchPieces();
  };

  const handleToggleFeatured = async (pieceId) => {
    try {
      await api.put(`/admin/gallery/pieces/${pieceId}/feature`);
      setPieces(prev => prev.map(p => p.id === pieceId ? { ...p, featured: !p.featured } : p));
    } catch (err) {
      console.error('Failed to toggle featured:', err);
    }
  };

  const handleToggleVisibility = async (pieceId) => {
    try {
      await api.put(`/admin/gallery/pieces/${pieceId}/visibility`);
      setPieces(prev => prev.map(p => p.id === pieceId ? { ...p, is_public: !p.is_public } : p));
    } catch (err) {
      console.error('Failed to toggle visibility:', err);
    }
  };

  const handleDelete = async (pieceId) => {
    if (!window.confirm('Delete this piece? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/gallery/pieces/${pieceId}`);
      setPieces(prev => prev.filter(p => p.id !== pieceId));
    } catch (err) {
      console.error('Failed to delete piece:', err);
    }
  };

  if (loading) {
    return (
      <AdminPage title="Gallery">
        <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading gallery...</div>
      </AdminPage>
    );
  }

  return (
    <AdminPage title="Gallery">
      {/* Search */}
      <div style={{ background: 'white', borderRadius: 10, padding: 16, marginBottom: 24, border: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search by initials (min 3 characters)"
            style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, letterSpacing: 2, fontWeight: 600 }}
          />
          <button
            onClick={handleSearch}
            disabled={searchQuery.trim().length < 3 || isSearching}
            style={{ padding: '10px 20px', background: searchQuery.trim().length < 3 ? '#ccc' : '#282828', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
          >
            Search
          </button>
          {searchQuery && (
            <button onClick={handleClearSearch} style={{ padding: '10px 16px', background: 'white', color: '#888', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        {pieces.length} piece{pieces.length !== 1 ? 's' : ''}
        {pieces.filter(p => p.featured).length > 0 && ` · ${pieces.filter(p => p.featured).length} featured`}
        {pieces.filter(p => p.is_public).length > 0 && ` · ${pieces.filter(p => p.is_public).length} public`}
      </div>

      {/* Pieces Grid */}
      {pieces.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>No pieces found.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {pieces.map(piece => {
            const student = piece.customer || {};
            const thumbnail = piece.images && piece.images.length > 0 ? (piece.images[0].url || piece.images[0]) : null;

            return (
              <div key={piece.id} style={{
                background: 'white', border: `1px solid ${piece.featured ? '#C4622D' : '#e0e0e0'}`,
                borderRadius: 10, overflow: 'hidden',
              }}>
                {thumbnail ? (
                  <img src={thumbnail} alt={piece.title || 'Piece'} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: 160, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 32 }}>🏺</div>
                )}

                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#282828', marginBottom: 2 }}>
                    {piece.title || 'Untitled'}
                    {piece.featured && <span style={{ color: '#C4622D', marginLeft: 4 }}>★</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                    {student.initials || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown'}
                    {piece.clay_type && ` · ${piece.clay_type}`}
                    {piece.created_at && ` · ${new Date(piece.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`}
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleToggleFeatured(piece.id)}
                      title={piece.featured ? 'Unfeature' : 'Feature'}
                      style={{ padding: '4px 8px', background: piece.featured ? '#C4622D' : '#f5f5f5', color: piece.featured ? 'white' : '#888', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                    >
                      {piece.featured ? '★ Featured' : '☆ Feature'}
                    </button>
                    <button
                      onClick={() => handleToggleVisibility(piece.id)}
                      title={piece.is_public ? 'Make private' : 'Make public'}
                      style={{ padding: '4px 8px', background: piece.is_public ? '#E8F5E9' : '#f5f5f5', color: piece.is_public ? '#2D8C4E' : '#888', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                    >
                      {piece.is_public ? 'Public' : 'Private'}
                    </button>
                    <button
                      onClick={() => handleDelete(piece.id)}
                      title="Delete piece"
                      style={{ padding: '4px 8px', background: '#f5f5f5', color: '#D32F2F', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', marginLeft: 'auto' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminPage>
  );
}
