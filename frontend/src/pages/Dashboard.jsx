import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import api from '../utils/api';
import { potteryAPI } from '../utils/api';
import { getCourseTypeInfo } from '../utils/courseTypes';

export default function Dashboard() {
  const { user } = useAuth();
  const [studentData, setStudentData] = useState(null);
  const [galleryPieces, setGalleryPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [showPastClasses, setShowPastClasses] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [dashboardResponse, potteryData] = await Promise.all([
        api.get('/students/me/dashboard'),
        potteryAPI.getPieces()
      ]);

      setDashboardData(dashboardResponse.data);
      setStudentData(dashboardResponse.data.student);

      if (Array.isArray(potteryData)) {
        setGalleryPieces(potteryData.slice(0, 4));
      } else if (potteryData && Array.isArray(potteryData.pieces)) {
        setGalleryPieces(potteryData.pieces.slice(0, 4));
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get all enrollments flattened
  const getAllEnrollments = () => {
    if (!dashboardData?.enrollments) return [];
    const { active = [], upcoming = [], completed = [], pending = [] } = dashboardData.enrollments;
    return [...active, ...upcoming, ...completed, ...pending];
  };

  // Extract all bookings from all enrollments (each enrollment has a bookings[] array)
  const getAllBookings = (enrollments) => {
    const all = [];
    enrollments.forEach(enrollment => {
      if (enrollment.bookings && Array.isArray(enrollment.bookings)) {
        enrollment.bookings.forEach(booking => {
          all.push(booking);
        });
      }
    });
    return all.sort((a, b) => {
      const dateA = new Date(a.class_instances?.class_date);
      const dateB = new Date(b.class_instances?.class_date);
      return dateA - dateB;
    });
  };

  // Split bookings into upcoming and past
  const classifyBookings = (allBookings) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = [];
    const past = [];

    allBookings.forEach(booking => {
      if (!booking.class_instances) return;
      const classDate = new Date(booking.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      if (classDate < today) {
        past.push(booking);
      } else {
        upcoming.push(booking);
      }
    });

    return { upcoming, past };
  };

  // Get the next upcoming class for the hero strip
  const getNextClass = (upcomingBookings) => {
    if (!upcomingBookings || upcomingBookings.length === 0) return null;
    const booking = upcomingBookings[0];
    const ci = booking.class_instances;
    if (!ci) return null;
    const date = new Date(ci.class_date);
    return {
      date: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      time: ci.start_time,
    };
  };

  // Parse a short course type label from class_type code
  const getShortCourseLabel = (classType) => {
    if (!classType) return '';
    if (classType.startsWith('WT')) return 'Wheelthrowing';
    if (classType.startsWith('HB')) return 'Handbuilding';
    return classType.split('.')[0];
  };

  const firstName = studentData?.first_name || user?.firstName || user?.email?.split('@')[0] || 'Student';

  if (loading) {
    return (
      <div className="min-h-screen bg-background font-display text-text">
        <Navigation />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-64" />
            <div className="h-4 bg-gray-100 rounded w-48" />
            <div className="h-32 bg-gray-100 rounded" />
            <div className="h-48 bg-gray-100 rounded" />
          </div>
        </main>
      </div>
    );
  }

  const enrollments = getAllEnrollments();
  const allBookings = getAllBookings(enrollments);
  const { upcoming, past } = classifyBookings(allBookings);
  const nextClass = getNextClass(upcoming);
  const stats = dashboardData?.stats;

  return (
    <div className="min-h-screen bg-background font-display text-text">
      <Navigation />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

        {/* Hero Summary */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold uppercase tracking-tight mb-2">
            Welcome back, {firstName}!
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-600">
            {stats && (
              <span className="text-lg">
                <span className="font-semibold text-gray-900">{stats.remaining}</span> classes remaining
              </span>
            )}
            {stats && nextClass && (
              <span className="text-gray-300">·</span>
            )}
            {nextClass && (
              <span className="text-lg">
                Next class: <span className="font-semibold text-gray-900">{nextClass.date}</span>, {nextClass.time}
              </span>
            )}
          </div>
        </div>

        {/* My Courses — minimal cards with progress */}
        {enrollments.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-bold uppercase tracking-wide mb-4">My Courses</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {enrollments.map((enrollment, index) => {
                const { config } = getCourseTypeInfo(enrollment);
                const totalClasses = enrollment.number_of_weeks || 6;
                // Count attended from this enrollment's own bookings array
                const enrollmentBookings = enrollment.bookings || [];
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const attendedCount = enrollmentBookings.filter(b => {
                  if (b.status === 'attended' || b.status === 'completed') return true;
                  // Past booked classes count as attended
                  if (b.status === 'booked' && b.class_instances) {
                    const d = new Date(b.class_instances.class_date);
                    d.setHours(0, 0, 0, 0);
                    return d < today;
                  }
                  return false;
                }).length;
                const progress = totalClasses > 0 ? Math.min((attendedCount / totalClasses) * 100, 100) : 0;

                // Flexible credits for 10-class packages
                const hasFlexible = enrollment.flexible_credits_allocated > 0;

                return (
                  <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-900 text-sm">
                        {enrollment.course_title || 'Course'}
                      </h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.badge.bg} ${config.badge.text}`}>
                        {config.badge.label}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-1">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{attendedCount} / {totalClasses} attended</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-accent h-2 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Flexible credits sub-bar for 10-class packages */}
                    {hasFlexible && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Flexible credits</span>
                          <span>{enrollment.flexible_credits_remaining || 0} / {enrollment.flexible_credits_allocated} left</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-purple-400 h-1.5 rounded-full transition-all"
                            style={{ width: `${((enrollment.flexible_credits_used || 0) / enrollment.flexible_credits_allocated) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Upcoming Classes */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold uppercase tracking-wide">
              Upcoming Classes {upcoming.length > 0 && <span className="text-gray-400 font-normal">({upcoming.length})</span>}
            </h2>
            <Link
              to="/classes"
              className="text-sm text-accent hover:text-accent/80 uppercase tracking-wide font-medium"
            >
              Browse Classes →
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <p className="text-gray-400 py-6">No upcoming classes</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((booking, index) => {
                const ci = booking.class_instances || {};
                const classDate = new Date(ci.class_date || booking.class_date);
                const classType = ci.class_type || booking.class_type || '';

                return (
                  <div key={index} className="flex items-center gap-4 py-3 px-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                    {/* Date */}
                    <div className="w-20 shrink-0">
                      <div className="text-sm font-semibold text-gray-900">
                        {classDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
                      </div>
                      <div className="text-xs text-gray-500">
                        {classDate.toLocaleDateString('en-GB', { month: 'short' })}
                      </div>
                    </div>

                    {/* Time */}
                    <div className="text-sm text-gray-600 w-28 shrink-0">
                      {ci.start_time || '—'} – {ci.end_time || '—'}
                    </div>

                    {/* Course label */}
                    <div className="text-sm text-gray-900 flex-1">
                      {getShortCourseLabel(classType)}
                    </div>

                    {/* Status dot */}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      {booking.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Collapsible past classes */}
          {past.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowPastClasses(!showPastClasses)}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-base">
                  {showPastClasses ? 'expand_less' : 'expand_more'}
                </span>
                Past classes ({past.length})
              </button>

              {showPastClasses && (
                <div className="mt-2 space-y-1">
                  {past.map((booking, index) => {
                    const ci = booking.class_instances || {};
                    const classDate = new Date(ci.class_date || booking.class_date);
                    const classType = ci.class_type || booking.class_type || '';

                    return (
                      <div key={index} className="flex items-center gap-4 py-2 px-4 rounded-lg text-gray-400">
                        <div className="w-20 shrink-0 text-sm">
                          {classDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </div>
                        <div className="text-sm w-28 shrink-0">
                          {ci.start_time || '—'} – {ci.end_time || '—'}
                        </div>
                        <div className="text-sm flex-1">
                          {getShortCourseLabel(classType)}
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-600">
                          attended
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Gallery Preview */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold uppercase tracking-wide">My Gallery</h2>
            <Link
              to="/gallery"
              className="text-sm text-accent hover:text-accent/80 uppercase tracking-wide font-medium"
            >
              View All →
            </Link>
          </div>
          {galleryPieces.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {galleryPieces.map((piece, index) => (
                <Link
                  key={index}
                  to="/gallery"
                  className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100 border border-gray-200 hover:border-accent transition-colors"
                >
                  {piece.imageUrl ? (
                    <img
                      src={piece.imageUrl}
                      alt={piece.title || `Pottery piece ${index + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-gray-400 text-6xl">local_fire_department</span>
                    </div>
                  )}
                  {piece.title && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                      <p className="text-white text-sm font-medium truncate">{piece.title}</p>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((index) => (
                <Link
                  key={index}
                  to="/gallery"
                  className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100 border border-gray-200 hover:border-accent transition-colors"
                >
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <span className="material-symbols-outlined text-gray-300 text-6xl mb-2">add_photo_alternate</span>
                    <span className="text-xs text-gray-400 uppercase">No photos yet</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>


      </main>
    </div>
  );
}
