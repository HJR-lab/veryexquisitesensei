import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import AdminPage from '../components/AdminPage';
import api from '../utils/api';

export default function AdminPausedStudents() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [pausedStudents, setPausedStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resumingId, setResumingId] = useState(null);

  useEffect(() => {
    loadPausedStudents();
  }, []);

  const loadPausedStudents = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/students/paused/list');
      setPausedStudents(data.students || []);
    } catch (error) {
      console.error('Failed to load paused students:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResumeStudent = async (studentId) => {
    if (!confirm('Are you sure you want to resume this student?')) return;

    try {
      setResumingId(studentId);
      await api.post(`/admin/students/${studentId}/resume`);
      // Reload the list
      await loadPausedStudents();
    } catch (error) {
      console.error('Failed to resume student:', error);
      alert('Failed to resume student');
    } finally {
      setResumingId(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const actions = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => navigate('/admin')}
        className="flex items-center gap-2 text-text-muted hover:text-accent transition-colors"
      >
        <span className="material-symbols-outlined">arrow_back</span>
        <span>Back to Dashboard</span>
      </button>
      <button
        onClick={logout}
        className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
      >
        <span className="material-symbols-outlined text-sm">logout</span>
        <span className="hidden sm:inline">Sign Out</span>
      </button>
    </div>
  );

  return (
    <>
      <Navigation />
      <AdminPage
        title="Paused Students"
        subtitle="Students who have paused their courses"
        actions={actions}
      >
        {/* Paused Students List */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-text-muted">Loading...</div>
          ) : pausedStudents.length === 0 ? (
            <div className="p-12 text-center text-text-muted">
              <span className="material-symbols-outlined text-6xl mb-4 block opacity-20">
                pause_circle
              </span>
              <p>No paused students at this time</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Student
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Paused On
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Course Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Course ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pausedStudents.map((student) => (
                    <tr key={student.studentId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <div className="text-sm font-medium text-gray-900">
                            {student.name}
                          </div>
                          <div className="text-sm text-gray-500">{student.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(student.pausedDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Week {student.weeksCompleted} of {student.totalWeeks}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                        <div className="flex flex-col gap-1">
                          <div className="font-medium">{student.courseTitle}</div>
                          <div className="text-xs text-gray-500">
                            {student.weeksRemaining} {student.weeksRemaining === 1 ? 'week' : 'weeks'} remaining
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                        {student.courseIdentifier || 'Not set'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {student.courseType || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleResumeStudent(student.studentId)}
                          disabled={resumingId === student.studentId}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {resumingId === student.studentId ? (
                            <>
                              <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                              <span>Resuming...</span>
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-sm">play_arrow</span>
                              <span>Resume</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </AdminPage>
      <Footer />
    </>
  );
}
