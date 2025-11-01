import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import axios from 'axios';

export default function AdminStudents() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, student, member
  const [syncing, setSyncing] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalStudents: 0,
    newStudents: 0,
    returningStudents: 0,
    totalMembers: 0
  });

  // Student detail data
  const [studentPieces, setStudentPieces] = useState([]);
  const [studentBookings, setStudentBookings] = useState([]);
  const [studentMembership, setStudentMembership] = useState(null);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    customer_type: 'student',
    classes_allocated: 0,
    classes_used: 0
  });

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/admin/customers');
      setStudents(data.customers);

      // Calculate stats
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

      const newStudents = data.customers.filter(s =>
        new Date(s.created_at) >= thirtyDaysAgo
      ).length;

      const totalMembers = data.customers.filter(s =>
        s.customer_type === 'member'
      ).length;

      setStats({
        totalStudents: data.customers.length,
        newStudents,
        returningStudents: data.customers.length - newStudents,
        totalMembers
      });
    } catch (error) {
      console.error('Failed to load students:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncFromShopify = async () => {
    try {
      setSyncing(true);
      await axios.post('/api/admin/sync-shopify-customers');
      await loadStudents();
      alert('Successfully synced customers from Shopify!');
    } catch (error) {
      console.error('Failed to sync from Shopify:', error);
      alert('Failed to sync customers from Shopify');
    } finally {
      setSyncing(false);
    }
  };

  const loadStudentDetails = async (student) => {
    try {
      setLoading(true);
      setSelectedStudent(student);

      // Load pieces
      const piecesRes = await axios.get(`/api/admin/customers/${student.id}/pieces`);
      setStudentPieces(piecesRes.data.pieces || []);

      // TODO: Load bookings and membership when endpoints are ready
      setStudentBookings([]);
      setStudentMembership(null);

    } catch (error) {
      console.error('Failed to load student details:', error);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (student) => {
    setEditForm({
      first_name: student.firstName || '',
      last_name: student.lastName || '',
      email: student.email || '',
      customer_type: student.customer_type || 'student',
      classes_allocated: student.classes_allocated || 0,
      classes_used: student.classes_used || 0
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await axios.put(`/api/admin/customers/${selectedStudent.dbId}`, editForm);

      setShowEditModal(false);
      await loadStudents();

      // Reload selected student details
      const updatedStudent = students.find(s => s.dbId === selectedStudent.dbId);
      if (updatedStudent) {
        await loadStudentDetails(updatedStudent);
      }
    } catch (error) {
      console.error('Failed to update student:', error);
      alert('Failed to update student');
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(student => {
    const matchesSearch =
      student.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterType === 'all' ||
      (filterType === 'member' && student.customer_type === 'member') ||
      (filterType === 'student' && student.customer_type === 'student');

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />

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

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-text mb-2">Student Management</h1>
              <p className="text-text-muted">{stats.totalStudents} total students</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={syncFromShopify}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">{syncing ? 'sync' : 'cloud_sync'}</span>
                <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Sync Shopify'}</span>
              </button>
              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">logout</span>
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-gray-700 text-xl">group</span>
                <h3 className="text-sm font-semibold text-gray-900">Total Students</h3>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalStudents}</p>
              <p className="text-xs text-gray-500 mt-1">All registered students</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-gray-700 text-xl">person_add</span>
                <h3 className="text-sm font-semibold text-gray-900">New Students</h3>
              </div>
              <p className="text-2xl font-bold text-green-600">{stats.newStudents}</p>
              <p className="text-xs text-gray-500 mt-1">Last 30 days</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-gray-700 text-xl">repeat</span>
                <h3 className="text-sm font-semibold text-gray-900">Returning</h3>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.returningStudents}</p>
              <p className="text-xs text-gray-500 mt-1">Before 30 days</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-gray-700 text-xl">card_membership</span>
                <h3 className="text-sm font-semibold text-gray-900">Members</h3>
              </div>
              <p className="text-2xl font-bold text-pink-500">{stats.totalMembers}</p>
              <p className="text-xs text-gray-500 mt-1">Active memberships</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Student List */}
          <div className="lg:col-span-1">
            <div className="bg-background-alt border border-border rounded-xl p-6 sticky top-4">
              <h2 className="text-xl font-bold text-text mb-4">Students</h2>

              {/* Search & Filter */}
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
                  />
                </div>

                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
                >
                  <option value="all">All Types</option>
                  <option value="student">Students Only</option>
                  <option value="member">Members Only</option>
                </select>
              </div>

              {/* Student List */}
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {loading && !selectedStudent ? (
                  <p className="text-center text-text-muted py-8">Loading...</p>
                ) : filteredStudents.length === 0 ? (
                  <p className="text-center text-text-muted py-8">No students found</p>
                ) : (
                  filteredStudents.map((student) => (
                    <button
                      key={student.dbId}
                      onClick={() => loadStudentDetails(student)}
                      className={`w-full text-left p-4 rounded-lg border transition-all ${
                        selectedStudent?.dbId === student.dbId
                          ? 'bg-accent/10 border-accent'
                          : 'bg-background border-border hover:border-accent/50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-text truncate">
                            {student.firstName} {student.lastName}
                          </h3>
                          <p className="text-sm text-text-muted truncate">{student.email}</p>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          student.customer_type === 'member'
                            ? 'bg-pink-500/10 text-pink-500'
                            : 'bg-blue-500/10 text-blue-500'
                        }`}>
                          {student.customer_type || 'student'}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Student Detail */}
          <div className="lg:col-span-2">
            {!selectedStudent ? (
              <div className="bg-background-alt border border-border rounded-xl p-12 text-center">
                <span className="material-symbols-outlined text-6xl text-text-muted mb-4 block">
                  person_search
                </span>
                <h3 className="text-xl font-bold text-text mb-2">Select a Student</h3>
                <p className="text-text-muted">Choose a student from the list to view details</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Student Info Card */}
                <div className="bg-background-alt border border-border rounded-xl p-6">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-text mb-2">
                        {selectedStudent.firstName} {selectedStudent.lastName}
                      </h2>
                      <p className="text-text-muted">{selectedStudent.email}</p>
                    </div>
                    <button
                      onClick={() => openEditModal(selectedStudent)}
                      className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>
                      <span>Edit</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-background rounded-lg p-4">
                      <p className="text-xs text-text-muted mb-1">Type</p>
                      <p className="font-bold text-text capitalize">{selectedStudent.customer_type || 'Student'}</p>
                    </div>
                    <div className="bg-background rounded-lg p-4">
                      <p className="text-xs text-text-muted mb-1">Allocated</p>
                      <p className="font-bold text-text">{selectedStudent.classes_allocated || 0}</p>
                    </div>
                    <div className="bg-background rounded-lg p-4">
                      <p className="text-xs text-text-muted mb-1">Used</p>
                      <p className="font-bold text-text">{selectedStudent.classes_used || 0}</p>
                    </div>
                    <div className="bg-background rounded-lg p-4">
                      <p className="text-xs text-text-muted mb-1">Forfeited</p>
                      <p className="font-bold text-red-500">{selectedStudent.classes_forfeited || 0}</p>
                    </div>
                  </div>
                </div>

                {/* Pottery Gallery */}
                <div className="bg-background-alt border border-border rounded-xl p-6">
                  <h3 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined">photo_library</span>
                    <span>Pottery Gallery ({studentPieces.length})</span>
                  </h3>

                  {studentPieces.length === 0 ? (
                    <p className="text-center text-text-muted py-8">No pottery pieces yet</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {studentPieces.map((piece) => (
                        <div
                          key={piece.id}
                          className="bg-background rounded-lg border border-border overflow-hidden hover:border-accent transition-colors cursor-pointer"
                        >
                          <div
                            className="aspect-square bg-cover bg-center"
                            style={{ backgroundImage: `url('${piece.images?.[0] || 'https://via.placeholder.com/300'}')` }}
                          ></div>
                          <div className="p-3">
                            <h4 className="font-bold text-text text-sm truncate">{piece.title}</h4>
                            <p className="text-xs text-text-muted truncate">{piece.clay_type}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bookings */}
                <div className="bg-background-alt border border-border rounded-xl p-6">
                  <h3 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined">event_available</span>
                    <span>Bookings & Attendance</span>
                  </h3>
                  <p className="text-center text-text-muted py-8">Coming soon...</p>
                </div>

                {/* Membership */}
                <div className="bg-background-alt border border-border rounded-xl p-6">
                  <h3 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined">card_membership</span>
                    <span>Membership</span>
                  </h3>
                  <p className="text-center text-text-muted py-8">
                    {selectedStudent.customer_type === 'member' ? 'Membership details coming soon...' : 'No active membership'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background-alt border border-border rounded-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-text mb-6">Edit Student</h2>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-2">First Name</label>
                <input
                  type="text"
                  value={editForm.first_name}
                  onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">Last Name</label>
                <input
                  type="text"
                  value={editForm.last_name}
                  onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">Type</label>
                <select
                  value={editForm.customer_type}
                  onChange={(e) => setEditForm({ ...editForm, customer_type: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                >
                  <option value="student">Student</option>
                  <option value="member">Member</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Classes Allocated</label>
                  <input
                    type="number"
                    value={editForm.classes_allocated}
                    onChange={(e) => setEditForm({ ...editForm, classes_allocated: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text mb-2">Classes Used</label>
                  <input
                    type="number"
                    value={editForm.classes_used}
                    onChange={(e) => setEditForm({ ...editForm, classes_used: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                    min="0"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 bg-border text-text rounded-lg hover:bg-border/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
