import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const TC = '#C4622D';
const INK = '#282828';
const MUTED = '#888';

export default function AdminGallery() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('before'); // 'before' | 'after'

  // Before firing state (piece_batches)
  const [batches, setBatches] = useState([]);
  const [batchStats, setBatchStats] = useState({});
  const [batchLoading, setBatchLoading] = useState(true);

  // After firing state (pottery_pieces)
  const [pieces, setPieces] = useState([]);
  const [pieceLoading, setPieceLoading] = useState(true);
  const [students, setStudents] = useState([]);

  // Filters for after-firing
  const [selectedStudent, setSelectedStudent] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Photo viewer
  const [expandedPhoto, setExpandedPhoto] = useState(null);

  useEffect(() => {
    loadBatches();
    loadPieces();
  }, []);

  const loadBatches = async () => {
    try {
      const { data } = await api.get('/admin/pieces/pipeline');
      // Flatten all batches from all statuses
      const allBatches = [];
      for (const status of ['logged', 'bisque_fired', 'glaze_fired', 'ready']) {
        const items = data.batches?.[status] || [];
        allBatches.push(...items);
      }
      setBatches(allBatches);
      setBatchStats(data.stats || {});
    } catch (err) {
      console.error('Failed to load batches:', err);
    } finally {
      setBatchLoading(false);
    }
  };

  const loadPieces = async () => {
    try {
      const [piecesRes, studentsRes] = await Promise.all([
        api.get('/admin/pottery/all'),
        api.get('/admin/customers'),
      ]);
      setPieces(piecesRes.data.pieces || []);
      setStudents(studentsRes.data.customers || []);
    } catch (err) {
      console.error('Failed to load pieces:', err);
    } finally {
      setPieceLoading(false);
    }
  };

  const totalLogged = Object.values(batchStats).reduce((sum, s) => sum + (s?.pieces || 0), 0);
  const totalFinished = pieces.length;

  const filteredPieces = pieces.filter(piece => {
    const matchesStudent = selectedStudent === 'all' || piece.studentId === parseInt(selectedStudent);
    const matchesSearch = !searchTerm ||
      piece.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      piece.studentName?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStudent && matchesSearch;
  });

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => navigate('/admin')}
            style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, padding: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
            Back
          </button>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Gallery</h1>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div
            onClick={() => setTab('before')}
            style={{
              textAlign: 'center', padding: 20, background: 'white', borderRadius: 10,
              border: `2px solid ${tab === 'before' ? TC : '#e0e0e0'}`, cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 700, color: tab === 'before' ? TC : INK }}>{totalLogged}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: tab === 'before' ? TC : MUTED }}>Before Firing</div>
            <div style={{ fontSize: 11, color: MUTED }}>Pieces logged by students</div>
          </div>
          <div
            onClick={() => setTab('after')}
            style={{
              textAlign: 'center', padding: 20, background: 'white', borderRadius: 10,
              border: `2px solid ${tab === 'after' ? '#2D8C4E' : '#e0e0e0'}`, cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 700, color: tab === 'after' ? '#2D8C4E' : INK }}>{totalFinished}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: tab === 'after' ? '#2D8C4E' : MUTED }}>Finished Works</div>
            <div style={{ fontSize: 11, color: MUTED }}>Added to gallery</div>
          </div>
        </div>

        {/* Before Firing Tab */}
        {tab === 'before' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>
                Pieces Logged Before Firing
              </div>
              <button
                onClick={() => navigate('/admin/pieces')}
                style={{ padding: '6px 14px', background: TC, color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Open Pipeline
              </button>
            </div>

            {batchLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>Loading...</div>
            ) : batches.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>No pieces logged yet</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {batches.map(batch => {
                  const student = batch.customers || {};
                  const enrollment = batch.course_enrollments || {};
                  const courseName = enrollment.course_title || enrollment.course_variant_title || 'Course';
                  const photos = batch.photo_urls || [];
                  const statusLabel = { logged: 'Drying', bisque_fired: 'Bisque Fired', glaze_fired: 'Glaze Fired', ready: 'Ready', collecting: 'Collecting', delivering: 'Delivery' }[batch.status] || batch.status;
                  const statusColor = batch.status === 'ready' || batch.status === 'collecting' || batch.status === 'delivering' ? '#2D8C4E' : batch.status === 'logged' ? MUTED : '#E65100';

                  return (
                    <div key={batch.id} style={{ background: 'white', borderRadius: 10, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
                      {/* Photo grid */}
                      {photos.length > 0 ? (
                        <div
                          style={{ position: 'relative', cursor: 'pointer' }}
                          onClick={() => setExpandedPhoto(photos[0])}
                        >
                          <img src={photos[0]} alt="Pieces" style={{ width: '100%', height: 180, objectFit: 'cover' }} />
                          {photos.length > 1 && (
                            <span style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
                              +{photos.length - 1} more
                            </span>
                          )}
                          <span style={{ position: 'absolute', top: 8, right: 8, background: statusColor, color: 'white', fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                            {statusLabel}
                          </span>
                        </div>
                      ) : (
                        <div style={{ height: 80, background: '#f5f3f0', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                          <span style={{ color: '#ccc', fontSize: 13 }}>No photo</span>
                          <span style={{ position: 'absolute', top: 8, right: 8, background: statusColor, color: 'white', fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                            {statusLabel}
                          </span>
                        </div>
                      )}
                      <div style={{ padding: 12 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{student.first_name} {student.last_name}</div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                          {courseName} · {batch.piece_count} piece{batch.piece_count !== 1 ? 's' : ''} · <strong>{batch.initials}</strong>
                        </div>
                        {batch.notes && <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{batch.notes}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Multi-photo row when expanded */}
            {batches.some(b => (b.photo_urls || []).length > 1) && (
              <div style={{ marginTop: 8 }} />
            )}
          </div>
        )}

        {/* After Firing Tab */}
        {tab === 'after' && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 }}>
              Finished Works in Gallery
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search title or student..."
                style={{ flex: 1, minWidth: 160, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}
              />
              <select
                value={selectedStudent}
                onChange={e => setSelectedStudent(e.target.value)}
                style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}
              >
                <option value="all">All Students</option>
                {students.map(s => (
                  <option key={s.dbId} value={s.dbId}>{s.firstName} {s.lastName}</option>
                ))}
              </select>
            </div>

            {pieceLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>Loading...</div>
            ) : filteredPieces.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>
                {pieces.length === 0 ? 'No finished pieces yet' : 'No results match your filters'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {filteredPieces.map(piece => (
                  <div key={piece.id} style={{ background: 'white', borderRadius: 10, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
                    <div
                      style={{ width: '100%', height: 180, backgroundImage: `url('${piece.images?.[0] || ''}')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#f5f3f0', cursor: piece.images?.[0] ? 'pointer' : 'default' }}
                      onClick={() => piece.images?.[0] && setExpandedPhoto(piece.images[0])}
                    />
                    <div style={{ padding: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{piece.title || 'Untitled'}</div>
                      <div style={{ fontSize: 12, color: TC, marginTop: 2 }}>{piece.studentName}</div>
                      {piece.clay_type && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{piece.clay_type}</div>}
                      {piece.date_completed && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{new Date(piece.date_completed).toLocaleDateString()}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Full-size Photo Viewer */}
        {expandedPhoto && (
          <div
            onClick={() => setExpandedPhoto(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 20 }}
          >
            <img src={expandedPhoto} alt="Full size" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8 }} />
          </div>
        )}
      </div>
    </div>
  );
}
