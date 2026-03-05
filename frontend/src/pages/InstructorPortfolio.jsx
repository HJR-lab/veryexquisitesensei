import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { communityAPI } from '../utils/api';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const BG       = '#FAFAF8';

export default function InstructorPortfolio() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const profileFileRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bio, setBio] = useState('');
  const [uploading, setUploading] = useState(false);

  // New item form
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState('image');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newFile, setNewFile] = useState(null);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await communityAPI.getInstructorPortfolio(user.dbCustomerId || user.id);
      setProfile(data.instructor);
      setPortfolio(data.portfolio || []);
      setBio(data.instructor?.bio || '');
    } catch (err) {
      console.error('Failed to load portfolio:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveBio = async () => {
    try {
      setSaving(true);
      await communityAPI.updateProfile({ bio });
    } catch (err) {
      console.error('Failed to save bio:', err);
    } finally {
      setSaving(false);
    }
  };

  const uploadProfileImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const result = await communityAPI.uploadProfileImage(file);
      setProfile(prev => ({ ...prev, profile_image: result.url }));
    } catch (err) {
      console.error('Failed to upload profile image:', err);
    } finally {
      setUploading(false);
    }
  };

  const addPortfolioItem = async () => {
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('title', newTitle);
      formData.append('description', newDesc);
      formData.append('media_type', newType);

      if (newType === 'image' && newFile) {
        formData.append('image', newFile);
      } else if (newType === 'video') {
        formData.append('video_url', newVideoUrl);
      }

      const item = await communityAPI.addPortfolioItem(formData);
      setPortfolio(prev => [...prev, item]);
      resetForm();
    } catch (err) {
      console.error('Failed to add portfolio item:', err);
    } finally {
      setUploading(false);
    }
  };

  const deleteItem = async (id) => {
    try {
      await communityAPI.deletePortfolioItem(id);
      setPortfolio(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setNewTitle('');
    setNewDesc('');
    setNewType('image');
    setNewVideoUrl('');
    setNewFile(null);
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    fontSize: '14px', padding: '10px 12px',
    border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF',
    color: INK, outline: 'none', fontFamily: 'inherit',
  };

  if (loading) {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '12px', color: MUTED }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
        <div style={{
          maxWidth: '800px', margin: '0 auto', padding: '0 24px',
          height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: INK }}>My Portfolio</div>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              fontSize: '11px', fontWeight: 600, color: MUTED, letterSpacing: '0.04em', textTransform: 'uppercase',
              border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Dashboard
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* Profile section */}
        <section style={{ marginBottom: '40px', padding: '24px', backgroundColor: BG, border: `1px solid ${RULE}` }}>
          <div style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: MUTED, marginBottom: '16px',
          }}>
            Profile
          </div>

          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Profile image */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '100px', height: '100px', borderRadius: '50%', overflow: 'hidden',
                backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, marginBottom: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {profile?.profile_image ? (
                  <img src={profile.profile_image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ fontSize: '32px', fontWeight: 700, color: TC }}>{profile?.name?.charAt(0)?.toUpperCase()}</div>
                )}
              </div>
              <input type="file" ref={profileFileRef} accept="image/*" onChange={uploadProfileImage} style={{ display: 'none' }} />
              <button
                onClick={() => profileFileRef.current?.click()}
                disabled={uploading}
                style={{
                  fontSize: '10px', fontWeight: 600, color: TC, border: `1px solid ${TC}`,
                  backgroundColor: 'transparent', padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {uploading ? 'Uploading...' : 'Change Photo'}
              </button>
            </div>

            {/* Bio */}
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: MUTED, display: 'block', marginBottom: '6px' }}>Bio</label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Tell people about yourself, your experience, teaching style..."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <button
                onClick={saveBio}
                disabled={saving}
                style={{
                  marginTop: '8px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                  padding: '8px 20px', backgroundColor: TC, color: '#FFFFFF',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save Bio'}
              </button>
            </div>
          </div>
        </section>

        {/* Portfolio items */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: MUTED,
            }}>
              Portfolio · {portfolio.length} item{portfolio.length !== 1 ? 's' : ''}
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              style={{
                fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                padding: '8px 16px', backgroundColor: showForm ? '#FFFFFF' : TC, color: showForm ? TC : '#FFFFFF',
                border: `1px solid ${TC}`, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {showForm ? 'Cancel' : 'Add Item'}
            </button>
          </div>

          {/* Add form */}
          {showForm && (
            <div style={{ padding: '20px', backgroundColor: BG, border: `1px solid ${RULE}`, marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {['image', 'video'].map(t => (
                  <button
                    key={t}
                    onClick={() => setNewType(t)}
                    style={{
                      fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                      padding: '6px 14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      backgroundColor: newType === t ? TC : 'transparent',
                      color: newType === t ? '#FFFFFF' : MUTED,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: '10px' }}>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Title (optional)" style={inputStyle} />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" style={inputStyle} />
              </div>

              {newType === 'image' ? (
                <div style={{ marginBottom: '12px' }}>
                  <input type="file" ref={fileRef} accept="image/*" onChange={e => setNewFile(e.target.files?.[0])} style={{ display: 'none' }} />
                  <button
                    onClick={() => fileRef.current?.click()}
                    style={{
                      fontSize: '12px', padding: '10px 20px', border: `1px dashed ${RULE}`,
                      backgroundColor: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', color: MUTED, width: '100%',
                    }}
                  >
                    {newFile ? newFile.name : 'Choose image...'}
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: '12px' }}>
                  <input
                    value={newVideoUrl}
                    onChange={e => setNewVideoUrl(e.target.value)}
                    placeholder="YouTube or Instagram URL"
                    style={inputStyle}
                  />
                </div>
              )}

              <button
                onClick={addPortfolioItem}
                disabled={uploading || (newType === 'image' && !newFile) || (newType === 'video' && !newVideoUrl)}
                style={{
                  fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                  padding: '10px 24px', backgroundColor: TC, color: '#FFFFFF',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  opacity: uploading ? 0.7 : 1,
                }}
              >
                {uploading ? 'Uploading...' : 'Add to Portfolio'}
              </button>
            </div>
          )}

          {/* Portfolio grid */}
          {portfolio.length === 0 && !showForm ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: INK, marginBottom: '4px' }}>No portfolio items yet</div>
              <div style={{ fontSize: '12px', color: MUTED }}>Add images of your work, process shots, or video links.</div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '16px',
            }}>
              {portfolio.map(item => (
                <div key={item.id} style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', overflow: 'hidden', position: 'relative' }}>
                  {item.media_type === 'video' ? (
                    <div style={{ aspectRatio: '16/9', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <a href={item.media_url} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#FFFFFF', fontSize: '12px' }}>
                        Video
                      </a>
                    </div>
                  ) : (
                    <div style={{ aspectRatio: '1', backgroundColor: BG, overflow: 'hidden' }}>
                      <img src={item.media_url} alt={item.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}

                  <div style={{ padding: '10px 12px' }}>
                    {item.title && <div style={{ fontSize: '12px', fontWeight: 600, color: INK }}>{item.title}</div>}
                    {item.description && <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{item.description}</div>}
                    <button
                      onClick={() => deleteItem(item.id)}
                      style={{
                        marginTop: '8px', fontSize: '10px', color: '#C0392B', border: 'none',
                        background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
