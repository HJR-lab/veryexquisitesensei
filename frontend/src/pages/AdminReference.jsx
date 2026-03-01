import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminNav from '../components/AdminNav';
import axios from 'axios';

export default function AdminReference() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('clay'); // clay or glazes
  const [loading, setLoading] = useState(false);

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
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load clay types
      const clayRes = await axios.get('/api/reference/clay-types');
      setClayTypes(clayRes.data.clayTypes || []);

      // Load glazes
      const glazeRes = await axios.get('/api/reference/glazes');
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
      setClayForm({
        name: clay.name,
        description: clay.description || '',
        active: clay.active
      });
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
        await axios.put(`/api/admin/clay-types/${editingClay.id}`, clayForm);
      } else {
        await axios.post('/api/admin/clay-types', clayForm);
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
      await axios.put(`/api/admin/clay-types/${clay.id}`, { active: !clay.active });

      setClayTypes(clayTypes.map(c =>
        c.id === clay.id ? { ...c, active: !c.active } : c
      ));
    } catch (error) {
      console.error('Failed to toggle clay type:', error);
      alert('Failed to toggle clay type status');
    }
  };

  const deleteClay = async (clay) => {
    if (!confirm(`Delete clay type "${clay.name}"? This cannot be undone.`)) return;

    try {
      setLoading(true);
      await axios.delete(`/api/admin/clay-types/${clay.id}`);

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
        await axios.put(`/api/admin/glazes/${editingGlaze.id}`, glazeForm);
      } else {
        await axios.post('/api/admin/glazes', glazeForm);
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
      await axios.put(`/api/admin/glazes/${glaze.id}`, { active: !glaze.active });

      setGlazes(glazes.map(g =>
        g.id === glaze.id ? { ...g, active: !g.active } : g
      ));
    } catch (error) {
      console.error('Failed to toggle glaze:', error);
      alert('Failed to toggle glaze status');
    }
  };

  const deleteGlaze = async (glaze) => {
    if (!confirm(`Delete glaze "${glaze.name}"? This cannot be undone.`)) return;

    try {
      setLoading(true);
      await axios.delete(`/api/admin/glazes/${glaze.id}`);

      await loadData();
    } catch (error) {
      console.error('Failed to delete glaze:', error);
      alert('Failed to delete glaze');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AdminNav active="reference" />

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
              <h1 className="text-4xl font-bold text-text mb-2">Reference Data</h1>
              <p className="text-text-muted">Manage clay types and glazes</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab('clay')}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'clay'
                ? 'bg-accent text-white'
                : 'bg-background-alt text-text hover:bg-border'
            }`}
          >
            Clay Types ({clayTypes.length})
          </button>
          <button
            onClick={() => setActiveTab('glazes')}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'glazes'
                ? 'bg-accent text-white'
                : 'bg-background-alt text-text hover:bg-border'
            }`}
          >
            Glazes ({glazes.length})
          </button>
        </div>

        {/* Clay Types Tab */}
        {activeTab === 'clay' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-text">Clay Types</h2>
              <button
                onClick={() => openClayModal()}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>Add Clay Type</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clayTypes.map((clay) => (
                <div
                  key={clay.id}
                  className={`bg-background-alt border rounded-xl p-6 ${
                    clay.active ? 'border-border' : 'border-red-500/30 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-text mb-1">{clay.name}</h3>
                      {clay.description && (
                        <p className="text-sm text-text-muted">{clay.description}</p>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      clay.active
                        ? 'bg-green-500/10 text-green-500'
                        : 'bg-red-500/10 text-red-500'
                    }`}>
                      {clay.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openClayModal(clay)}
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm hover:border-accent transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleClayActive(clay)}
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm hover:border-accent transition-colors"
                    >
                      {clay.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => deleteClay(clay)}
                      className="px-3 py-2 bg-red-500/10 text-red-500 rounded-lg text-sm hover:bg-red-500/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {clayTypes.length === 0 && (
                <div className="col-span-full bg-background-alt border border-border rounded-xl p-12 text-center">
                  <span className="material-symbols-outlined text-6xl text-text-muted mb-4 block">
                    inventory_2
                  </span>
                  <h3 className="text-xl font-bold text-text mb-2">No Clay Types Yet</h3>
                  <p className="text-text-muted mb-6">Add your first clay type to get started</p>
                  <button
                    onClick={() => openClayModal()}
                    className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
                  >
                    Add Clay Type
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Glazes Tab */}
        {activeTab === 'glazes' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-text">Glazes</h2>
              <button
                onClick={() => openGlazeModal()}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>Add Glaze</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {glazes.map((glaze) => (
                <div
                  key={glaze.id}
                  className={`bg-background-alt border rounded-xl p-6 ${
                    glaze.active ? 'border-border' : 'border-red-500/30 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-text">{glaze.name}</h3>
                        {glaze.color && (
                          <div
                            className="w-4 h-4 rounded-full border border-border"
                            style={{ backgroundColor: glaze.color }}
                            title={glaze.color}
                          />
                        )}
                      </div>
                      {glaze.description && (
                        <p className="text-sm text-text-muted mb-2">{glaze.description}</p>
                      )}
                      {glaze.cone && (
                        <p className="text-xs text-text-muted">Cone: {glaze.cone}</p>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      glaze.active
                        ? 'bg-green-500/10 text-green-500'
                        : 'bg-red-500/10 text-red-500'
                    }`}>
                      {glaze.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openGlazeModal(glaze)}
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm hover:border-accent transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleGlazeActive(glaze)}
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm hover:border-accent transition-colors"
                    >
                      {glaze.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => deleteGlaze(glaze)}
                      className="px-3 py-2 bg-red-500/10 text-red-500 rounded-lg text-sm hover:bg-red-500/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {glazes.length === 0 && (
                <div className="col-span-full bg-background-alt border border-border rounded-xl p-12 text-center">
                  <span className="material-symbols-outlined text-6xl text-text-muted mb-4 block">
                    palette
                  </span>
                  <h3 className="text-xl font-bold text-text mb-2">No Glazes Yet</h3>
                  <p className="text-text-muted mb-6">Add your first glaze to get started</p>
                  <button
                    onClick={() => openGlazeModal()}
                    className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
                  >
                    Add Glaze
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Clay Type Modal */}
      {showClayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background-alt border border-border rounded-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-text mb-6">
              {editingClay ? 'Edit Clay Type' : 'Add Clay Type'}
            </h2>

            <form onSubmit={handleClaySubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-2">Name *</label>
                <input
                  type="text"
                  value={clayForm.name}
                  onChange={(e) => setClayForm({ ...clayForm, name: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                  placeholder="e.g., Stoneware"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">Description</label>
                <textarea
                  value={clayForm.description}
                  onChange={(e) => setClayForm({ ...clayForm, description: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                  rows="3"
                  placeholder="Optional description..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="clay-active"
                  checked={clayForm.active}
                  onChange={(e) => setClayForm({ ...clayForm, active: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="clay-active" className="text-sm text-text">Active</label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowClayModal(false)}
                  className="flex-1 px-4 py-2 bg-border text-text rounded-lg hover:bg-border/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Saving...' : editingClay ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Glaze Modal */}
      {showGlazeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background-alt border border-border rounded-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-text mb-6">
              {editingGlaze ? 'Edit Glaze' : 'Add Glaze'}
            </h2>

            <form onSubmit={handleGlazeSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-2">Name *</label>
                <input
                  type="text"
                  value={glazeForm.name}
                  onChange={(e) => setGlazeForm({ ...glazeForm, name: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                  placeholder="e.g., Celadon Blue"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">Description</label>
                <textarea
                  value={glazeForm.description}
                  onChange={(e) => setGlazeForm({ ...glazeForm, description: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                  rows="2"
                  placeholder="Optional description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Color Code</label>
                  <input
                    type="color"
                    value={glazeForm.color}
                    onChange={(e) => setGlazeForm({ ...glazeForm, color: e.target.value })}
                    className="w-full h-10 bg-background border border-border rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text mb-2">Cone</label>
                  <input
                    type="text"
                    value={glazeForm.cone}
                    onChange={(e) => setGlazeForm({ ...glazeForm, cone: e.target.value })}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                    placeholder="e.g., Cone 10"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="glaze-active"
                  checked={glazeForm.active}
                  onChange={(e) => setGlazeForm({ ...glazeForm, active: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="glaze-active" className="text-sm text-text">Active</label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowGlazeModal(false)}
                  className="flex-1 px-4 py-2 bg-border text-text rounded-lg hover:bg-border/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
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
