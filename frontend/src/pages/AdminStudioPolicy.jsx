import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import AdminPage from '../components/AdminPage';
const TC       = '#C4622D';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';

const DEFAULT_SECTIONS = [
  { title: 'Course Overview', description: 'This six-week course covers the fundamentals of wheel-throwing. Students will learn to throw cylinder and bowl forms, turn and trim bases, and apply glazing techniques using VES studio glazes. By the end of the course, each student will have produced a set of glazed cups and bowls, available for collection within one month following the final glaze firing.', rules: [] },
  { title: 'What Your Course Fee Includes', rules: ['Clay, bisque firing for up to seven (7) pieces, and use of all advanced tools and equipment.', 'Decorating and glazing materials, including glaze firing.', 'Additional tools and supplementary pieces are available at extra cost.'] },
  { title: 'Refunds & Transfers', rules: ['All course fees are strictly non-refundable.', 'Students may transfer their entire course enrolment to another individual. Partial transfers are not permitted.'] },
  { title: 'Attendance & Make-Up Sessions', rules: ['Each student is entitled to one (1) make-up session during Weeks 1\u20135, and one (1) additional make-up session for Week 6 (glazing), subject to scheduling and availability.', 'Students must notify the studio in advance to arrange a make-up session.'] },
  { title: 'Punctuality', rules: ['As this is a structured course, punctuality is expected of all students.', 'The studio doors will open ten (10) minutes prior to the scheduled start time. Classes will begin and end promptly as scheduled.'] },
  { title: 'Required Items', rules: ['Pottery Tool Set \u2014 Required; bring your own or purchase ($18).', 'Advanced Trimming Tool \u2014 Optional add-on ($12).', 'Apron \u2014 Required; not provided by the studio. VES branded aprons available ($45).', 'Carry Bag / Tote \u2014 Required for transporting finished work. VES totes available ($12).'] },
  { title: 'Studio Etiquette', rules: ['Upon arrival, please press the doorbell located on the wall. A staff member will attend to you.', 'All work must be clearly initialled by the maker using three (3) characters (letters or numbers) to prevent any mix-ups.', 'Please clean your workspace after each session, including wiping down your seat and wheel for the next user.', 'Students who are unwell are asked to wear a mask while in the studio.', 'Comfortable clothing and closed-toe shoes are recommended.', 'Please ensure fingernails are trimmed appropriately for working with clay.', 'Food and beverages (other than water) are not permitted in the studio.', 'Students under the age of 16 must notify the studio in advance of enrolment.'] },
  { title: 'Additional Pieces & Studio Access', rules: ['Students wishing to produce more than seven (7) pieces may do so at a rate of $20 per additional piece.', 'Unguided wheel-throwing studio access is available to current students at $20 per hour, with a minimum booking of two (2) hours. Bookings are accepted in full-hour increments only.'] },
  { title: 'Returning Student Credits', highlight: true, rules: ['NEW FOR 2026 \u2014 All returning students will receive $20 in studio credits for each wheel-throwing course completed.', 'Credits may be applied towards additional pieces, studio access bookings, or a discount on your next course enrolment.', 'For enquiries, please email us at info@ves.sg.'] },
  { title: 'Firing Policy', rules: ['All pieces submitted for firing must be clearly signed by the maker. Unsigned works will not be fired.', 'VES Pottery Studio accepts no responsibility for unsigned or unclaimed pieces.'] },
  { title: 'Collection & Disposal', rules: ['Collection of finished pieces is by appointment only, beginning 9 May 2026.', 'The studio reserves the right to dispose of any uncollected pieces after 9 July 2026.', 'No reminder notifications will be issued. It is the student\u2019s responsibility to arrange timely collection.'] },
  { title: 'General Policy', rules: ['VES Pottery Studio reserves the right to refuse service, blacklist, or ban any individual who fails to comply with studio rules, or who engages in illegal, disruptive, or inappropriate conduct on the premises.'] },
];

export default function AdminStudioPolicy() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [focusIndex, setFocusIndex] = useState(null);
  const titleRefs = useRef({});

  useEffect(() => {
    api.get('/admin/settings/studio-policy')
      .then(res => setSections(res.data.sections || DEFAULT_SECTIONS))
      .catch(() => setSections(DEFAULT_SECTIONS))
      .finally(() => setLoading(false));
  }, []);

  // A new section lands at the bottom of a long page — bring it into view
  useEffect(() => {
    if (focusIndex === null) return;
    const el = titleRefs.current[focusIndex];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      el.select();
    }
    setFocusIndex(null);
  }, [focusIndex]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings/studio-policy', { sections });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateSection = (i, field, value) => {
    const updated = [...sections];
    updated[i] = { ...updated[i], [field]: value };
    setSections(updated);
    setSaved(false);
  };

  const updateRule = (si, ri, value) => {
    const updated = [...sections];
    const rules = [...updated[si].rules];
    rules[ri] = value;
    updated[si] = { ...updated[si], rules };
    setSections(updated);
    setSaved(false);
  };

  const addRule = (si) => {
    const updated = [...sections];
    updated[si] = { ...updated[si], rules: [...(updated[si].rules || []), ''] };
    setSections(updated);
  };

  const removeRule = (si, ri) => {
    const updated = [...sections];
    updated[si] = { ...updated[si], rules: updated[si].rules.filter((_, j) => j !== ri) };
    setSections(updated);
  };

  const addSection = () => {
    setSections([...sections, { title: 'New Section', rules: [''] }]);
    setFocusIndex(sections.length);
    setSaved(false);
  };

  const removeSection = (i) => {
    if (!confirm(`Delete "${sections[i].title}"?`)) return;
    setSections(sections.filter((_, j) => j !== i));
  };

  const moveSection = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const updated = [...sections];
    [updated[i], updated[j]] = [updated[j], updated[i]];
    setSections(updated);
  };

  if (loading) return (
    <div style={{ fontFamily: 'Atak, sans-serif' }}>
      <div style={{ textAlign: 'center', padding: '60px', color: MUTED }}>Loading...</div>
    </div>
  );

  return (
    <AdminPage
      title="Studio Policy"
      actions={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={addSection} style={{ padding: '8px 16px', border: `1px solid ${TC}`, background: 'none', color: TC, fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            + Add Section
          </button>
          <button onClick={save} disabled={saving} style={{ padding: '8px 20px', background: TC, color: '#FFF', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      }
    >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sections.map((section, si) => (
            <div key={si} style={{ background: '#FFF', border: `1px solid ${RULE}`, padding: '20px' }}>
              {/* Section header row */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button onClick={() => moveSection(si, -1)} disabled={si === 0} style={{ border: 'none', background: 'none', cursor: si === 0 ? 'default' : 'pointer', color: si === 0 ? '#DDD' : MUTED, fontSize: '14px', padding: 0, lineHeight: 1 }}>▲</button>
                  <button onClick={() => moveSection(si, 1)} disabled={si === sections.length - 1} style={{ border: 'none', background: 'none', cursor: si === sections.length - 1 ? 'default' : 'pointer', color: si === sections.length - 1 ? '#DDD' : MUTED, fontSize: '14px', padding: 0, lineHeight: 1 }}>▼</button>
                </div>
                <input
                  ref={el => { titleRefs.current[si] = el; }}
                  value={section.title}
                  onChange={e => updateSection(si, 'title', e.target.value)}
                  style={{ flex: 1, fontSize: '15px', fontWeight: 700, border: 'none', borderBottom: `1px solid ${RULE}`, padding: '4px 0', outline: 'none', fontFamily: 'inherit' }}
                  placeholder="Section title"
                />
                <button onClick={() => removeSection(si)} style={{ border: 'none', background: 'none', color: '#C62828', cursor: 'pointer', fontSize: '18px', padding: '0 4px' }}>×</button>
              </div>

              {/* Description */}
              {section.description !== undefined ? (
                <textarea
                  value={section.description || ''}
                  onChange={e => updateSection(si, 'description', e.target.value)}
                  rows={3}
                  style={{ width: '100%', fontSize: '13px', border: `1px solid ${RULE}`, padding: '8px', outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: '12px' }}
                  placeholder="Section description..."
                />
              ) : null}

              {/* Rules */}
              {(section.rules || []).map((rule, ri) => (
                <div key={ri} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: MUTED, marginTop: '8px', minWidth: '16px', textAlign: 'right' }}>{ri + 1}.</span>
                  <textarea
                    value={rule}
                    onChange={e => updateRule(si, ri, e.target.value)}
                    rows={2}
                    style={{ flex: 1, fontSize: '13px', border: `1px solid ${RULE}`, padding: '6px 8px', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <button onClick={() => removeRule(si, ri)} style={{ border: 'none', background: 'none', color: '#C62828', cursor: 'pointer', fontSize: '16px', padding: '4px', marginTop: '2px' }}>×</button>
                </div>
              ))}

              <button onClick={() => addRule(si)} style={{ fontSize: '11px', color: TC, background: 'none', border: `1px dashed ${RULE}`, padding: '4px 10px', cursor: 'pointer', marginTop: '4px' }}>
                + Add rule
              </button>
            </div>
          ))}
        </div>
    </AdminPage>
  );
}
