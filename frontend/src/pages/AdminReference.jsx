import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const labelSt = { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' };
const inputSt = { width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' };

export default function AdminReference() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('clay');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Clay Types
  const [clayTypes, setClayTypes] = useState([]);
  const [showClayModal, setShowClayModal] = useState(false);
  const [editingClay, setEditingClay] = useState(null);
  const [clayForm, setClayForm] = useState({ name: '', description: '', active: true });

  // Glazes
  const [glazes, setGlazes] = useState([]);
  const [showGlazeModal, setShowGlazeModal] = useState(false);
  const [editingGlaze, setEditingGlaze] = useState(null);
  const [glazeForm, setGlazeForm] = useState({
    name: '',
    description: '',
    color: '',
    cone: '',
    active: true
  });

  useEffect(() => {
    loadData();
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [clayRes, glazeRes] = await Promise.all([
        api.get('/reference/clay-types'),
        api.get('/reference/glazes'),
      ]);
      setClayTypes(clayRes.data.clayTypes || []);
      setGlazes(glazeRes.data.glazes || []);
    } catch (error) {
      console.error('Failed to load reference data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Clay Type Functions
  const openClayModal = (clay = null) => {
    if (clay) {
      setEditingClay(clay);
      setClayForm({ name: clay.name, description: clay.description || '', active: clay.active });
    } else {
      setEditingClay(null);
      setClayForm({ name: '', description: '', active: true });
    }
    setShowClayModal(true);
  };

  const handleClaySubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (editingClay) {
        await api.put(`/admin/clay-types/${editingClay.id}`, clayForm);
      } else {
        await api.post('/admin/clay-types', clayForm);
      }
      setShowClayModal(false);
      await loadData();
    } catch (error) {
      console.error('Failed to save clay type:', error);
      alert('Failed to save clay type');
    } finally {
      setLoading(false);
    }
  };

  const toggleClayActive = async (clay) => {
    try {
      await api.put(`/admin/clay-types/${clay.id}`, { active: !clay.active });
      setClayTypes(clayTypes.map(c => c.id === clay.id ? { ...c, active: !c.active } : c));
    } catch (error) {
      console.error('Failed to toggle clay type:', error);
      alert('Failed to toggle clay type status');
    }
  };

  const deleteClay = async (clay) => {
    if (!confirm(`Delete clay type "${clay.name}"? This cannot be undone.`)) return;
    try {
      setLoading(true);
      await api.delete(`/admin/clay-types/${clay.id}`);
      await loadData();
    } catch (error) {
      console.error('Failed to delete clay type:', error);
      alert('Failed to delete clay type');
    } finally {
      setLoading(false);
    }
  };

  // Glaze Functions
  const openGlazeModal = (glaze = null) => {
    if (glaze) {
      setEditingGlaze(glaze);
      setGlazeForm({
        name: glaze.name,
        description: glaze.description || '',
        color: glaze.color || '',
        cone: glaze.cone || '',
        active: glaze.active
      });
    } else {
      setEditingGlaze(null);
      setGlazeForm({ name: '', description: '', color: '', cone: '', active: true });
    }
    setShowGlazeModal(true);
  };

  const handleGlazeSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (editingGlaze) {
        await api.put(`/admin/glazes/${editingGlaze.id}`, glazeForm);
      } else {
        await api.post('/admin/glazes', glazeForm);
      }
      setShowGlazeModal(false);
      await loadData();
    } catch (error) {
      console.error('Failed to save glaze:', error);
      alert('Failed to save glaze');
    } finally {
      setLoading(false);
    }
  };

  const toggleGlazeActive = async (glaze) => {
    try {
      await api.put(`/admin/glazes/${glaze.id}`, { active: !glaze.active });
      setGlazes(glazes.map(g => g.id === glaze.id ? { ...g, active: !g.active } : g));
    } catch (error) {
      console.error('Failed to toggle glaze:', error);
      alert('Failed to toggle glaze status');
    }
  };

  const deleteGlaze = async (glaze) => {
    if (!confirm(`Delete glaze "${glaze.name}"? This cannot be undone.`)) return;
    try {
      setLoading(true);
      await api.delete(`/admin/glazes/${glaze.id}`);
      await loadData();
    } catch (error) {
      console.error('Failed to delete glaze:', error);
      alert('Failed to delete glaze');
    } finally {
      setLoading(false);
    }
  };

  const btnSt = {
    padding: '7px 14px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'inherit',
    border: `1px solid ${RULE}`,
    backgroundColor: '#FFFFFF',
    color: INK,
    cursor: 'pointer',
  };

  const btnAccentSt = {
    ...btnSt,
    backgroundColor: TC,
    color: '#FFFFFF',
    border: `1px solid ${TC}`,
  };

  const btnDangerSt = {
    ...btnSt,
    color: '#DC2626',
    border: '1px solid rgba(220,38,38,0.2)',
    backgroundColor: 'rgba(220,38,38,0.05)',
  };

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: isMobile ? '20px 16px 60px' : '32px 24px 60px' }}>

        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>
            Admin
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>
              Reference Data
            </h1>
            <button
              onClick={() => activeTab === 'clay' ? openClayModal() : openGlazeModal()}
              style={btnAccentSt}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
                Add {activeTab === 'clay' ? 'Clay Type' : 'Glaze'}
              </span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0', borderBottom: `1px solid ${RULE}`, marginBottom: '24px' }}>
          {[
            { key: 'clay', label: `Clay Types (${clayTypes.length})` },
            { key: 'glazes', label: `Glazes (${glazes.length})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 20px',
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: 'inherit',
                letterSpacing: '0.02em',
                border: 'none',
                borderBottom: activeTab === tab.key ? `2px solid ${TC}` : '2px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === tab.key ? TC : MUTED,
                cursor: 'pointer',
                transition: 'color 0.1s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Clay Types Tab */}
        {activeTab === 'clay' && (
          <div>
            {clayTypes.length === 0 ? (
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', padding: '48px 24px', textAlign: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '40px', color: MUTED, display: 'block', marginBottom: '12px' }}>inventory_2</span>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>No Clay Types Yet</div>
                <div style={{ fontSize: '12px', color: MUTED, marginBottom: '16px' }}>Add your first clay type to get started</div>
                <button onClick={() => openClayModal()} style={btnAccentSt}>Add Clay Type</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}` }}>
                {clayTypes.map(clay => (
                  <div
                    key={clay.id}
                    style={{
                      backgroundColor: '#FFFFFF',
                      padding: '16px 18px',
                      opacity: clay.active ? 1 : 0.55,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '3px' }}>{clay.name}</div>
                        {clay.description && (
                          <div style={{ fontSize: '11px', color: MUTED, lineHeight: 1.4 }}>{clay.description}</div>
                        )}
                      </div>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        padding: '2px 6px',
                        backgroundColor: clay.active ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.08)',
                        color: clay.active ? '#059669' : '#DC2626',
                      }}>
                        {clay.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                      <button onClick={() => openClayModal(clay)} style={{ ...btnSt, flex: 1, padding: '5px 10px', fontSize: '11px' }}>Edit</button>
                      <button onClick={() => toggleClayActive(clay)} style={{ ...btnSt, flex: 1, padding: '5px 10px', fontSize: '11px' }}>
                        {clay.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => deleteClay(clay)} style={{ ...btnDangerSt, padding: '5px 10px', fontSize: '11px' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Glazes Tab */}
        {activeTab === 'glazes' && (
          <div>
            {glazes.length === 0 ? (
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', padding: '48px 24px', textAlign: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '40px', color: MUTED, display: 'block', marginBottom: '12px' }}>palette</span>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>No Glazes Yet</div>
                <div style={{ fontSize: '12px', color: MUTED, marginBottom: '16px' }}>Add your first glaze to get started</div>
                <button onClick={() => openGlazeModal()} style={btnAccentSt}>Add Glaze</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}` }}>
                {glazes.map(glaze => (
                  <div
                    key={glaze.id}
                    style={{
                      backgroundColor: '#FFFFFF',
                      padding: '16px 18px',
                      opacity: glaze.active ? 1 : 0.55,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700 }}>{glaze.name}</span>
                          {glaze.color && (
                            <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: glaze.color, border: `1px solid ${RULE}`, display: 'inline-block', flexShrink: 0 }} />
                          )}
                        </div>
                        {glaze.description && (
                          <div style={{ fontSize: '11px', color: MUTED, lineHeight: 1.4, marginBottom: '2px' }}>{glaze.description}</div>
                        )}
                        {glaze.cone && (
                          <div style={{ fontSize: '10px', color: MUTED }}>Cone: {glaze.cone}</div>
                        )}
                      </div>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        padding: '2px 6px',
                        backgroundColor: glaze.active ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.08)',
                        color: glaze.active ? '#059669' : '#DC2626',
                      }}>
                        {glaze.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                      <button onClick={() => openGlazeModal(glaze)} style={{ ...btnSt, flex: 1, padding: '5px 10px', fontSize: '11px' }}>Edit</button>
                      <button onClick={() => toggleGlazeActive(glaze)} style={{ ...btnSt, flex: 1, padding: '5px 10px', fontSize: '11px' }}>
                        {glaze.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => deleteGlaze(glaze)} style={{ ...btnDangerSt, padding: '5px 10px', fontSize: '11px' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Clay Type Modal */}
      {showClayModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, maxWidth: '420px', width: '100%', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', margin: '0 0 20px' }}>
              {editingClay ? 'Edit Clay Type' : 'Add Clay Type'}
            </h2>
            <form onSubmit={handleClaySubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelSt}>Name *</label>
                <input
                  type="text"
                  value={clayForm.name}
                  onChange={(e) => setClayForm({ ...clayForm, name: e.target.value })}
                  style={inputSt}
                  placeholder="e.g., Stoneware"
                  required
                />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelSt}>Description</label>
                <textarea
                  value={clayForm.description}
                  onChange={(e) => setClayForm({ ...clayForm, description: e.target.value })}
                  style={{ ...inputSt, minHeight: '70px', resize: 'vertical' }}
                  placeholder="Optional description..."
                />
              </div>
              <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="clay-active"
                  checked={clayForm.active}
                  onChange={(e) => setClayForm({ ...clayForm, active: e.target.checked })}
                />
                <label htmlFor="clay-active" style={{ fontSize: '12px' }}>Active</label>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setShowClayModal(false)} style={{ ...btnSt, flex: 1 }}>Cancel</button>
                <button type="submit" disabled={loading} style={{ ...btnAccentSt, flex: 1, opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Saving...' : editingClay ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Glaze Modal */}
      {showGlazeModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, maxWidth: '420px', width: '100%', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', margin: '0 0 20px' }}>
              {editingGlaze ? 'Edit Glaze' : 'Add Glaze'}
            </h2>
            <form onSubmit={handleGlazeSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelSt}>Name *</label>
                <input
                  type="text"
                  value={glazeForm.name}
                  onChange={(e) => setGlazeForm({ ...glazeForm, name: e.target.value })}
                  style={inputSt}
                  placeholder="e.g., Celadon Blue"
                  required
                />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelSt}>Description</label>
                <textarea
                  value={glazeForm.description}
                  onChange={(e) => setGlazeForm({ ...glazeForm, description: e.target.value })}
                  style={{ ...inputSt, minHeight: '50px', resize: 'vertical' }}
                  placeholder="Optional description..."
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={labelSt}>Color</label>
                  <input
                    type="color"
                    value={glazeForm.color || '#C4622D'}
                    onChange={(e) => setGlazeForm({ ...glazeForm, color: e.target.value })}
                    style={{ width: '100%', height: '36px', border: `1px solid ${RULE}`, padding: '2px', cursor: 'pointer', backgroundColor: '#FFFFFF' }}
                  />
                </div>
                <div>
                  <label style={labelSt}>Cone</label>
                  <input
                    type="text"
                    value={glazeForm.cone}
                    onChange={(e) => setGlazeForm({ ...glazeForm, cone: e.target.value })}
                    style={inputSt}
                    placeholder="e.g., Cone 10"
                  />
                </div>
              </div>
              <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="glaze-active"
                  checked={glazeForm.active}
                  onChange={(e) => setGlazeForm({ ...glazeForm, active: e.target.checked })}
                />
                <label htmlFor="glaze-active" style={{ fontSize: '12px' }}>Active</label>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setShowGlazeModal(false)} style={{ ...btnSt, flex: 1 }}>Cancel</button>
                <button type="submit" disabled={loading} style={{ ...btnAccentSt, flex: 1, opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Saving...' : editingGlaze ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
