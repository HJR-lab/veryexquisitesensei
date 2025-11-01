import { useState, useEffect } from 'react';
import { potteryAPI } from '../utils/api';
import PotteryCard from '../components/PotteryCard';
import Navigation from '../components/Navigation';

export default function PublicGallery() {
  const [pieces, setPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Enhanced filtering
  const [clayTypeFilter, setClayTypeFilter] = useState('all');
  const [glazeFilter, setGlazeFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadPublicPieces();
  }, []);

  const loadPublicPieces = async () => {
    try {
      setLoading(true);
      const data = await potteryAPI.getPublicPieces();
      setPieces(data.pieces || []);
    } catch (err) {
      setError('Failed to load public gallery');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getUniqueTags = () => {
    const tags = new Set();
    pieces.forEach((piece) => {
      piece.tags?.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags);
  };

  const getUniqueClayTypes = () => {
    const types = new Set();
    pieces.forEach((piece) => {
      if (piece.clay_type) types.add(piece.clay_type);
    });
    return Array.from(types);
  };

  const getUniqueGlazes = () => {
    const glazes = new Set();
    pieces.forEach((piece) => {
      if (piece.glazes && Array.isArray(piece.glazes)) {
        piece.glazes.forEach((glaze) => glazes.add(glaze));
      } else if (piece.glaze) {
        glazes.add(piece.glaze);
      }
    });
    return Array.from(glazes);
  };

  const filteredPieces = pieces.filter((piece) => {
    // Tag filter
    const matchesTagFilter = filter === 'all' || piece.tags?.includes(filter);

    // Search filter
    const matchesSearch =
      searchTerm === '' ||
      piece.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      piece.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      piece.artist?.toLowerCase().includes(searchTerm.toLowerCase());

    // Clay type filter
    const matchesClayType = clayTypeFilter === 'all' || piece.clay_type === clayTypeFilter;

    // Glaze filter
    const matchesGlaze = glazeFilter === 'all' ||
      (piece.glazes && piece.glazes.includes(glazeFilter)) ||
      piece.glaze === glazeFilter;

    // Date range filter
    let matchesDateRange = true;
    if (dateRange.start || dateRange.end) {
      const pieceDate = new Date(piece.date_completed);
      if (dateRange.start) {
        matchesDateRange = matchesDateRange && pieceDate >= new Date(dateRange.start);
      }
      if (dateRange.end) {
        matchesDateRange = matchesDateRange && pieceDate <= new Date(dateRange.end);
      }
    }

    return matchesTagFilter && matchesSearch && matchesClayType && matchesGlaze && matchesDateRange;
  });

  const clearAllFilters = () => {
    setFilter('all');
    setClayTypeFilter('all');
    setGlazeFilter('all');
    setDateRange({ start: '', end: '' });
    setSearchTerm('');
  };

  const hasActiveFilters = filter !== 'all' || clayTypeFilter !== 'all' ||
    glazeFilter !== 'all' || dateRange.start || dateRange.end || searchTerm;

  const featuredPieces = filteredPieces.filter((piece) => piece.featured);
  const regularPieces = filteredPieces.filter((piece) => !piece.featured);

  return (
    <div className="min-h-screen bg-background font-display text-text">
      <Navigation />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Search and Filters */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search pottery..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-input w-full text-text focus:outline-0 focus:ring-2 focus:ring-accent border-border bg-background-alt h-10 px-4 text-sm font-normal"
                />
              </div>

              <div className="flex gap-2">
                <button
                  className={`flex items-center justify-center h-10 px-4 text-sm font-bold border ${
                    showFilters ? 'bg-accent text-white border-accent' : 'bg-background-alt text-text border-border'
                  }`}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  {showFilters ? '▼' : '▶'} Filters
                </button>
                {hasActiveFilters && (
                  <button
                    className="flex items-center justify-center h-10 px-4 bg-accent text-white text-sm font-bold border border-accent"
                    onClick={clearAllFilters}
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="bg-background-alt p-4 border border-border">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Clay Type</label>
                    <select
                      value={clayTypeFilter}
                      onChange={(e) => setClayTypeFilter(e.target.value)}
                      className="form-select w-full border-border bg-background text-text h-10 px-3 text-sm"
                    >
                      <option value="all">All Clay Types</option>
                      {getUniqueClayTypes().map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Glaze</label>
                    <select
                      value={glazeFilter}
                      onChange={(e) => setGlazeFilter(e.target.value)}
                      className="form-select w-full border-border bg-background text-text h-10 px-3 text-sm"
                    >
                      <option value="all">All Glazes</option>
                      {getUniqueGlazes().map(glaze => (
                        <option key={glaze} value={glaze}>{glaze}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Date Range</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={dateRange.start}
                        onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                        className="form-input flex-1 border-border bg-background text-text h-10 px-3 text-sm"
                      />
                      <span className="text-text-muted text-sm">to</span>
                      <input
                        type="date"
                        value={dateRange.end}
                        onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                        className="form-input flex-1 border-border bg-background text-text h-10 px-3 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                className={`px-4 py-2 text-sm font-medium border ${
                  filter === 'all'
                    ? 'bg-accent text-white border-accent'
                    : 'bg-background-alt text-text border-border hover:border-accent'
                }`}
                onClick={() => setFilter('all')}
              >
                All ({pieces.length})
              </button>
              {getUniqueTags().map((tag) => (
                <button
                  key={tag}
                  className={`px-4 py-2 text-sm font-medium border ${
                    filter === tag
                      ? 'bg-accent text-white border-accent'
                      : 'bg-background-alt text-text border-border hover:border-accent'
                  }`}
                  onClick={() => setFilter(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>

            {hasActiveFilters && (
              <div className="text-center py-3 px-4 bg-background-alt border border-border">
                <p className="text-sm text-text-muted">
                  Showing {filteredPieces.length} of {pieces.length} pieces
                </p>
              </div>
            )}
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="w-10 h-10 border-3 border-border border-t-accent animate-spin"></div>
              <p className="text-text-muted">Loading gallery...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-red-500 mb-4">{error}</p>
              <button
                onClick={loadPublicPieces}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-10 px-4 bg-accent text-white text-sm font-bold mx-auto border border-accent"
              >
                Try Again
              </button>
            </div>
          ) : filteredPieces.length === 0 ? (
            <div className="bg-background-alt p-16 text-center border border-border">
              <div className="text-6xl mb-4">🏺</div>
              <h2 className="text-2xl font-bold mb-2">No pottery pieces yet</h2>
              <p className="text-text-muted">Check back soon for new student creations!</p>
            </div>
          ) : (
            <div className="space-y-8">
              {featuredPieces.length > 0 && (
                <section>
                  <h2 className="text-3xl font-black leading-tight tracking-tighter mb-6 pb-3 border-b-2 border-accent">
                    Featured Work
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {featuredPieces.map((piece) => (
                      <PotteryCard key={piece.id} piece={piece} showArtist />
                    ))}
                  </div>
                </section>
              )}

              <section>
                {featuredPieces.length > 0 && (
                  <h2 className="text-3xl font-black leading-tight tracking-tighter mb-6 pb-3 border-b-2 border-accent">
                    All Pieces
                  </h2>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {regularPieces.map((piece) => (
                    <PotteryCard key={piece.id} piece={piece} showArtist />
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-background-alt border-t border-border text-center py-8 mt-16">
        <p className="text-sm text-text-muted">VES Pottery Studio - Showcasing Student Excellence</p>
      </footer>
    </div>
  );
}
