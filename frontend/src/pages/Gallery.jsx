import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { potteryAPI } from '../utils/api';
import PotteryCard from '../components/PotteryCard';
import { exportAsJSON, exportAsCSV, exportAsPDFReport } from '../utils/export';
import '../styles/Gallery.css';

export default function Gallery() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
    loadPieces();
  }, []);

  const loadPieces = async () => {
    try {
      setLoading(true);
      const data = await potteryAPI.getPieces();
      setPieces(data.pieces || []);
    } catch (err) {
      setError('Failed to load pottery pieces');
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
      piece.description?.toLowerCase().includes(searchTerm.toLowerCase());

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

  const handleExport = (format) => {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `pottery-journal-${timestamp}`;

    switch (format) {
      case 'json':
        exportAsJSON(filteredPieces, `${filename}.json`);
        break;
      case 'csv':
        exportAsCSV(filteredPieces, `${filename}.csv`);
        break;
      case 'pdf':
        exportAsPDFReport(filteredPieces, user, `${filename}.pdf`);
        break;
      default:
        break;
    }

    setShowExportMenu(false);
  };

  return (
    <div className="gallery-container">
      <header className="gallery-header">
        <div className="header-content">
          <div className="header-left">
            <h1>My Pottery Gallery</h1>
            <p className="welcome-text">
              Welcome back, {user?.firstName || user?.email}!
            </p>
          </div>
          <div className="header-actions">
            <div className="export-dropdown">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="btn-export"
                disabled={pieces.length === 0}
              >
                Export Journal
              </button>
              {showExportMenu && (
                <div className="export-menu">
                  <button onClick={() => handleExport('json')} className="export-option">
                    Export as JSON
                  </button>
                  <button onClick={() => handleExport('csv')} className="export-option">
                    Export as CSV
                  </button>
                  <button onClick={() => handleExport('pdf')} className="export-option">
                    Export as PDF
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => navigate('/upload')} className="btn-add-piece">
              + Add Piece
            </button>
            <button onClick={logout} className="btn-logout">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="gallery-content">
        <div className="gallery-controls">
          <div className="search-and-filters">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search your pottery..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>

            <div className="filter-actions">
              <button
                className={`btn-toggle-filters ${showFilters ? 'active' : ''}`}
                onClick={() => setShowFilters(!showFilters)}
              >
                {showFilters ? '▼' : '▶'} Filters
              </button>
              {hasActiveFilters && (
                <button className="btn-clear-filters" onClick={clearAllFilters}>
                  Clear All
                </button>
              )}
            </div>
          </div>

          {showFilters && (
            <div className="advanced-filters">
              <div className="filter-group">
                <label>Clay Type</label>
                <select
                  value={clayTypeFilter}
                  onChange={(e) => setClayTypeFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Clay Types</option>
                  {getUniqueClayTypes().map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Glaze</label>
                <select
                  value={glazeFilter}
                  onChange={(e) => setGlazeFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Glazes</option>
                  {getUniqueGlazes().map(glaze => (
                    <option key={glaze} value={glaze}>{glaze}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Date Range</label>
                <div className="date-range">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="date-input"
                    placeholder="From"
                  />
                  <span className="date-separator">to</span>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="date-input"
                    placeholder="To"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="filter-buttons">
            <button
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({pieces.length})
            </button>
            {getUniqueTags().map((tag) => (
              <button
                key={tag}
                className={`filter-btn ${filter === tag ? 'active' : ''}`}
                onClick={() => setFilter(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <div className="filter-summary">
              Showing {filteredPieces.length} of {pieces.length} pieces
            </div>
          )}
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading your pottery collection...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={loadPieces} className="btn-retry">
              Try Again
            </button>
          </div>
        ) : filteredPieces.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🏺</div>
            <h2>No pottery pieces yet</h2>
            <p>
              Your pottery journey starts here! Your instructor will add pieces
              as you create them.
            </p>
          </div>
        ) : (
          <div className="pottery-grid">
            {filteredPieces.map((piece) => (
              <PotteryCard key={piece.id} piece={piece} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
