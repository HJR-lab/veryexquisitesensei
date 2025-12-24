import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import api from '../utils/api';

export default function StudentClassHistory() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ totalClasses: 0, attendedClasses: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [coursePieces, setCoursePieces] = useState([]);
  const [showPiecesModal, setShowPiecesModal] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const response = await api.get('/classes/my-history');
      setHistory(response.data.history);
      setStats({
        totalClasses: response.data.totalClasses,
        attendedClasses: response.data.attendedClasses
      });
    } catch (error) {
      console.error('Failed to load class history:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCoursePieces = async (courseId) => {
    try {
      const response = await api.get(`/pottery/by-course/${courseId}`);
      setCoursePieces(response.data.pieces);
      setSelectedCourse(response.data.course);
      setShowPiecesModal(true);
    } catch (error) {
      console.error('Failed to load course pieces:', error);
      alert('Failed to load gallery pieces for this course');
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (timeStr) => {
    return timeStr;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'current':
        return 'bg-green-500/10 text-green-700 border-green-500';
      case 'completed':
        return 'bg-blue-500/10 text-blue-700 border-blue-500';
      case 'upcoming':
        return 'bg-orange-500/10 text-orange-700 border-orange-500';
      case 'past':
        return 'bg-gray-500/10 text-gray-700 border-gray-500';
      default:
        return 'bg-gray-500/10 text-gray-700 border-gray-500';
    }
  };

  // Separate current and past courses
  const currentCourses = history.filter(h => h.status === 'current' || h.status === 'upcoming');
  const pastCourses = history.filter(h => h.status === 'completed' || h.status === 'past');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-text-muted hover:text-accent transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              <span>Back to Home</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-text mb-2">My Class History</h1>
              <p className="text-text-muted">
                {stats.attendedClasses} of {stats.totalClasses} classes attended
                {stats.totalClasses > 0 && ` (${Math.round((stats.attendedClasses / stats.totalClasses) * 100)}%)`}
              </p>
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

        {loading ? (
          <div className="text-center py-12">
            <p className="text-text-muted">Loading class history...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="bg-background-alt border border-border rounded-xl p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-text-muted mb-4 block">
              school
            </span>
            <h3 className="text-xl font-bold text-text mb-2">No Classes Yet</h3>
            <p className="text-text-muted mb-6">You haven't enrolled in any courses yet</p>
            <button
              onClick={() => navigate('/classes')}
              className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
            >
              Browse Classes
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Current Courses */}
            {currentCourses.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-text mb-4">
                  Current Courses ({currentCourses.length})
                </h2>
                <div className="grid gap-4">
                  {currentCourses.map((course) => (
                    <div
                      key={course.id}
                      className={`bg-background-alt border rounded-xl p-6 ${getStatusColor(course.status)}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          {course.type === 'course' ? (
                            <>
                              <h3 className="text-xl font-bold text-text mb-2">
                                {course.courseTitle}
                              </h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-text-muted mb-4">
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-sm">calendar_month</span>
                                  <span>{formatDate(course.startDate)} - {formatDate(course.endDate)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-sm">person</span>
                                  <span>Instructor: {course.instructor}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-sm">event</span>
                                  <span>{course.numberOfWeeks}-Week Course</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-sm">check_circle</span>
                                  <span>
                                    {course.classes.filter(c => c.attended).length} / {course.classes.length} attended
                                  </span>
                                </div>
                              </div>

                              {/* Class List */}
                              <div className="mt-4">
                                <h4 className="text-sm font-semibold text-text mb-2">Classes:</h4>
                                <div className="grid gap-2">
                                  {course.classes.map((cls) => {
                                    const isPast = new Date(cls.date) < new Date();
                                    return (
                                      <div
                                        key={cls.id}
                                        className="flex items-center justify-between p-3 bg-background rounded-lg"
                                      >
                                        <div className="flex items-center gap-3">
                                          <span className={`material-symbols-outlined text-sm ${
                                            cls.attended ? 'text-green-500' : isPast ? 'text-red-500' : 'text-gray-400'
                                          }`}>
                                            {cls.attended ? 'check_circle' : isPast ? 'cancel' : 'schedule'}
                                          </span>
                                          <div>
                                            <p className="text-sm font-medium text-text">
                                              {formatDate(cls.date)} • {formatTime(cls.startTime)} - {formatTime(cls.endTime)}
                                            </p>
                                            <p className="text-xs text-text-muted">{cls.classType}</p>
                                          </div>
                                        </div>
                                        {cls.attended && (
                                          <span className="text-xs px-2 py-1 bg-green-500/10 text-green-700 rounded">
                                            Attended
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </>
                          ) : (
                            // Standalone class
                            <div>
                              <h3 className="text-lg font-bold text-text mb-2">
                                {course.classes[0]?.classType}
                              </h3>
                              <p className="text-sm text-text-muted">
                                {formatDate(course.classes[0]?.date)} • {formatTime(course.classes[0]?.startTime)} - {formatTime(course.classes[0]?.endTime)}
                              </p>
                            </div>
                          )}
                        </div>

                        {course.type === 'course' && (
                          <button
                            onClick={() => loadCoursePieces(course.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors text-sm"
                          >
                            <span className="material-symbols-outlined text-sm">photo_library</span>
                            <span>View Gallery</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Past Courses */}
            {pastCourses.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-text mb-4">
                  Past Courses ({pastCourses.length})
                </h2>
                <div className="grid gap-4">
                  {pastCourses.map((course) => (
                    <div
                      key={course.id}
                      className="bg-background-alt border border-border rounded-xl p-6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          {course.type === 'course' ? (
                            <>
                              <h3 className="text-xl font-bold text-text mb-2">
                                {course.courseTitle}
                              </h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-text-muted mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-sm">calendar_month</span>
                                  <span>{formatDate(course.startDate)} - {formatDate(course.endDate)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-sm">person</span>
                                  <span>Instructor: {course.instructor}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="material-symbols-outlined text-sm text-green-500">check_circle</span>
                                <span className="text-text-muted">
                                  Completed: {course.classes.filter(c => c.attended).length} / {course.classes.length} classes attended
                                </span>
                              </div>
                            </>
                          ) : (
                            <div>
                              <h3 className="text-lg font-bold text-text mb-2">
                                {course.classes[0]?.classType}
                              </h3>
                              <p className="text-sm text-text-muted">
                                {formatDate(course.classes[0]?.date)}
                              </p>
                            </div>
                          )}
                        </div>

                        {course.type === 'course' && (
                          <button
                            onClick={() => loadCoursePieces(course.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors text-sm"
                          >
                            <span className="material-symbols-outlined text-sm">photo_library</span>
                            <span>View Gallery</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Gallery Pieces Modal */}
      {showPiecesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background-alt border border-border rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-text">Gallery Pieces</h2>
                  {selectedCourse && (
                    <p className="text-sm text-text-muted mt-1">
                      {selectedCourse.title} • {formatDate(selectedCourse.startDate)} - {formatDate(selectedCourse.endDate)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowPiecesModal(false);
                    setSelectedCourse(null);
                    setCoursePieces([]);
                  }}
                  className="p-2 hover:bg-background rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <div className="p-6">
              {coursePieces.length === 0 ? (
                <div className="text-center py-12">
                  <span className="material-symbols-outlined text-6xl text-text-muted mb-4 block">
                    photo_library
                  </span>
                  <h3 className="text-xl font-bold text-text mb-2">No Gallery Pieces Yet</h3>
                  <p className="text-text-muted mb-6">You haven't added any pieces from this course</p>
                  <button
                    onClick={() => navigate('/gallery/new')}
                    className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
                  >
                    Add Gallery Piece
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {coursePieces.map((piece) => (
                    <div
                      key={piece.id}
                      className="bg-background border border-border rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => navigate(`/gallery/${piece.id}`)}
                    >
                      {piece.images && piece.images.length > 0 && piece.images[0].url ? (
                        <img
                          src={piece.images[0].url}
                          alt={piece.title}
                          className="w-full h-48 object-cover"
                        />
                      ) : (
                        <div className="w-full h-48 bg-gray-200 flex items-center justify-center">
                          <span className="material-symbols-outlined text-4xl text-gray-400">
                            photo
                          </span>
                        </div>
                      )}
                      <div className="p-4">
                        <h3 className="font-bold text-text mb-1">{piece.title}</h3>
                        <p className="text-sm text-text-muted line-clamp-2">{piece.description}</p>
                        <p className="text-xs text-text-muted mt-2">
                          Completed: {formatDate(piece.date_completed)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
