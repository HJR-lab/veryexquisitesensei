import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import ImpersonationBanner from '../components/ImpersonationBanner';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const BADGE_TIERS = {
  '1':  { label: 'Bronze',  bg: '#CD7F32', color: '#FFFFFF' },
  '6':  { label: 'Silver',  bg: '#A0A0A0', color: '#FFFFFF' },
  '12': { label: 'Gold',    bg: '#D4A017', color: '#FFFFFF' },
};

function getMemberBadge(membershipType) {
  if (!membershipType) return null;
  const match = membershipType.match(/(\d+)\s*month/i);
  if (!match) return null;
  return BADGE_TIERS[match[1]] || BADGE_TIERS['1'];
}

function MemberBadge({ membershipType, style = {} }) {
  const tier = getMemberBadge(membershipType);
  if (!tier) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '2px 7px', backgroundColor: tier.bg, color: tier.color,
      verticalAlign: 'middle', ...style,
    }}>
      {tier.label}
    </span>
  );
}

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

  // Class History state
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ totalClasses: 0, attendedClasses: 0 });
  const [coursePieces, setCoursePieces] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [showPiecesModal, setShowPiecesModal] = useState(false);
  const [membershipData, setMembershipData] = useState(null);

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
    loadMembership();
  }, [user]);

  const loadMembership = async () => {
    try {
      const res = await api.get('/membership/my-membership');
      setMembershipData(res.data);
    } catch (error) {
      console.error('Failed to load membership:', error);
    }
  };

  const loadHistory = async () => {
    try {
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

      const { data } = await api.post('/upload/image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
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
    { id: 'history',  label: 'History'  },
  ];

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>

      <ImpersonationBanner />

      {/* MEMBERSHIP BANNER */}
      {membershipData?.hasMembership ? (
        <div style={{ backgroundColor: TC_LIGHT, width: '100%' }}>
          <div style={{
            maxWidth: '520px', margin: '0 auto', padding: '9px 20px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
              color: '#FFFFFF', backgroundColor: TC_DARK, padding: '2px 6px', flexShrink: 0,
            }}>
              Clay Club Member
            </span>
            <span style={{ fontSize: '11px', color: INK, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {membershipData.membership.type.replace(/^Clay Club\s*/i, '').replace(/1 Months/i, '1 Month').trim() + ' Member'}
              {membershipData.membership.daysRemaining > 0
                ? ` · ${membershipData.membership.daysRemaining} days left`
                : ' · Expires soon'}
            </span>
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TC_DARK, flexShrink: 0 }}>
              Active
            </span>
          </div>
        </div>
      ) : (
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
      )}

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
              {membershipData?.hasMembership && (
                <MemberBadge membershipType={membershipData.membership.type} style={{ marginLeft: '8px', position: 'relative', top: '-2px' }} />
              )}
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

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div style={{ padding: '24px 20px' }}>
            {/* Stats strip */}
            <div style={{ display: 'flex', gap: '1px', marginBottom: '24px' }}>
              {[
                { label: 'Courses',          value: history.filter(h => h.type === 'course').length },
                { label: 'Completed',        value: history.filter(h => h.type === 'course' && h.status === 'completed').length },
                { label: 'Classes Attended', value: history.reduce((s, h) => s + (h.classesAttended || h.classes?.filter(c => c.attended).length || 0), 0) },
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
                          {course.courseTitle || course.title || course.courseIdentifier}
                        </div>
                        <div style={{ fontSize: '11px', color: MUTED }}>
                          {formatHistoryDate(course.startDate)} – {formatHistoryDate(course.endDate)}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                        padding: '4px 8px', marginLeft: '8px', flexShrink: 0,
                        backgroundColor: course.status === 'awaiting confirmation' ? '#FFF7E6' : TC_LIGHT,
                        color: course.status === 'awaiting confirmation' ? '#9E6200' : TC_DARK,
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

    </div>
  );
}
