import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  fontSize: '13px', padding: '10px 12px',
  border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF',
  color: INK, outline: 'none', fontFamily: 'inherit',
};

export default function AdminInstructors() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [customers, setCustomers] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', bio: '' });
  const [profileFile, setProfileFile] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/customers');
      const raw = data.customers || data || [];
      const all = raw.map(c => ({
        ...c,
        id: c.dbId || c.id,
        first_name: c.firstName || c.first_name,
        last_name: c.lastName || c.last_name,
      }));
      setCustomers(all);
      setInstructors(all.filter(c => c.role === 'instructor'));
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };


  const setRole = async (id, role) => {
    try {
      setUpdating(id);
      await api.put(`/admin/customers/${id}/role`, { role });
      await loadData();
    } catch (err) {
      console.error('Failed to update role:', err);
    } finally {
      setUpdating(null);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfileFile(file);
      setProfilePreview(URL.createObjectURL(file));
    }
  };

  const createInstructor = async () => {
    if (!form.firstName.trim() || !form.email.trim()) {
      setFormMsg({ type: 'err', text: 'First name and email are required' });
      return;
    }
    try {
      setCreating(true);
      setFormMsg(null);

      // Create instructor
      const { data } = await api.post('/admin/instructors', {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim(),
        bio: form.bio.trim() || null,
      });

      // Upload profile pic if selected
      if (profileFile && data.id) {
        const formData = new FormData();
        formData.append('image', profileFile);
        await api.post(`/admin/instructors/${data.id}/profile-image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      setFormMsg({
        type: 'ok',
        text: data.updated
          ? 'Existing user updated to instructor. They can log in via verify email.'
          : 'Instructor created. They can set up access via verify email.',
      });
      setForm({ firstName: '', lastName: '', email: '', bio: '' });
      setProfileFile(null);
      setProfilePreview(null);
      await loadData();
      setTimeout(() => setFormMsg(null), 5000);
    } catch (err) {
      setFormMsg({ type: 'err', text: err.response?.data?.error || 'Failed to create instructor' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px 60px' }}>
        <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>
              Manage
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Instructors</h1>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setFormMsg(null); setProfileFile(null); setProfilePreview(null); }}
            style={{
              fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
              padding: '9px 18px',
              backgroundColor: showForm ? '#FFFFFF' : TC, color: showForm ? TC : '#FFFFFF',
              border: `1px solid ${TC}`, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {showForm ? 'Cancel' : 'Add Instructor'}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <section style={{ marginBottom: '32px', padding: '20px', backgroundColor: '#FFFFFF', border: `1px solid ${RULE}` }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '14px' }}>
              New Instructor
            </div>

            {formMsg && (
              <div style={{
                fontSize: '12px', padding: '8px 12px', marginBottom: '12px',
                backgroundColor: formMsg.type === 'ok' ? '#E8F5E9' : '#FDEDEC',
                color: formMsg.type === 'ok' ? '#1E6B1E' : '#C0392B',
              }}>
                {formMsg.text}
              </div>
            )}

            {/* Profile picture */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px' }}>
              <div style={{
                width: '72px', height: '72px', borderRadius: '50%', overflow: 'hidden',
                backgroundColor: TC_LIGHT, border: `1px solid ${RULE}`, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {profilePreview ? (
                  <img src={profilePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: '28px', color: TC }}>person</span>
                )}
              </div>
              <div>
                <input type="file" ref={fileRef} accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{
                    fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                    padding: '6px 14px', border: `1px solid ${TC}`, backgroundColor: '#FFFFFF',
                    color: TC, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {profileFile ? 'Change Photo' : 'Upload Photo'}
                </button>
                {profileFile && (
                  <div style={{ fontSize: '10px', color: MUTED, marginTop: '4px' }}>{profileFile.name}</div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '4px' }}>First Name *</div>
                <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '4px' }}>Last Name</div>
                <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '4px' }}>Email *</div>
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" type="email" style={inputStyle} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '4px' }}>Bio</div>
              <textarea
                value={form.bio}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="Teaching experience, specialties..."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={createInstructor}
                disabled={creating}
                style={{
                  fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                  padding: '10px 24px', backgroundColor: TC, color: '#FFFFFF',
                  border: 'none', cursor: creating ? 'default' : 'pointer', fontFamily: 'inherit',
                  opacity: creating ? 0.7 : 1,
                }}
              >
                {creating ? 'Creating...' : 'Create Instructor'}
              </button>
              <span style={{ fontSize: '11px', color: MUTED }}>They'll set up login via verify email</span>
            </div>
          </section>
        )}

        {/* Current instructors */}
        <section>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>
            Current Instructors · {instructors.length}
          </div>
          <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>
            {loading ? (
              <div style={{ padding: '20px', fontSize: '12px', color: MUTED }}>Loading...</div>
            ) : instructors.length === 0 ? (
              <div style={{ padding: '20px', fontSize: '12px', color: MUTED }}>No instructors yet. Click "Add Instructor" above to create one.</div>
            ) : (
              instructors.map((inst, i) => (
                <div key={inst.id} style={{
                  padding: '14px 16px',
                  borderBottom: i < instructors.length - 1 ? `1px solid ${RULE}` : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {/* Avatar */}
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden',
                      backgroundColor: TC_LIGHT, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {inst.profile_image ? (
                        <img src={inst.profile_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: '16px', fontWeight: 700, color: TC }}>{inst.first_name?.charAt(0)?.toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>
                        {inst.first_name} {inst.last_name}
                      </div>
                      <div style={{ fontSize: '11px', color: MUTED }}>{inst.email}</div>
                      {inst.bio && <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{inst.bio.slice(0, 80)}{inst.bio.length > 80 ? '...' : ''}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      onClick={() => navigate(`/admin/students/${encodeURIComponent(inst.email)}`)}
                      style={{
                        fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                        padding: '6px 12px', border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF',
                        color: INK, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      View
                    </button>
                    <button
                      onClick={() => setRole(inst.id, 'student')}
                      disabled={updating === inst.id}
                      style={{
                        fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                        padding: '6px 12px', border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF',
                        color: '#C0392B', cursor: 'pointer', fontFamily: 'inherit',
                        opacity: updating === inst.id ? 0.5 : 1,
                      }}
                    >
                      {updating === inst.id ? '...' : 'Remove'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
