import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import axios from 'axios';

export default function AdminStudents() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeStudents: 0,
    returningStudents: 0,
    inactiveStudents: 0
  });

  const [courseStats, setCourseStats] = useState({});
  const [topPerformers, setTopPerformers] = useState({
    topReturning: [],
    topActive: [],
    topBooked: []
  });

  // Student lists
  const [activeStudentsList, setActiveStudentsList] = useState([]);
  const [returningStudentsList, setReturningStudentsList] = useState([]);


  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/admin/students/stats');
      setStats(data.stats);
      setCourseStats(data.courseStats);
      setTopPerformers(data.topPerformers);

      // Show all active students regardless of whether they have course identifiers
      setActiveStudentsList(data.activeStudentsList || []);
      setReturningStudentsList(data.returningStudentsList || []);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncFromShopify = async () => {
    try {
      setSyncing(true);
      await axios.post('/api/admin/sync-shopify-customers');
      await loadStats();
      alert('Successfully synced customers from Shopify!');
    } catch (error) {
      console.error('Failed to sync from Shopify:', error);
      alert('Failed to sync customers from Shopify');
    } finally {
      setSyncing(false);
    }
  };

  const viewStudentDetail = (student) => {
    navigate(`/admin/students/${encodeURIComponent(student.email)}`);
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

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-text mb-2">Student Management</h1>
              <p className="text-text-muted">Manage active and returning students</p>
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
        </div>

        {/* Active Students Section */}
        <div className="mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-green-600 text-2xl">check_circle</span>
              <h2 className="text-2xl font-bold text-gray-900">Active Students ({stats.activeStudents})</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">Students currently enrolled in ongoing classes</p>

            {loading ? (
              <p className="text-center text-gray-400 py-12">Loading...</p>
            ) : activeStudentsList.length === 0 ? (
              <p className="text-center text-gray-400 py-12">No active students found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Email</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Course</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Courses Purchased</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeStudentsList.map((student, index) => (
                      <tr
                        key={index}
                        onClick={() => viewStudentDetail(student)}
                        className="border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-medium text-gray-900">{student.name}</td>
                        <td className="py-3 px-4 text-gray-600">{student.email}</td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-sm text-gray-900 bg-gray-100 px-2 py-1 rounded">
                            {student.courseIdentifier || 'N/A'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {student.coursePurchaseCount || 1}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="material-symbols-outlined text-gray-400 text-sm">arrow_forward</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Returning Students Section */}
        <div className="mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-blue-600 text-2xl">repeat</span>
              <h2 className="text-2xl font-bold text-gray-900">Returning Students ({stats.returningStudents})</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">Students who have purchased multiple courses</p>

            {loading ? (
              <p className="text-center text-gray-400 py-12">Loading...</p>
            ) : returningStudentsList.length === 0 ? (
              <p className="text-center text-gray-400 py-12">No returning students found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Email</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Latest Course</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Courses Purchased</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returningStudentsList.map((student, index) => (
                      <tr
                        key={index}
                        onClick={() => viewStudentDetail(student)}
                        className="border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-medium text-gray-900">{student.name}</td>
                        <td className="py-3 px-4 text-gray-600">{student.email}</td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-sm text-gray-900 bg-gray-100 px-2 py-1 rounded">
                            {student.courseIdentifier || 'N/A'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {student.coursePurchaseCount}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="material-symbols-outlined text-gray-400 text-sm">arrow_forward</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
