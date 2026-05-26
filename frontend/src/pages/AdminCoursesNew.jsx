import { useState, useEffect } from 'react';
import api from '../utils/api';
import AdminPage from '../components/AdminPage';
import AdminCohorts from './AdminCohorts';
import AdminCourseConfig from './AdminCourseConfig';
import AdminPiecePipeline from './AdminPiecePipeline';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const labelSt = { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' };
const inputSt = { width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' };

const TABS = [
  { key: 'courses',    label: 'Courses' },
  { key: 'cohort',     label: 'Cohort' },
  { key: 'settings',   label: 'Settings' },
  { key: 'collection', label: 'Collection' },
  { key: 'waitlist',   label: 'Waitlist' },
];

export default function AdminCoursesNew() {
  const initialTab = (() => {
    if (typeof window === 'undefined') return 'courses';
    const fromUrl = new URLSearchParams(window.location.search).get('tab');
    return TABS.some(t => t.key === fromUrl) ? fromUrl : 'courses';
  })();
  const [activeTab, setActiveTab] = useState(initialTab);

  const switchTab = (key) => {
    setActiveTab(key);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', key);
      window.history.replaceState({}, '', url);
    }
  };

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '24px 24px 0' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>Admin</div>
        <div style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${RULE}`, marginTop: '12px' }}>
          {TABS.map(t => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${isActive ? TC : 'transparent'}`,
                  marginBottom: '-1px',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: isActive ? TC : MUTED,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'courses'    && <CoursesTab />}
      {activeTab === 'cohort'     && <AdminCohorts embedded />}
      {activeTab === 'settings'   && <AdminCourseConfig embedded />}
      {activeTab === 'collection' && <AdminPiecePipeline embedded />}
      {activeTab === 'waitlist'   && <WaitlistPlaceholder />}
    </div>
  );
}

function WaitlistPlaceholder() {
  return (
    <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '60px 24px' }}>
      <div style={{ padding: '80px 40px', textAlign: 'center', color: MUTED, backgroundColor: '#FFF', border: `1px solid ${RULE}` }}>
        <span className="material-symbols-outlined" style={{ fontSize: '40px', color: RULE, marginBottom: '12px', display: 'block' }}>schedule</span>
        <div style={{ fontSize: '14px', fontWeight: 700, color: INK, marginBottom: '4px' }}>Waitlist</div>
        <div style={{ fontSize: '12px' }}>Parked — coming soon.</div>
      </div>
    </main>
  );
}

function CoursesTab() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [formData, setFormData] = useState({
    classType: '', instructor: '', description: '',
    maxCapacity: '', classDate: '', startTime: '', endTime: '', room: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchCourses(); }, []);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const res = await api.get('/classes/available');
      setCourses(res.data.classes || []);
    } catch (err) {
      console.error('Error fetching courses:', err);
    } finally {
      setLoading(false);
    }
  };

  // Group by classType prefix (e.g. "WTTUE_JL" → all Tuesday JL classes)
  const grouped = courses.reduce((acc, c) => {
    const key = c.classType || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  const courseTypes = Object.keys(grouped).sort();

  const selectCourse = (course) => {
    setSelectedId(course.id);
    setFormData({
      classType: course.classType || '',
      instructor: course.instructor || '',
      description: course.description || '',
      maxCapacity: course.maxCapacity || '',
      classDate: course.classDate ? course.classDate.split('T')[0] : '',
      startTime: course.startTime || '',
      endTime: course.endTime || '',
      room: course.room || '',
    });
  };

  const selected = courses.find(c => c.id === selectedId);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.put(`/classes/${selected.id}`, formData);
      fetchCourses();
    } catch (err) {
      console.error('Error saving:', err);
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected || !confirm('Delete this class instance? This cannot be undone.')) return;
    try {
      await api.delete(`/classes/${selected.id}`);
      setSelectedId(null);
      fetchCourses();
    } catch (err) {
      console.error('Error deleting:', err);
      alert('Failed to delete');
    }
  };

  const fmtDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const getTypeLabel = (classType) => {
    if (!classType) return 'Class';
    if (classType.toUpperCase().startsWith('WT')) return 'Wheelthrowing';
    if (classType.toUpperCase().startsWith('HB')) return 'Handbuilding';
    if (classType.toUpperCase().startsWith('KD')) return 'Kids';
    return classType;
  };

  return (
    <AdminPage
      embedded
      title="Courses"
      subtitle={`${courseTypes.length} course types · ${courses.length} total class instances`}
    >
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          {/* Left: Course type list */}
          <div style={{ width: '320px', flexShrink: 0 }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: MUTED }}>Loading...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {courseTypes.map(type => {
                  const instances = grouped[type];
                  const isSelected = selected?.classType === type;
                  const futureDates = instances
                    .filter(c => new Date(c.classDate) >= new Date())
                    .sort((a, b) => new Date(a.classDate) - new Date(b.classDate));
                  const sample = instances[0];

                  return (
                    <div key={type}>
                      {/* Course type header */}
                      <div
                        style={{
                          padding: '12px 14px',
                          backgroundColor: isSelected ? TC_LIGHT : '#FFF',
                          border: `1px solid ${isSelected ? TC : RULE}`,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '10px',
                        }}
                        onClick={() => { if (instances.length > 0) selectCourse(instances[0]); }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: INK, marginBottom: '2px' }}>{type}</div>
                          <div style={{ fontSize: '11px', color: MUTED }}>
                            {getTypeLabel(type)} &middot; {sample?.instructor || '?'} &middot; {instances.length} classes
                          </div>
                        </div>
                        {futureDates.length > 0 && (
                          <div style={{ fontSize: '10px', color: TC_DARK, fontWeight: 600, flexShrink: 0 }}>
                            {futureDates.length} upcoming
                          </div>
                        )}
                      </div>

                      {/* Expanded: show individual class instances */}
                      {isSelected && instances.length > 1 && (
                        <div style={{ borderLeft: `2px solid ${TC}`, marginLeft: '14px' }}>
                          {instances
                            .sort((a, b) => new Date(a.classDate) - new Date(b.classDate))
                            .map(inst => (
                              <div
                                key={inst.id}
                                onClick={() => selectCourse(inst)}
                                style={{
                                  padding: '8px 14px',
                                  cursor: 'pointer',
                                  backgroundColor: selectedId === inst.id ? TC_LIGHT : 'transparent',
                                  fontSize: '12px',
                                  color: selectedId === inst.id ? TC_DARK : MUTED,
                                  fontWeight: selectedId === inst.id ? 600 : 400,
                                  borderBottom: `1px solid ${RULE}`,
                                }}
                              >
                                {fmtDate(inst.classDate)} &middot; {inst.startTime}–{inst.endTime}
                                {inst.currentEnrollment > 0 && (
                                  <span style={{ marginLeft: '8px', fontSize: '10px', color: INK }}>
                                    {inst.currentEnrollment}/{inst.maxCapacity}
                                  </span>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Edit panel */}
          <div style={{ flex: 1 }}>
            {selected ? (
              <div style={{ backgroundColor: '#FFF', border: `1px solid ${RULE}`, padding: '28px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '2px' }}>{selected.classType}</div>
                  <div style={{ fontSize: '12px', color: MUTED }}>{fmtDate(selected.classDate)} &middot; {selected.startTime}–{selected.endTime}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <label style={labelSt}>Course Type</label>
                    <input
                      value={formData.classType}
                      onChange={e => setFormData({ ...formData, classType: e.target.value })}
                      style={inputSt}
                      placeholder="e.g. WTTUE_JL"
                    />
                  </div>
                  <div>
                    <label style={labelSt}>Instructor</label>
                    <input
                      value={formData.instructor}
                      onChange={e => setFormData({ ...formData, instructor: e.target.value })}
                      style={inputSt}
                      placeholder="e.g. JL"
                    />
                  </div>
                  <div>
                    <label style={labelSt}>Room</label>
                    <input
                      value={formData.room}
                      onChange={e => setFormData({ ...formData, room: e.target.value })}
                      style={inputSt}
                      placeholder="e.g. Main Studio"
                    />
                  </div>
                  <div>
                    <label style={labelSt}>Capacity</label>
                    <input
                      type="number"
                      value={formData.maxCapacity}
                      onChange={e => setFormData({ ...formData, maxCapacity: e.target.value })}
                      style={inputSt}
                      placeholder="12"
                    />
                  </div>
                  <div>
                    <label style={labelSt}>Date</label>
                    <input
                      type="date"
                      value={formData.classDate}
                      onChange={e => setFormData({ ...formData, classDate: e.target.value })}
                      style={inputSt}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={labelSt}>Start</label>
                      <input
                        value={formData.startTime}
                        onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                        style={inputSt}
                        placeholder="10:00am"
                      />
                    </div>
                    <div>
                      <label style={labelSt}>End</label>
                      <input
                        value={formData.endTime}
                        onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                        style={inputSt}
                        placeholder="12:00pm"
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={labelSt}>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                    style={{ ...inputSt, resize: 'vertical' }}
                    placeholder="Course description..."
                  />
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: '16px', padding: '14px 0', borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`, marginBottom: '20px' }}>
                  {[
                    { label: 'Enrolled', value: selected.currentEnrollment || 0 },
                    { label: 'Capacity', value: selected.maxCapacity || 0 },
                    { label: 'Available', value: selected.spotsAvailable ?? (selected.maxCapacity - (selected.currentEnrollment || 0)) },
                    { label: 'Waitlist', value: selected.waitlistCount || 0 },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: INK }}>{s.value}</div>
                      <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleDelete}
                    style={{ padding: '10px 16px', border: '1px solid #C62828', background: 'none', color: '#C62828', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ padding: '10px 20px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '80px 40px', textAlign: 'center', color: MUTED, backgroundColor: '#FFF', border: `1px solid ${RULE}` }}>
                <span className="material-symbols-outlined" style={{ fontSize: '40px', color: RULE, marginBottom: '12px', display: 'block' }}>school</span>
                <div style={{ fontSize: '14px' }}>Select a course to edit</div>
              </div>
            )}
          </div>
        </div>
    </AdminPage>
  );
}
