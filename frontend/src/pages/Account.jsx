import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import axios from 'axios';
import Navigation from '../components/Navigation';

export default function Account() {
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState('details');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Member Details state
  const [memberDetails, setMemberDetails] = useState({
    firstName: '',
    lastName: '',
    mobile: '',
    email: '',
    dateOfBirth: '',
    profilePicture: ''
  });

  // Password state
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Class History state
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ totalClasses: 0, attendedClasses: 0 });
  const [coursePieces, setCoursePieces] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [showPiecesModal, setShowPiecesModal] = useState(false);

  useEffect(() => {
    if (user) {
      setMemberDetails({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        mobile: user.mobile || '',
        email: user.email || '',
        dateOfBirth: user.dateOfBirth || '',
        profilePicture: user.profilePicture || ''
      });
    }
    loadHistory();
  }, [user]);

  const loadHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await api.get('/classes/my-history');
      console.log('Class history response:', response.data);

      // Log first course to check date formats
      if (response.data.history && response.data.history.length > 0) {
        console.log('First course:', response.data.history[0]);
        if (response.data.history[0].classes && response.data.history[0].classes.length > 0) {
          console.log('First class:', response.data.history[0].classes[0]);
        }
      }

      setHistory(response.data.history || []);
      setStats({
        totalClasses: response.data.totalClasses || 0,
        attendedClasses: response.data.attendedClasses || 0
      });
    } catch (error) {
      console.error('Failed to load class history:', error);
    }
  };

  const loadCoursePieces = async (courseId) => {
    try {
      const response = await api.get(`/pottery/by-course/${courseId}`);
      setCoursePieces(response.data.pieces || []);
      setSelectedCourse(response.data.course);
      setShowPiecesModal(true);
    } catch (error) {
      console.error('Failed to load course pieces:', error);
      setMessage({ type: 'error', text: 'Failed to load gallery pieces for this course' });
    }
  };

  const handleMemberDetailsSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await api.put('/auth/profile', memberDetails);
      // Update token if provided
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
      }
      updateUser(response.data.user);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to update profile'
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    if (passwords.newPassword !== passwords.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      setLoading(false);
      return;
    }

    if (passwords.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      setLoading(false);
      return;
    }

    try {
      await api.post('/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword
      });
      setMessage({ type: 'success', text: 'Password changed successfully!' });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      console.error('Error changing password:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to change password'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePictureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select an image file' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image size must be less than 5MB' });
      return;
    }

    try {
      setUploading(true);
      setMessage({ type: '', text: '' });

      const formData = new FormData();
      formData.append('image', file);

      const { data } = await axios.post('/api/upload/image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
      });

      if (data.success && data.url) {
        setMemberDetails({ ...memberDetails, profilePicture: data.url });
        setMessage({ type: 'success', text: 'Image uploaded! Click "Save Changes" to save.' });
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
      setMessage({ type: 'error', text: 'Failed to upload image' });
    } finally {
      setUploading(false);
    }
  };

  const formatHistoryDate = (dateStr) => {
    if (!dateStr) return 'N/A';

    // Handle different date formats
    let date;
    if (dateStr.includes('T')) {
      // ISO format like "2025-08-31T00:00:00"
      date = new Date(dateStr);
    } else if (dateStr.includes('-')) {
      // Format like "2025-08-31" - add time to avoid timezone issues
      date = new Date(dateStr + 'T12:00:00');
    } else {
      date = new Date(dateStr);
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date:', dateStr);
      return 'Invalid Date';
    }

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-background font-display text-text">
      <Navigation />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-text mb-6">My Account</h1>

        {/* Message Display */}
        {message.text && (
          <div className={`mb-6 p-4 border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-500 text-green-700'
              : 'bg-red-50 border-red-500 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-border">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('details')}
              className={`pb-3 px-1 text-sm font-medium uppercase tracking-wide transition-colors ${
                activeTab === 'details'
                  ? 'text-text border-b-2 border-text'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`pb-3 px-1 text-sm font-medium uppercase tracking-wide transition-colors ${
                activeTab === 'security'
                  ? 'text-text border-b-2 border-text'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              Password
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-3 px-1 text-sm font-medium uppercase tracking-wide transition-colors ${
                activeTab === 'history'
                  ? 'text-text border-b-2 border-text'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              Class History
            </button>
          </div>
        </div>

        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="bg-background-alt border border-border p-6">
            <h2 className="text-xl font-bold text-text mb-4">Details</h2>
            <form onSubmit={handleMemberDetailsSubmit} className="space-y-4">
              {/* Profile Picture */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-text mb-3">Profile Picture</label>
                <div className="flex items-center gap-6">
                  {memberDetails.profilePicture || user?.profilePicture ? (
                    <img
                      src={memberDetails.profilePicture || user?.profilePicture}
                      alt={`${user?.firstName} ${user?.lastName}`}
                      className="w-24 h-24 rounded-full object-cover border-2 border-border"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center border-2 border-border">
                      <span className="material-symbols-outlined text-gray-400 text-4xl">person</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProfilePictureUpload}
                      disabled={uploading}
                      className="hidden"
                      id="profile-picture-upload"
                    />
                    <label
                      htmlFor="profile-picture-upload"
                      className={`inline-flex items-center gap-2 px-4 py-2 border border-border cursor-pointer transition-colors ${
                        uploading
                          ? 'bg-gray-100 cursor-not-allowed'
                          : 'bg-background hover:bg-background-alt'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {uploading ? 'sync' : 'upload'}
                      </span>
                      <span className="text-sm text-text">
                        {uploading ? 'Uploading...' : 'Upload Image'}
                      </span>
                    </label>
                    {(memberDetails.profilePicture || user?.profilePicture) && (
                      <button
                        type="button"
                        onClick={() => setMemberDetails({ ...memberDetails, profilePicture: '' })}
                        className="ml-2 inline-flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 border border-red-600 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-text mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    value={memberDetails.firstName}
                    onChange={(e) => setMemberDetails({ ...memberDetails, firstName: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-border bg-background text-text focus:outline-none focus:border-text"
                  />
                </div>

                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-text mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    value={memberDetails.lastName}
                    onChange={(e) => setMemberDetails({ ...memberDetails, lastName: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-border bg-background text-text focus:outline-none focus:border-text"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-text mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  id="email"
                  value={memberDetails.email}
                  onChange={(e) => setMemberDetails({ ...memberDetails, email: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-border bg-background text-text focus:outline-none focus:border-text"
                />
              </div>

              <div>
                <label htmlFor="mobile" className="block text-sm font-medium text-text mb-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  id="mobile"
                  value={memberDetails.mobile}
                  onChange={(e) => setMemberDetails({ ...memberDetails, mobile: e.target.value })}
                  className="w-full px-3 py-2 border border-border bg-background text-text focus:outline-none focus:border-text"
                  placeholder="+65 1234 5678"
                />
              </div>

              <div>
                <label htmlFor="dateOfBirth" className="block text-sm font-medium text-text mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  id="dateOfBirth"
                  value={memberDetails.dateOfBirth}
                  onChange={(e) => setMemberDetails({ ...memberDetails, dateOfBirth: e.target.value })}
                  className="w-full px-3 py-2 border border-border bg-background text-text focus:outline-none focus:border-text"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-gray-800 text-white text-sm font-normal uppercase tracking-wide hover:bg-gray-700 transition-colors border border-gray-800 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Password Tab */}
        {activeTab === 'security' && (
          <div className="bg-background-alt border border-border p-6">
            <h2 className="text-xl font-bold text-text mb-4">Password</h2>
            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-text mb-1">
                  Current Password *
                </label>
                <input
                  type="password"
                  id="currentPassword"
                  value={passwords.currentPassword}
                  onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-border bg-background text-text focus:outline-none focus:border-text"
                />
              </div>

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-text mb-1">
                  New Password *
                </label>
                <input
                  type="password"
                  id="newPassword"
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-border bg-background text-text focus:outline-none focus:border-text"
                />
                <p className="text-xs text-text-muted mt-1">Minimum 6 characters</p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-text mb-1">
                  Confirm New Password *
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={passwords.confirmPassword}
                  onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-border bg-background text-text focus:outline-none focus:border-text"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-gray-800 text-white text-sm font-normal uppercase tracking-wide hover:bg-gray-700 transition-colors border border-gray-800 disabled:opacity-50"
                >
                  {loading ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Class History Tab */}
        {activeTab === 'history' && (
          <div className="bg-background-alt border border-border p-6">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-text mb-1">My Class History</h2>
              <p className="text-sm text-text-muted">
                {stats.attendedClasses} of {stats.totalClasses} classes attended
                {stats.totalClasses > 0 && ` (${Math.round((stats.attendedClasses / stats.totalClasses) * 100)}%)`}
              </p>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-6xl text-text-muted mb-4 block">
                  history_edu
                </span>
                <h3 className="text-xl font-bold text-text mb-2">No Class History</h3>
                <p className="text-text-muted">Your completed courses will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((course) => (
                  <div key={course.id} className="p-4 bg-background border border-border">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-bold text-text mb-1">{course.courseTitle}</h4>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted mb-2">
                          <span>{formatHistoryDate(course.startDate)} - {formatHistoryDate(course.endDate)}</span>
                          <span>with {course.instructor}</span>
                          <span>{course.classes.filter(c => c.attended).length}/{course.classes.length} attended</span>
                        </div>

                        {/* Individual class breakdown */}
                        <div className="mt-3 space-y-1">
                          {course.classes.map((cls, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <span className={`w-4 h-4 flex items-center justify-center ${
                                cls.attended
                                  ? 'text-green-600'
                                  : 'text-gray-400'
                              }`}>
                                <span className="material-symbols-outlined text-sm">
                                  {cls.attended ? 'check_circle' : 'cancel'}
                                </span>
                              </span>
                              <span className="text-text-muted">
                                Week {idx + 1} - {formatHistoryDate(cls.date || cls.classDate)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        {course.status === 'completed' && (
                          <span className="px-2 py-1 bg-green-500/10 text-green-700 text-xs font-bold">Completed</span>
                        )}
                        <button
                          onClick={() => loadCoursePieces(course.id)}
                          className="px-3 py-1 bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors"
                        >
                          View Gallery
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
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
                      {selectedCourse.title} • {formatHistoryDate(selectedCourse.startDate)} - {formatHistoryDate(selectedCourse.endDate)}
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
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {coursePieces.map((piece) => (
                    <div
                      key={piece.id}
                      className="bg-background border border-border rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
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
                          Completed: {formatHistoryDate(piece.date_completed)}
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
    </div>
  );
}
