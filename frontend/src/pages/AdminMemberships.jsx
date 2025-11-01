import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import axios from 'axios';

export default function AdminMemberships() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [memberships, setMemberships] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all'); // all, active, expired
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMembership, setSelectedMembership] = useState(null);

  const [createForm, setCreateForm] = useState({
    customerId: '',
    membershipType: '3 Month',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    perks: {}
  });

  const membershipPerks = {
    '3 Month': {
      'Studio Access': '3 months unlimited access',
      'Dedicated Storage': 'Secure storage space',
      'Studio Glazes': 'Access to all glazes',
      '5% Discount': 'On clay and tools'
    },
    '6 Month': {
      'Studio Access': '6 months unlimited access',
      'Dedicated Storage': 'Secure storage space',
      'Studio Glazes': 'Access to all glazes',
      'FREE $65 Firing Basket': 'Complimentary firing credits',
      '10% Discount': 'On clay, tools, and firings'
    },
    '12 Month': {
      'Unlimited Studio Access': '12 months 7 days a week',
      'Free Dedicated Storage': 'Secure storage for your work',
      'Studio-Assisted Clay Reclaim': 'Clay recycling service',
      'FREE $130 Firing Basket': 'Complimentary firing credits',
      'All Studio Glazes Included': 'Access to professional glazes',
      '10% Discount': 'On clay, tools, and additional firings'
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load memberships
      const membershipsRes = await axios.get('/api/admin/memberships');
      setMemberships(membershipsRes.data.memberships || []);

      // Load students for dropdown
      const studentsRes = await axios.get('/api/admin/customers');
      setStudents(studentsRes.data.customers);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);

      await axios.post('/api/admin/memberships', {
        customerId: parseInt(createForm.customerId),
        membershipType: createForm.membershipType,
        startDate: createForm.startDate,
        endDate: createForm.endDate,
        perks: createForm.perks,
        status: 'active'
      });

      setShowCreateModal(false);
      setCreateForm({
        customerId: '',
        membershipType: '3 Month',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        perks: {}
      });
      await loadData();
    } catch (error) {
      console.error('Failed to create membership:', error);
      alert('Failed to create membership');
    } finally {
      setLoading(false);
    }
  };

  const handleMembershipTypeChange = (type) => {
    const start = new Date(createForm.startDate);
    const months = parseInt(type.split(' ')[0]);
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);

    setCreateForm({
      ...createForm,
      membershipType: type,
      endDate: end.toISOString().split('T')[0],
      perks: membershipPerks[type]
    });
  };

  const filteredMemberships = memberships.filter(m => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'active') return m.status === 'active';
    if (filterStatus === 'expired') return m.status === 'expired';
    return true;
  });

  const getStatusBadge = (membership) => {
    const endDate = new Date(membership.endDate);
    const today = new Date();
    const daysRemaining = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

    if (membership.status === 'cancelled') {
      return <span className="px-3 py-1 bg-gray-500/10 text-gray-500 rounded-full text-xs font-medium">Cancelled</span>;
    }
    if (daysRemaining < 0) {
      return <span className="px-3 py-1 bg-red-500/10 text-red-500 rounded-full text-xs font-medium">Expired</span>;
    }
    if (daysRemaining <= 30) {
      return <span className="px-3 py-1 bg-orange-500/10 text-orange-500 rounded-full text-xs font-medium">Expiring Soon</span>;
    }
    return <span className="px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-medium">Active</span>;
  };

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

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-text mb-2">Membership Management</h1>
              <p className="text-text-muted">{memberships.length} total memberships</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>Create Membership</span>
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
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-background-alt border border-border rounded-xl p-6">
            <p className="text-sm text-text-muted mb-1">Active</p>
            <p className="text-3xl font-bold text-green-500">
              {memberships.filter(m => m.status === 'active').length}
            </p>
          </div>
          <div className="bg-background-alt border border-border rounded-xl p-6">
            <p className="text-sm text-text-muted mb-1">Expiring Soon</p>
            <p className="text-3xl font-bold text-orange-500">0</p>
          </div>
          <div className="bg-background-alt border border-border rounded-xl p-6">
            <p className="text-sm text-text-muted mb-1">Expired</p>
            <p className="text-3xl font-bold text-red-500">
              {memberships.filter(m => m.status === 'expired').length}
            </p>
          </div>
          <div className="bg-background-alt border border-border rounded-xl p-6">
            <p className="text-sm text-text-muted mb-1">Total Revenue</p>
            <p className="text-3xl font-bold text-accent">$--</p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 bg-background-alt border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          >
            <option value="all">All Memberships</option>
            <option value="active">Active Only</option>
            <option value="expired">Expired Only</option>
          </select>
        </div>

        {/* Memberships List */}
        <div className="bg-background-alt border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <p className="text-text-muted">Loading memberships...</p>
            </div>
          ) : filteredMemberships.length === 0 ? (
            <div className="p-12 text-center">
              <span className="material-symbols-outlined text-6xl text-text-muted mb-4 block">
                card_membership
              </span>
              <h3 className="text-xl font-bold text-text mb-2">No Memberships Yet</h3>
              <p className="text-text-muted mb-6">Create your first membership to get started</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
              >
                Create Membership
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background border-b border-border">
                  <tr>
                    <th className="text-left p-4 text-sm font-medium text-text-muted">Student</th>
                    <th className="text-left p-4 text-sm font-medium text-text-muted">Type</th>
                    <th className="text-left p-4 text-sm font-medium text-text-muted">Start Date</th>
                    <th className="text-left p-4 text-sm font-medium text-text-muted">End Date</th>
                    <th className="text-left p-4 text-sm font-medium text-text-muted">Days Left</th>
                    <th className="text-left p-4 text-sm font-medium text-text-muted">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMemberships.map((membership) => {
                    const daysLeft = Math.ceil((new Date(membership.endDate) - new Date()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={membership.id} className="border-b border-border hover:bg-background/50 transition-colors">
                        <td className="p-4">
                          <div>
                            <p className="font-medium text-text">{membership.studentName}</p>
                            <p className="text-sm text-text-muted">{membership.studentEmail}</p>
                          </div>
                        </td>
                        <td className="p-4 text-text">{membership.type}</td>
                        <td className="p-4 text-text">{membership.startDate}</td>
                        <td className="p-4 text-text">{membership.endDate}</td>
                        <td className="p-4">
                          <span className={daysLeft < 0 ? 'text-red-500' : daysLeft <= 30 ? 'text-orange-500' : 'text-text'}>
                            {daysLeft < 0 ? 'Expired' : `${daysLeft} days`}
                          </span>
                        </td>
                        <td className="p-4">{getStatusBadge(membership)}</td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setSelectedMembership(membership);
                                setShowEditModal(true);
                              }}
                              className="p-2 hover:bg-background rounded-lg transition-colors"
                              title="Edit"
                            >
                              <span className="material-symbols-outlined text-sm text-accent">edit</span>
                            </button>
                            <button
                              className="p-2 hover:bg-background rounded-lg transition-colors"
                              title="View Details"
                            >
                              <span className="material-symbols-outlined text-sm text-text">visibility</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Create Membership Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background-alt border border-border rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-text mb-6">Create Membership</h2>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-2">Student *</label>
                <select
                  value={createForm.customerId}
                  onChange={(e) => setCreateForm({ ...createForm, customerId: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                  required
                >
                  <option value="">Select a student...</option>
                  {students.map(student => (
                    <option key={student.dbId} value={student.dbId}>
                      {student.firstName} {student.lastName} ({student.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">Membership Type *</label>
                <div className="grid grid-cols-3 gap-3">
                  {['3 Month', '6 Month', '12 Month'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleMembershipTypeChange(type)}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        createForm.membershipType === type
                          ? 'border-accent bg-accent/10'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <p className="font-bold text-text mb-1">{type}</p>
                      <p className="text-xs text-text-muted">
                        ${type === '3 Month' ? '150' : type === '6 Month' ? '280' : '500'}/total
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Start Date *</label>
                  <input
                    type="date"
                    value={createForm.startDate}
                    onChange={(e) => {
                      setCreateForm({ ...createForm, startDate: e.target.value });
                      handleMembershipTypeChange(createForm.membershipType);
                    }}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text mb-2">End Date</label>
                  <input
                    type="date"
                    value={createForm.endDate}
                    readOnly
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text opacity-60 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">Membership Perks</label>
                <div className="bg-background rounded-lg p-4 space-y-2">
                  {Object.entries(createForm.perks).map(([perk, description]) => (
                    <div key={perk} className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-accent text-sm mt-0.5">check_circle</span>
                      <div>
                        <p className="font-medium text-text text-sm">{perk}</p>
                        <p className="text-xs text-text-muted">{description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-border text-text rounded-lg hover:bg-border/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Membership'}
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
