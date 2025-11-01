import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { potteryAPI } from '../utils/api';
import axios from 'axios';
import '../styles/Admin.css';

export default function Admin() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    clay_type: '',
    glaze: '',
    firing_temp: '',
    dimensions: '',
    date_completed: new Date().toISOString().split('T')[0],
    tags: '',
    student_notes: '',
    instructor_notes: '',
    image_url: ''
  });

  // Load customers on mount
  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const { data } = await axios.get('/api/admin/customers');
      setCustomers(data.customers);
    } catch (error) {
      console.error('Failed to load customers:', error);
    }
  };

  const loadCustomerPieces = async (customerId) => {
    try {
      setLoading(true);
      const { data } = await axios.get(`/api/admin/customers/${customerId}/pieces`);
      setPieces(data.pieces || []);
      setSelectedCustomer(customerId);
    } catch (error) {
      console.error('Failed to load pieces:', error);
      setPieces([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedCustomer) {
      alert('Please select a customer first');
      return;
    }

    const newPiece = {
      id: `piece-${Date.now()}`,
      title: formData.title,
      description: formData.description,
      clay_type: formData.clay_type,
      glaze: formData.glaze,
      firing_temp: formData.firing_temp,
      dimensions: formData.dimensions,
      date_completed: formData.date_completed,
      images: formData.image_url ? [formData.image_url] : [],
      tags: formData.tags.split(',').map(t => t.trim()).filter(t => t),
      student_notes: formData.student_notes,
      instructor_notes: formData.instructor_notes,
      is_public: true
    };

    try {
      setLoading(true);
      const updatedPieces = [...pieces, newPiece];
      await axios.post(`/api/admin/customers/${selectedCustomer}/pieces`, {
        pieces: updatedPieces
      });

      setPieces(updatedPieces);
      setShowForm(false);

      // Reset form
      setFormData({
        title: '',
        description: '',
        clay_type: '',
        glaze: '',
        firing_temp: '',
        dimensions: '',
        date_completed: new Date().toISOString().split('T')[0],
        tags: '',
        student_notes: '',
        instructor_notes: '',
        image_url: ''
      });

      alert('Pottery piece added successfully!');
    } catch (error) {
      console.error('Failed to add piece:', error);
      alert('Failed to add pottery piece');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleDeletePiece = async (pieceId) => {
    if (!confirm('Are you sure you want to delete this piece?')) return;

    try {
      setLoading(true);
      const updatedPieces = pieces.filter(p => p.id !== pieceId);
      await axios.post(`/api/admin/customers/${selectedCustomer}/pieces`, {
        pieces: updatedPieces
      });
      setPieces(updatedPieces);
      alert('Piece deleted successfully!');
    } catch (error) {
      console.error('Failed to delete piece:', error);
      alert('Failed to delete piece');
    } finally {
      setLoading(false);
    }
  };

  const selectedCustomerData = customers.find(c => c.id === selectedCustomer);

  return (
    <div className="admin-container">
      <header className="admin-header">
        <div className="header-content">
          <div>
            <h1>VES Pottery Admin</h1>
            <p className="welcome-text">Manage student pottery pieces</p>
          </div>
          <div className="header-actions">
            <button onClick={() => navigate('/admin/classes')} className="btn-secondary">
              Manage Classes
            </button>
            <button onClick={logout} className="btn-logout">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="admin-layout">
        <aside className="customer-sidebar">
          <h2>Students</h2>
          <div className="customer-list">
            {customers.map(customer => (
              <button
                key={customer.id}
                className={`customer-item ${selectedCustomer === customer.id ? 'active' : ''}`}
                onClick={() => loadCustomerPieces(customer.id)}
              >
                <div className="customer-name">
                  {customer.firstName} {customer.lastName}
                </div>
                <div className="customer-email">{customer.email}</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="admin-main">
          {!selectedCustomer ? (
            <div className="empty-state">
              <h2>Select a student to manage their pottery</h2>
            </div>
          ) : (
            <>
              <div className="admin-toolbar">
                <h2>
                  {selectedCustomerData?.firstName} {selectedCustomerData?.lastName}'s Pottery
                </h2>
                <button
                  onClick={() => setShowForm(!showForm)}
                  className="btn-primary"
                >
                  {showForm ? 'Cancel' : '+ Add Pottery Piece'}
                </button>
              </div>

              {showForm && (
                <form onSubmit={handleSubmit} className="pottery-form">
                  <h3>Add New Pottery Piece</h3>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Title *</label>
                      <input
                        name="title"
                        value={formData.title}
                        onChange={handleChange}
                        required
                        placeholder="Blue Celadon Bowl"
                      />
                    </div>

                    <div className="form-group">
                      <label>Date Completed *</label>
                      <input
                        type="date"
                        name="date_completed"
                        value={formData.date_completed}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows="3"
                      placeholder="Describe the piece..."
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Clay Type</label>
                      <input
                        name="clay_type"
                        value={formData.clay_type}
                        onChange={handleChange}
                        placeholder="Stoneware"
                      />
                    </div>

                    <div className="form-group">
                      <label>Glaze</label>
                      <input
                        name="glaze"
                        value={formData.glaze}
                        onChange={handleChange}
                        placeholder="Celadon Blue"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Firing Temperature</label>
                      <input
                        name="firing_temp"
                        value={formData.firing_temp}
                        onChange={handleChange}
                        placeholder="Cone 10"
                      />
                    </div>

                    <div className="form-group">
                      <label>Dimensions</label>
                      <input
                        name="dimensions"
                        value={formData.dimensions}
                        onChange={handleChange}
                        placeholder='6" height x 8" diameter'
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Image URL</label>
                    <input
                      name="image_url"
                      value={formData.image_url}
                      onChange={handleChange}
                      placeholder="https://cdn.shopify.com/..."
                    />
                    <small>Paste a Shopify CDN image URL</small>
                  </div>

                  <div className="form-group">
                    <label>Tags (comma-separated)</label>
                    <input
                      name="tags"
                      value={formData.tags}
                      onChange={handleChange}
                      placeholder="wheel-thrown, beginner, functional"
                    />
                  </div>

                  <div className="form-group">
                    <label>Student Notes</label>
                    <textarea
                      name="student_notes"
                      value={formData.student_notes}
                      onChange={handleChange}
                      rows="2"
                      placeholder="What the student learned..."
                    />
                  </div>

                  <div className="form-group">
                    <label>Instructor Feedback</label>
                    <textarea
                      name="instructor_notes"
                      value={formData.instructor_notes}
                      onChange={handleChange}
                      rows="2"
                      placeholder="Your feedback for the student..."
                    />
                  </div>

                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? 'Adding...' : 'Add Pottery Piece'}
                  </button>
                </form>
              )}

              <div className="pieces-grid">
                {loading && !showForm ? (
                  <div className="loading">Loading pieces...</div>
                ) : pieces.length === 0 ? (
                  <div className="empty-state">
                    <p>No pottery pieces yet. Click "Add Pottery Piece" to get started!</p>
                  </div>
                ) : (
                  pieces.map(piece => (
                    <div key={piece.id} className="piece-card">
                      {piece.images?.[0] && (
                        <img src={piece.images[0]} alt={piece.title} />
                      )}
                      <div className="piece-info">
                        <h4>{piece.title}</h4>
                        <p>{piece.description}</p>
                        <div className="piece-meta">
                          {piece.clay_type && <span>Clay: {piece.clay_type}</span>}
                          {piece.glaze && <span>Glaze: {piece.glaze}</span>}
                        </div>
                        <button
                          onClick={() => handleDeletePiece(piece.id)}
                          className="btn-delete"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
