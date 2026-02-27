import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import axios from 'axios';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

function FieldRow({ label, value, type = 'text', readOnly = false, onChange }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{
        display: 'block', fontSize: '10px', fontWeight: 700,
        letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '6px',
      }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={onChange}
        style={{
          width: '100%', padding: '10px 12px',
          border: `1px solid ${RULE}`, backgroundColor: readOnly ? ALT : '#FFFFFF',
          fontSize: '14px', color: readOnly ? MUTED : INK,
          outline: 'none', boxSizing: 'border-box',
          fontFamily: 'Atak, sans-serif',
        }}
      />
    </div>
  );
}

export default function Account() {
  const { user, updateUser, logout } = useAuth();
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

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  const tabs = [
    { id: 'details',  label: 'Details'  },
    { id: 'security', label: 'Password' },
    { id: 'history',  label: 'History'  },
  ];

  const bottomNavTabs = [
    { id: 'home',    label: 'Home',    icon: 'home',           href: '/dashboard' },
    { id: 'classes', label: 'Classes', icon: 'calendar_month', href: '/classes' },
    { id: 'gallery', label: 'Gallery', icon: 'photo_library',  href: '/gallery' },
    { id: 'account', label: 'Account', icon: 'person',         href: '/account' },
  ];

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>

      {/* MEMBERSHIP HINT BANNER */}
      <div style={{ backgroundColor: TC_LIGHT, width: '100%' }}>
        <div style={{
          maxWidth: '520px', margin: '0 auto', padding: '9px 20px',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TC_DARK, flexShrink: 0 }}>
            Ves &bull; Clay Club Membership
          </span>
          <span style={{ fontSize: '11px', color: INK, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Unlock unlimited studio access now!
          </span>
          <a href="/membership" style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: TC, textDecoration: 'none', whiteSpace: 'nowrap',
            borderBottom: `1px solid ${TC}`, paddingBottom: '1px', flexShrink: 0,
          }}>
            View plans
          </a>
        </div>
      </div>

      {/* TOP BAR */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES"
            style={{ height: '26px', width: 'auto' }}
          />
        </div>
      </header>

      <main style={{ maxWidth: '520px', margin: '0 auto', padding: '0 0 88px' }}>

        {/* PAGE HEADER + AVATAR */}
        <div style={{ padding: '28px 20px 20px', borderBottom: `1px solid ${RULE}`, display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: '56px', height: '56px', backgroundColor: TC_LIGHT,
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}>
              {memberDetails.profilePicture ? (
                <img
                  src={memberDetails.profilePicture}
                  alt={`${memberDetails.firstName} ${memberDetails.lastName}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: '22px', fontWeight: 700, color: TC_DARK }}>
                  {memberDetails.firstName ? memberDetails.firstName.charAt(0).toUpperCase() : '?'}
                </span>
              )}
            </div>
            {/* Hidden file input */}
            <input
              type="file"
              accept="image/*"
              onChange={handleProfilePictureUpload}
              disabled={uploading}
              id="profile-picture-upload"
              style={{ display: 'none' }}
            />
          </div>

          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.2px', margin: '0 0 3px' }}>
              {memberDetails.firstName} {memberDetails.lastName}
            </h1>
            {memberSince && (
              <div style={{ fontSize: '12px', color: MUTED }}>Member since {memberSince}</div>
            )}
            <label
              htmlFor="profile-picture-upload"
              style={{
                display: 'inline-block', marginTop: '4px',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: TC, cursor: uploading ? 'not-allowed' : 'pointer',
                borderBottom: `1px solid ${TC}`, paddingBottom: '1px',
              }}
            >
              {uploading ? 'Uploading...' : 'Update photo'}
            </label>
          </div>
        </div>

        {/* SECTION TABS */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${RULE}` }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setMessage({ type: '', text: '' }); }}
              style={{
                flex: 1, padding: '12px 0', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: activeTab === t.id ? INK : MUTED,
                borderBottom: `2px solid ${activeTab === t.id ? INK : 'transparent'}`,
                transition: 'all 0.15s ease',
                fontFamily: 'Atak, sans-serif',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* MESSAGE BAR */}
        {message.text && (
          <div style={{
            margin: '16px 20px 0',
            padding: '10px 14px',
            fontSize: '12px',
            fontWeight: 600,
            backgroundColor: message.type === 'success' ? '#F0FAF0' : '#FFF0F0',
            color: message.type === 'success' ? '#2A7A2A' : '#C03030',
            border: `1px solid ${message.type === 'success' ? 'rgba(42,122,42,0.25)' : 'rgba(192,48,48,0.25)'}`,
          }}>
            {message.text}
          </div>
        )}

        {/* DETAILS TAB */}
        {activeTab === 'details' && (
          <div style={{ padding: '24px 20px' }}>
            <form onSubmit={handleMemberDetailsSubmit}>
              <FieldRow
                label="First Name"
                value={memberDetails.firstName}
                onChange={e => setMemberDetails({ ...memberDetails, firstName: e.target.value })}
              />
              <FieldRow
                label="Last Name"
                value={memberDetails.lastName}
                onChange={e => setMemberDetails({ ...memberDetails, lastName: e.target.value })}
              />
              <FieldRow
                label="Email"
                value={memberDetails.email}
                type="email"
                onChange={e => setMemberDetails({ ...memberDetails, email: e.target.value })}
              />
              <FieldRow
                label="Mobile"
                value={memberDetails.mobile}
                type="tel"
                onChange={e => setMemberDetails({ ...memberDetails, mobile: e.target.value })}
              />
              <FieldRow
                label="Date of Birth"
                value={memberDetails.dateOfBirth}
                type="date"
                onChange={e => setMemberDetails({ ...memberDetails, dateOfBirth: e.target.value })}
              />

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '13px', marginTop: '8px',
                  border: 'none', backgroundColor: loading ? MUTED : INK, color: '#FFF',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'Atak, sans-serif',
                }}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </form>

            <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: `1px solid ${RULE}` }}>
              <button
                onClick={logout}
                style={{
                  width: '100%', padding: '13px',
                  border: '1px solid rgba(200,50,50,0.3)', backgroundColor: 'transparent',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer', color: '#C03030',
                  fontFamily: 'Atak, sans-serif',
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* PASSWORD TAB */}
        {activeTab === 'security' && (
          <div style={{ padding: '24px 20px' }}>
            <form onSubmit={handlePasswordChange}>
              <FieldRow
                label="Current Password"
                value={passwords.currentPassword}
                type="password"
                onChange={e => setPasswords({ ...passwords, currentPassword: e.target.value })}
              />
              <FieldRow
                label="New Password"
                value={passwords.newPassword}
                type="password"
                onChange={e => setPasswords({ ...passwords, newPassword: e.target.value })}
              />
              <FieldRow
                label="Confirm Password"
                value={passwords.confirmPassword}
                type="password"
                onChange={e => setPasswords({ ...passwords, confirmPassword: e.target.value })}
              />
              <div style={{ fontSize: '11px', color: MUTED, marginTop: '-8px', marginBottom: '20px' }}>
                Minimum 6 characters
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '13px',
                  border: 'none', backgroundColor: loading ? MUTED : INK, color: '#FFF',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'Atak, sans-serif',
                }}
              >
                {loading ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div style={{ padding: '24px 20px' }}>
            {/* Stats strip */}
            <div style={{ display: 'flex', gap: '1px', marginBottom: '24px' }}>
              {[
                { label: 'Courses',          value: history.length },
                { label: 'Completed',        value: history.filter(h => h.status === 'completed').length },
                { label: 'Classes Attended', value: stats.attendedClasses || history.reduce((s, h) => s + (h.classesAttended || 0), 0) },
              ].map((stat, i) => (
                <div key={i} style={{ flex: 1, padding: '12px', backgroundColor: ALT, textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700 }}>{stat.value}</div>
                  <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Course list */}
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: MUTED }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>No Course History</div>
                <div style={{ fontSize: '12px' }}>Your completed courses will appear here</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {history.map(course => (
                  <div key={course.id} style={{ padding: '14px', border: `1px solid ${RULE}`, backgroundColor: ALT }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '3px' }}>
                          {course.courseIdentifier || course.courseTitle || course.title}
                        </div>
                        <div style={{ fontSize: '11px', color: MUTED }}>
                          {formatHistoryDate(course.startDate)} – {formatHistoryDate(course.endDate)}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                        padding: '4px 8px', marginLeft: '8px', flexShrink: 0,
                        backgroundColor: TC_LIGHT, color: TC_DARK,
                      }}>
                        {course.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '11px', color: MUTED }}>
                        {course.classesAttended != null ? `${course.classesAttended} classes attended` : ''}
                        {course.instructor ? ` · ${course.instructor}` : ''}
                      </div>
                      <button
                        onClick={() => loadCoursePieces(course.id)}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                          color: TC, fontFamily: 'Atak, sans-serif',
                        }}
                      >
                        View Gallery →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* GALLERY PIECES MODAL */}
      {showPiecesModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: '16px',
        }}>
          <div style={{
            backgroundColor: '#FFFFFF', width: '100%', maxWidth: '640px',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            {/* Modal header */}
            <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${RULE}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Gallery Pieces</div>
                {selectedCourse && (
                  <div style={{ fontSize: '11px', color: MUTED }}>
                    {selectedCourse.title} &bull; {formatHistoryDate(selectedCourse.startDate)} – {formatHistoryDate(selectedCourse.endDate)}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setShowPiecesModal(false); setSelectedCourse(null); setCoursePieces([]); }}
                style={{
                  background: 'none', border: `1px solid ${RULE}`, cursor: 'pointer',
                  padding: '4px 8px', fontSize: '12px', color: MUTED, fontFamily: 'Atak, sans-serif',
                }}
              >
                Close
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '20px' }}>
              {coursePieces.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: MUTED }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>No Gallery Pieces Yet</div>
                  <div style={{ fontSize: '12px' }}>You haven't added any pieces from this course</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                  {coursePieces.map(piece => (
                    <div key={piece.id} style={{ backgroundColor: ALT, overflow: 'hidden' }}>
                      {piece.images && piece.images.length > 0 && piece.images[0].url ? (
                        <img
                          src={piece.images[0].url}
                          alt={piece.title}
                          style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '160px', backgroundColor: ALT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '36px', color: MUTED }}>photo</span>
                        </div>
                      )}
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>{piece.title}</div>
                        {piece.description && (
                          <div style={{ fontSize: '11px', color: MUTED, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {piece.description}
                          </div>
                        )}
                        {piece.date_completed && (
                          <div style={{ fontSize: '10px', color: MUTED, marginTop: '6px' }}>
                            Completed: {formatHistoryDate(piece.date_completed)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM TAB BAR */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        backgroundColor: '#FFFFFF', borderTop: `1px solid ${RULE}`,
        display: 'flex', height: '60px',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {bottomNavTabs.map(tab => {
          const active = tab.id === 'account';
          return (
            <a
              key={tab.id}
              href={tab.href}
              style={{
                flex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: '2px', padding: '8px 0',
                position: 'relative', textDecoration: 'none',
              }}
            >
              {active && (
                <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '20px', height: '2px', backgroundColor: TC }} />
              )}
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '22px',
                  color: active ? TC : '#BBBBBB',
                  fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
                }}
              >
                {tab.icon}
              </span>
              <span style={{
                fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: active ? TC : '#BBBBBB',
              }}>
                {tab.label}
              </span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
