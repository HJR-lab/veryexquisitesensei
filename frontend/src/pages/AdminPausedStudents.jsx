import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import axios from 'axios';

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
      const { data } = await axios.get('/api/admin/paused-students');
      setPausedStudents(data.pausedStudents || []);
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
      await axios.post(`/api/admin/students/${studentId}/resume`);
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

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-text mb-2">Paused Students</h1>
              <p className="text-text-muted">Students who have paused their courses</p>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

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
                      Paused At Week
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Resume Course
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Courses Taken
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pausedStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <div className="text-sm font-medium text-gray-900">
                            {student.first_name} {student.last_name}
                          </div>
                          <div className="text-sm text-gray-500">{student.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(student.pause_start_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Week {student.paused_at_week}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                        {student.pause_reason || 'No reason provided'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                        {student.resume_course_identifier || 'Not set'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {student.course_purchase_count} {student.course_purchase_count === 1 ? 'course' : 'courses'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleResumeStudent(student.id)}
                          disabled={resumingId === student.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {resumingId === student.id ? (
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
      </main>

      <Footer />
    </div>
  );
}
