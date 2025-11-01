import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import axios from 'axios';

export default function AdminClasses() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('bookings'); // 'bookings' or 'waitlist'
  const [filterDate, setFilterDate] = useState('all'); // all, upcoming, past

  useEffect(() => {
    loadClasses();
  }, []);

  const loadClasses = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/classes/available');
      setClasses(data.classes || []);
    } catch (error) {
      console.error('Failed to load classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadClassDetails = async (classId) => {
    try {
      setLoading(true);

      // Load bookings
      const bookingsRes = await axios.get(`/api/classes/${classId}/bookings`);
      setBookings(bookingsRes.data.bookings || []);

      // Load waitlist
      const waitlistRes = await axios.get(`/api/classes/${classId}/waitlist`);
      setWaitlist(waitlistRes.data.waitlist || []);

      const selected = classes.find(c => c.id === classId);
      setSelectedClass(selected);
    } catch (error) {
      console.error('Failed to load class details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAttendance = async (bookingId, attended) => {
    try {
      const { data } = await axios.post(`/api/classes/bookings/${bookingId}/mark-attendance`, {
        attended,
        notes: ''
      });

      alert(data.message || 'Attendance marked successfully');

      // Reload bookings
      if (selectedClass) {
        loadClassDetails(selectedClass.id);
      }
    } catch (error) {
      console.error('Failed to mark attendance:', error);
      alert('Failed to mark attendance');
    }
  };

  const handleOfferNextSpot = async (classId) => {
    if (!confirm('Offer spot to next person on waitlist?')) return;

    try {
      const { data } = await axios.post(`/api/classes/${classId}/waitlist/offer-next`);

      alert(`Spot offered to ${data.waitlistEntry.studentName} (${data.waitlistEntry.studentEmail})`);

      // Reload waitlist
      loadClassDetails(classId);
    } catch (error) {
      console.error('Failed to offer spot:', error);
      alert(error.response?.data?.error || 'Failed to offer spot');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const isUpcoming = (classDate) => {
    return new Date(classDate) >= new Date();
  };

  const filteredClasses = classes.filter(classItem => {
    if (filterDate === 'upcoming') return isUpcoming(classItem.classDate);
    if (filterDate === 'past') return !isUpcoming(classItem.classDate);
    return true;
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

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-text mb-2">Class Management</h1>
              <p className="text-text-muted">Manage bookings, waitlists & attendance</p>
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

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-background-alt border border-border rounded-xl p-6">
            <p className="text-sm text-text-muted mb-1">Total Classes</p>
            <p className="text-3xl font-bold text-text">{classes.length}</p>
          </div>
          <div className="bg-background-alt border border-border rounded-xl p-6">
            <p className="text-sm text-text-muted mb-1">Upcoming</p>
            <p className="text-3xl font-bold text-blue-500">
              {classes.filter(c => isUpcoming(c.classDate)).length}
            </p>
          </div>
          <div className="bg-background-alt border border-border rounded-xl p-6">
            <p className="text-sm text-text-muted mb-1">Total Bookings</p>
            <p className="text-3xl font-bold text-green-500">
              {classes.reduce((sum, c) => sum + c.currentEnrollment, 0)}
            </p>
          </div>
          <div className="bg-background-alt border border-border rounded-xl p-6">
            <p className="text-sm text-text-muted mb-1">On Waitlist</p>
            <p className="text-3xl font-bold text-accent">
              {classes.reduce((sum, c) => sum + (c.waitlistCount || 0), 0)}
            </p>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-background-alt border border-border rounded-xl p-4 mb-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-text">Filter:</label>
            <select
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="px-4 py-2 bg-background border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
            >
              <option value="all">All Classes</option>
              <option value="upcoming">Upcoming Only</option>
              <option value="past">Past Classes</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Classes List */}
          <div className="lg:col-span-1">
            <div className="bg-background-alt border border-border rounded-xl p-6 sticky top-4">
              <h2 className="text-xl font-bold text-text mb-4">Classes ({filteredClasses.length})</h2>

              <div className="space-y-3 max-h-[700px] overflow-y-auto">
                {loading && !selectedClass ? (
                  <p className="text-center text-text-muted py-8">Loading...</p>
                ) : filteredClasses.length === 0 ? (
                  <p className="text-center text-text-muted py-8">No classes found</p>
                ) : (
                  filteredClasses.map((classItem) => (
                    <button
                      key={classItem.id}
                      onClick={() => loadClassDetails(classItem.id)}
                      className={`w-full text-left p-4 rounded-lg border transition-all ${
                        selectedClass?.id === classItem.id
                          ? 'bg-accent/10 border-accent'
                          : 'bg-background border-border hover:border-accent/50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-bold text-text">{classItem.classType}</h3>
                        {classItem.isFull && (
                          <span className="px-2 py-1 bg-red-500/10 text-red-500 rounded text-xs font-medium">
                            Full
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-sm text-text-muted">
                        <p className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">calendar_today</span>
                          {formatDate(classItem.classDate)}
                        </p>
                        <p className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">schedule</span>
                          {formatTime(classItem.startTime)} - {formatTime(classItem.endTime)}
                        </p>
                        <p className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">person</span>
                          {classItem.instructor}
                        </p>
                        <div className="flex items-center justify-between pt-2">
                          <span className={`text-xs font-medium ${classItem.isFull ? 'text-red-500' : 'text-green-500'}`}>
                            {classItem.currentEnrollment}/{classItem.maxCapacity} enrolled
                          </span>
                          {classItem.waitlistCount > 0 && (
                            <span className="px-2 py-1 bg-accent/10 text-accent rounded text-xs font-medium">
                              {classItem.waitlistCount} waiting
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Class Details */}
          <div className="lg:col-span-2">
            {!selectedClass ? (
              <div className="bg-background-alt border border-border rounded-xl p-12 text-center">
                <span className="material-symbols-outlined text-6xl text-text-muted mb-4 block">
                  event_available
                </span>
                <h3 className="text-xl font-bold text-text mb-2">Select a Class</h3>
                <p className="text-text-muted">Choose a class to manage bookings and waitlist</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Class Info */}
                <div className="bg-background-alt border border-border rounded-xl p-6">
                  <h2 className="text-2xl font-bold text-text mb-4">{selectedClass.classType}</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-background rounded-lg p-4">
                      <p className="text-xs text-text-muted mb-1">Date</p>
                      <p className="font-bold text-text text-sm">{formatDate(selectedClass.classDate)}</p>
                    </div>
                    <div className="bg-background rounded-lg p-4">
                      <p className="text-xs text-text-muted mb-1">Time</p>
                      <p className="font-bold text-text text-sm">
                        {formatTime(selectedClass.startTime)} - {formatTime(selectedClass.endTime)}
                      </p>
                    </div>
                    <div className="bg-background rounded-lg p-4">
                      <p className="text-xs text-text-muted mb-1">Instructor</p>
                      <p className="font-bold text-text text-sm">{selectedClass.instructor}</p>
                    </div>
                    <div className="bg-background rounded-lg p-4">
                      <p className="text-xs text-text-muted mb-1">Room</p>
                      <p className="font-bold text-text text-sm">{selectedClass.room || 'Main Studio'}</p>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="bg-background-alt border border-border rounded-xl overflow-hidden">
                  <div className="flex border-b border-border">
                    <button
                      onClick={() => setActiveTab('bookings')}
                      className={`flex-1 px-6 py-4 font-medium transition-colors ${
                        activeTab === 'bookings'
                          ? 'bg-accent text-white'
                          : 'text-text hover:bg-background'
                      }`}
                    >
                      Bookings ({bookings.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('waitlist')}
                      className={`flex-1 px-6 py-4 font-medium transition-colors ${
                        activeTab === 'waitlist'
                          ? 'bg-accent text-white'
                          : 'text-text hover:bg-background'
                      }`}
                    >
                      Waitlist ({waitlist.length})
                    </button>
                  </div>

                  <div className="p-6">
                    {activeTab === 'bookings' && (
                      <div>
                        {loading ? (
                          <p className="text-center text-text-muted py-8">Loading bookings...</p>
                        ) : bookings.length === 0 ? (
                          <p className="text-center text-text-muted py-8">No bookings for this class</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-border">
                                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Student</th>
                                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Email</th>
                                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Status</th>
                                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Attendance</th>
                                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bookings.map((booking) => (
                                  <tr key={booking.id} className="border-b border-border hover:bg-background transition-colors">
                                    <td className="py-3 px-4 text-sm text-text">{booking.student.name}</td>
                                    <td className="py-3 px-4 text-sm text-text-muted">{booking.student.email}</td>
                                    <td className="py-3 px-4">
                                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                                        booking.status === 'booked'
                                          ? 'bg-green-500/10 text-green-500'
                                          : booking.status === 'cancelled'
                                          ? 'bg-red-500/10 text-red-500'
                                          : 'bg-gray-500/10 text-gray-500'
                                      }`}>
                                        {booking.status}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 text-sm">
                                      {booking.attended === null ? (
                                        <span className="text-text-muted">Not marked</span>
                                      ) : booking.attended ? (
                                        <span className="text-green-500 font-medium">✓ Present</span>
                                      ) : (
                                        <span className="text-red-500 font-medium">
                                          ✗ {booking.advanceNoticeGiven ? 'Notice given' : 'No-show'}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4">
                                      {booking.attended === null && booking.status === 'booked' && (
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => handleMarkAttendance(booking.id, true)}
                                            className="p-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500/20 transition-colors"
                                            title="Mark present"
                                          >
                                            <span className="material-symbols-outlined text-sm">check</span>
                                          </button>
                                          <button
                                            onClick={() => handleMarkAttendance(booking.id, false)}
                                            className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
                                            title="Mark absent"
                                          >
                                            <span className="material-symbols-outlined text-sm">close</span>
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'waitlist' && (
                      <div>
                        {waitlist.length > 0 && (
                          <div className="mb-6">
                            <button
                              onClick={() => handleOfferNextSpot(selectedClass.id)}
                              className="px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors font-medium"
                            >
                              Offer Spot to Next Person
                            </button>
                          </div>
                        )}

                        {loading ? (
                          <p className="text-center text-text-muted py-8">Loading waitlist...</p>
                        ) : waitlist.length === 0 ? (
                          <p className="text-center text-text-muted py-8">No one on waitlist</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-border">
                                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Position</th>
                                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Student</th>
                                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Email</th>
                                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Joined</th>
                                  <th className="text-left py-3 px-4 text-sm font-medium text-text-muted">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {waitlist.map((entry) => (
                                  <tr
                                    key={entry.id}
                                    className={`border-b border-border transition-colors ${
                                      entry.spotOfferedAt ? 'bg-accent/5' : 'hover:bg-background'
                                    }`}
                                  >
                                    <td className="py-3 px-4">
                                      <span className="px-3 py-1 bg-accent/10 text-accent rounded-full text-sm font-bold">
                                        #{entry.position}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 text-sm text-text">{entry.student.name}</td>
                                    <td className="py-3 px-4 text-sm text-text-muted">{entry.student.email}</td>
                                    <td className="py-3 px-4 text-sm text-text-muted">{formatDate(entry.joinedAt)}</td>
                                    <td className="py-3 px-4">
                                      {entry.spotOfferedAt ? (
                                        <div>
                                          <span className="px-2 py-1 bg-green-500/10 text-green-500 rounded text-xs font-medium block mb-1">
                                            Spot Offered
                                          </span>
                                          <span className="text-xs text-text-muted">
                                            Expires: {formatDate(entry.expiresAt)}
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="px-2 py-1 bg-gray-500/10 text-gray-500 rounded text-xs font-medium">
                                          Waiting
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
