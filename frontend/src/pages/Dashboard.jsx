import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import api from '../utils/api';
import { classesAPI, potteryAPI } from '../utils/api';

export default function Dashboard() {
  const { user } = useAuth();
  const [studentData, setStudentData] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [galleryPieces, setGalleryPieces] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch student data, bookings, and gallery pieces in parallel
      const [studentResponse, bookingsData, potteryData] = await Promise.all([
        api.get('/students/me'),
        classesAPI.getMyBookings(),
        potteryAPI.getPieces()
      ]);

      console.log('Student data:', studentResponse.data);
      console.log('Bookings data:', bookingsData);
      console.log('Pottery data:', potteryData);

      setStudentData(studentResponse.data.student);

      // Handle different response formats for bookings
      let bookingsArray = [];
      if (Array.isArray(bookingsData)) {
        bookingsArray = bookingsData;
      } else if (bookingsData && Array.isArray(bookingsData.bookings)) {
        bookingsArray = bookingsData.bookings;
      } else if (bookingsData && typeof bookingsData === 'object') {
        console.log('Bookings object keys:', Object.keys(bookingsData));
        bookingsArray = [];
      }

      setBookings(bookingsArray);

      // Set gallery pieces (limit to 4 for dashboard)
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

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-SG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const parseCourseName = (courseIdentifier, classType) => {
    // If we have a valid course identifier, parse it
    if (courseIdentifier && courseIdentifier !== 'N/A') {
      // Course identifier format: WT2001PM_DL6.1
      // WT = Wheelthrowing, HB = Handbuilding
      // 6 = number of weeks
      const typeMatch = courseIdentifier.match(/^(WT|HB|CL)/);
      const weeksMatch = courseIdentifier.match(/(\d+)\.\d+$/);

      if (typeMatch) {
        const type = typeMatch[1] === 'WT' ? 'Wheelthrowing' :
                     typeMatch[1] === 'HB' ? 'Handbuilding' :
                     'Class';

        const weeks = weeksMatch ? `${weeksMatch[1]} Weeks` : '';
        return weeks ? `${type} ${weeks}` : type;
      }
    }

    // Fallback to class_type if course_identifier is N/A
    if (classType) {
      // Extract base type (remove "Beginner/Extension" etc)
      if (classType.toLowerCase().includes('wheelthrowing')) {
        return 'Wheelthrowing 6 Weeks';
      } else if (classType.toLowerCase().includes('handbuilding')) {
        return 'Handbuilding 4 Weeks';
      }
      return classType;
    }

    return 'N/A';
  };

  return (
    <div className="min-h-screen bg-background font-display text-text">
      <Navigation />

      {/* Dashboard Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-3xl font-bold uppercase tracking-tight mb-8">
          Welcome back, {studentData?.first_name || user?.firstName || user?.email?.split('@')[0] || 'Student'}!
        </h2>

        {/* Class Credits Display */}
        {!loading && studentData && (() => {
          const total = studentData.classes_allocated || 0;
          // Count all active bookings (booked + attended) as they take up allocated slots
          // Exclude cancelled bookings as they free up the slot
          const booked = bookings.filter(b => b.status === 'booked' || b.status === 'attended').length;
          const available = total - booked;

          // Calculate attended from current course bookings only
          // Count bookings that have ended (status: attended or completed)
          // Also count past classes with 'booked' status as attended
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const attended = bookings.filter(booking => {
            const classDate = booking.class?.classDate || booking.classInstance?.classDate || booking.class_date;
            if (!classDate) return false;

            // Get just the date part for comparison
            const bookingDate = new Date(classDate);
            bookingDate.setHours(0, 0, 0, 0);
            const isPast = bookingDate < today;

            // Count if status is 'attended' or 'completed'
            if (booking.status === 'attended' || booking.status === 'completed') {
              return true;
            }

            // Also count if status is 'booked' but class date is in the past
            if (booking.status === 'booked' && isPast) {
              return true;
            }

            return false;
          }).length;

          const remaining = total - attended;

          return (
            <div className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Total Classes ({total})</h2>
              <div className="bg-background-alt border border-border p-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Booking Status */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-text-muted uppercase">Booking Status</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="px-3 py-2 bg-purple-50 rounded text-center border border-purple-200">
                        <div className="text-xs text-purple-600 font-medium uppercase">Booked</div>
                        <div className="text-xl font-bold text-purple-900">{booked}</div>
                      </div>
                      <div className="px-3 py-2 bg-green-50 rounded text-center border border-green-200">
                        <div className="text-xs text-green-600 font-medium uppercase">Available</div>
                        <div className="text-xl font-bold text-green-900">{available}</div>
                      </div>
                    </div>
                    <div className="text-xs text-center text-text-muted">
                      {booked} + {available} = {total}
                    </div>
                  </div>

                  {/* Attendance Status */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-text-muted uppercase">Attendance Status</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="px-3 py-2 bg-gray-50 rounded text-center border border-gray-200">
                        <div className="text-xs text-gray-600 font-medium uppercase">Attended</div>
                        <div className="text-xl font-bold text-gray-900">{attended}</div>
                      </div>
                      <div className="px-3 py-2 bg-blue-50 rounded text-center border border-blue-200">
                        <div className="text-xs text-blue-600 font-medium uppercase">Remaining</div>
                        <div className="text-xl font-bold text-blue-900">{remaining}</div>
                      </div>
                    </div>
                    <div className="text-xs text-center text-text-muted">
                      {attended} + {remaining} = {total}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Class Bookings Table */}
        {!loading && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Class Bookings ({bookings.length})</h2>
              <Link
                to="/classes"
                className="text-sm text-accent hover:text-accent/80 uppercase tracking-wide font-medium"
              >
                Reschedule →
              </Link>
            </div>

            {bookings.length === 0 ? (
              <p className="text-center text-gray-400 py-12">No bookings found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Course</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Day</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Time</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Date</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...bookings]
                      .sort((a, b) => {
                        const dateA = new Date(a.class?.classDate || a.classInstance?.classDate || a.class_date);
                        const dateB = new Date(b.class?.classDate || b.classInstance?.classDate || b.class_date);
                        return dateA - dateB;
                      })
                      .map((booking, index) => {
                        const classDate = booking.class?.classDate || booking.classInstance?.classDate || booking.class_date;
                        const date = new Date(classDate);
                        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
                        const courseIdentifier = booking.courseIdentifier || booking.course_identifier;
                        const classType = booking.class?.classType || booking.classInstance?.classType || booking.class_type;
                        const courseName = parseCourseName(courseIdentifier, classType);
                        const startTime = booking.class?.startTime || booking.classInstance?.startTime || booking.start_time || '7:00pm';
                        const endTime = booking.class?.endTime || booking.classInstance?.endTime || booking.end_time || '9:30pm';
                        const time = `${startTime} - ${endTime}`;

                        // Check if class is in the past
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const classDate2 = new Date(classDate);
                        classDate2.setHours(0, 0, 0, 0);
                        const isPast = classDate2 < today;

                        // Display "attended" for past classes that are marked as "booked"
                        const displayStatus = (isPast && booking.status === 'booked') ? 'attended' : booking.status;

                        return (
                          <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-4">
                              <span className="font-mono text-sm text-gray-900 bg-gray-100 px-2 py-1 rounded">
                                {courseName}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-gray-600">
                              {dayOfWeek}
                            </td>
                            <td className="py-3 px-4 text-gray-600">
                              {time}
                            </td>
                            <td className="py-3 px-4 text-gray-600">
                              {date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                displayStatus === 'completed' ? 'bg-green-100 text-green-800' :
                                displayStatus === 'attended' ? 'bg-green-100 text-green-800' :
                                displayStatus === 'booked' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {displayStatus}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Gallery Preview */}
        {!loading && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold uppercase">My Gallery</h3>
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
          </div>
        )}

        {/* Quick Links */}
        <div className="mt-12">
          <h3 className="text-xl font-bold uppercase mb-4">Quick Links</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              to="/classes"
              className="bg-background-alt border border-border p-4 text-center hover:border-accent transition-colors"
            >
              <span className="material-symbols-outlined text-accent text-3xl mb-2 block">local_fire_department</span>
              <span className="text-sm font-medium uppercase">Browse Classes</span>
            </Link>
            <Link
              to="/membership"
              className="bg-background-alt border border-border p-4 text-center hover:border-accent transition-colors"
            >
              <span className="material-symbols-outlined text-accent text-3xl mb-2 block">card_membership</span>
              <span className="text-sm font-medium uppercase">Membership</span>
            </Link>
            <Link
              to="/contact"
              className="bg-background-alt border border-border p-4 text-center hover:border-accent transition-colors"
            >
              <span className="material-symbols-outlined text-accent text-3xl mb-2 block">contact_support</span>
              <span className="text-sm font-medium uppercase">Contact</span>
            </Link>
            <Link
              to="/"
              className="bg-background-alt border border-border p-4 text-center hover:border-accent transition-colors"
            >
              <span className="material-symbols-outlined text-accent text-3xl mb-2 block">photo_library</span>
              <span className="text-sm font-medium uppercase">Public Gallery</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
