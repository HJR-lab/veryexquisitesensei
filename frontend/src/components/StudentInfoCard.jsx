import { useState } from 'react';

// ─── Design tokens ───────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

export default function StudentInfoCard({
  student,
  studentName,
  studentInitial,
  memberSince,
  editForm,
  setEditForm,
  isEditing,
  setIsEditing,
  saving,
  saveChanges,
  saveMessage,
  setSaveMessage,
  formatDate,
  isMobile,
  isInstructor,
  isAlsoStudent,
  enrollment,
  resuming,
  handleResumeCourse,
  handleImpersonate,
  handleCompleteCourse,
  setShowPauseModal,
  teachingData,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Profile + Membership */}
      <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, padding: '24px' }}>

        {/* Top row: avatar/name + membership */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ width: '52px', height: '52px', backgroundColor: TC_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px', overflow: 'hidden' }}>
              {(editForm.profilePicture || student.profile_picture) ? (
                <img src={editForm.profilePicture || student.profile_picture} alt={studentName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '20px', fontWeight: 700, color: TC_DARK }}>{studentInitial}</span>
              )}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '3px' }}>{studentName}</div>
            <div style={{ fontSize: '12px', color: MUTED }}>Member since {memberSince}</div>
          </div>

          {/* Membership badge */}
          {student.membership && (() => {
            const m = student.membership;
            const monthMatch = (m.type || '').match(/(\d+)/);
            const months = monthMatch ? parseInt(monthMatch[1]) : 3;
            const tier = months >= 12 ? 'Gold' : months >= 6 ? 'Silver' : 'Bronze';
            const tierColors = { Bronze: '#CD7F32', Silver: '#A0A0A0', Gold: '#D4A017' };
            return (
              <div style={{ backgroundColor: TC_LIGHT, border: `1px solid ${TC}`, padding: '10px 12px', flexShrink: 0, maxWidth: '160px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC }}>★ Clay Club</span>
                  <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '1px 5px', backgroundColor: tierColors[tier], color: '#FFF' }}>{tier}</span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>{m.type?.replace(/^Clay Club\s*/i, '') || m.type}</div>
                <div style={{ fontSize: '10px', color: MUTED, marginBottom: '8px' }}>
                  {m.startDate ? new Date(m.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  {m.endDate ? ` — ${new Date(m.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                </div>
                <span style={{
                  fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '2px 7px',
                  backgroundColor: m.status === 'active' ? TC : MUTED,
                  color: '#FFF',
                }}>{m.status}</span>
              </div>
            );
          })()}
        </div>

        {/* Details fields */}
        <div style={{ paddingTop: '14px', borderTop: `1px solid ${RULE}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: MUTED }}>Details</span>
            {saveMessage && (
              <span style={{ fontSize: '11px', fontWeight: 600, color: saveMessage.type === 'ok' ? '#1E6B1E' : '#C0392B' }}>{saveMessage.text}</span>
            )}
          </div>

          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Name row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '4px' }}>First Name</div>
                  <input value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                    style={{ width: '100%', padding: '7px 9px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '4px' }}>Last Name</div>
                  <input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                    style={{ width: '100%', padding: '7px 9px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '4px' }}>Email</div>
                <input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  style={{ width: '100%', padding: '7px 9px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '4px' }}>Customer Type</div>
                <select value={editForm.customerType} onChange={e => setEditForm(f => ({ ...f, customerType: e.target.value }))}
                  style={{ width: '100%', padding: '7px 9px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', backgroundColor: '#FFF' }}>
                  <option value="student">Student</option>
                  <option value="member">Member</option>
                  <option value="student & member">Student & Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '4px' }}>Community Role</div>
                <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                  style={{ width: '100%', padding: '7px 9px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', backgroundColor: '#FFF' }}>
                  <option value="student">Student</option>
                  <option value="member">Member</option>
                  <option value="instructor">Instructor</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '4px' }}>Courses Purchased</div>
                  <input type="number" value={editForm.coursePurchaseCount} onChange={e => setEditForm(f => ({ ...f, coursePurchaseCount: e.target.value }))}
                    style={{ width: '100%', padding: '7px 9px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '4px' }}>Classes Allocated</div>
                  <input type="number" value={editForm.classesAllocated} onChange={e => setEditForm(f => ({ ...f, classesAllocated: e.target.value }))}
                    style={{ width: '100%', padding: '7px 9px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                </div>
              </div>
              {/* Read-only */}
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '3px' }}>Shopify ID</div>
                <div style={{ fontSize: '12px', color: MUTED }}>{student.shopify_customer_id || 'N/A'}</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Email',            value: student.email },
                { label: 'Customer Type',    value: student.customer_type || 'student' },
                { label: 'Community Role',   value: student.role || 'student' },
                { label: 'Shopify ID',       value: student.shopify_customer_id || 'N/A' },
                ...(isInstructor ? (() => {
                  const courses = teachingData?.courses || [];
                  const totalClasses = courses.reduce((sum, c) => sum + (c.classes?.length || 0), 0);
                  const totalStudents = courses.reduce((sum, c) => sum + (c.totalEnrollment || 0), 0);
                  return [
                    { label: 'Courses',          value: courses.length },
                    { label: 'Total Classes',    value: totalClasses },
                    { label: 'Total Students',   value: totalStudents },
                  ];
                })() : [
                  { label: 'Courses Purchased', value: student.course_purchase_count ?? 'N/A' },
                  { label: 'Classes Allocated', value: student.classes_allocated ?? 'N/A' },
                ]),
                { label: 'Created',          value: formatDate(student.created_at) },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '3px' }}>{f.label}</div>
                  <div style={{ fontSize: '13px', wordBreak: 'break-all' }}>{f.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '8px' }}>
        {isEditing ? (
          <>
            <button
              onClick={saveChanges}
              disabled={saving}
              style={{ flex: 1, padding: '11px', backgroundColor: INK, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setIsEditing(false); setSaveMessage(null); }}
              style={{ flex: 1, padding: '11px', backgroundColor: 'transparent', color: INK, border: `1px solid ${RULE}`, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            style={{ flex: 1, padding: '11px', backgroundColor: INK, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Edit
          </button>
        )}
        {(!isInstructor || isAlsoStudent) && enrollment && enrollment.status === 'active' && (
          <button
            onClick={() => setShowPauseModal(true)}
            style={{ flex: 1, padding: '11px', backgroundColor: 'transparent', color: INK, border: `1px solid ${RULE}`, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Pause Course
          </button>
        )}
        {(!isInstructor || isAlsoStudent) && enrollment && enrollment.status !== 'completed' && handleCompleteCourse && (
          <button
            onClick={handleCompleteCourse}
            style={{ flex: 1, padding: '11px', backgroundColor: '#2E7D32', color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Complete
          </button>
        )}
        {(!isInstructor || isAlsoStudent) && enrollment && enrollment.status === 'completed' && (
          <div style={{ flex: 1, padding: '11px', backgroundColor: '#E8F5E9', color: '#2E7D32', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>
            Completed
          </div>
        )}
        {(!isInstructor || isAlsoStudent) && enrollment && enrollment.status === 'paused' && (
          <button
            onClick={handleResumeCourse}
            disabled={resuming}
            style={{ flex: 1, padding: '11px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: resuming ? 'not-allowed' : 'pointer', opacity: resuming ? 0.7 : 1 }}
          >
            {resuming ? 'Resuming…' : 'Resume Course'}
          </button>
        )}
        {isInstructor && (
          <button
            onClick={handleImpersonate}
            style={{ flex: 1, padding: '11px', backgroundColor: TC_LIGHT, color: TC_DARK, border: `1px solid ${TC}`, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            View as Instructor
          </button>
        )}
        {(!isInstructor || isAlsoStudent) && (
          <button
            onClick={handleImpersonate}
            style={{ flex: 1, padding: '11px', backgroundColor: student.membership ? TC_LIGHT : 'transparent', color: student.membership ? TC_DARK : MUTED, border: `1px solid ${student.membership ? TC : RULE}`, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            View as User
          </button>
        )}
      </div>

      {/* ── Membership Details Card ── */}
      {student.membership && (() => {
        const m = student.membership;
        const daysLeft = Math.ceil((new Date(m.endDate) - new Date()) / (1000 * 60 * 60 * 24));
        const totalDays = Math.ceil((new Date(m.endDate) - new Date(m.startDate)) / (1000 * 60 * 60 * 24));
        const pct = totalDays > 0 ? Math.min(100, Math.max(0, Math.round(((totalDays - Math.max(daysLeft, 0)) / totalDays) * 100))) : 100;
        const DEFAULT_PERKS = {
          1:  ['Unlimited studio access', 'Free dedicated storage', 'Free shelving space', 'All studio glazes included'],
          3:  ['Unlimited studio access', 'Free dedicated storage', 'Free shelving space', 'All studio glazes included'],
          6:  ['Unlimited studio access', 'Free dedicated storage', 'Free shelving space', 'All studio glazes included', 'Studio-assisted clay reclaim', 'FREE 1x Firing (worth $90)', '10% off clay, tools, firing & courses'],
          12: ['Unlimited studio access', 'Free dedicated storage', 'Free shelving space', 'All studio glazes included', 'Studio-assisted clay reclaim', 'FREE 2x $130 Firing Basket (worth $260)', '10% off clay, tools, firing & courses'],
        };
        const monthMatch2 = (m.type || '').match(/(\d+)/);
        const planMonths = monthMatch2 ? parseInt(monthMatch2[1]) : 3;
        const perks = DEFAULT_PERKS[planMonths] || DEFAULT_PERKS[3];
        const isActive = m.status === 'active' && daysLeft > 0;
        const isExpiring = isActive && daysLeft <= 30;

        return (
          <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${isExpiring ? '#E6A817' : RULE}`, padding: '16px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: MUTED, marginBottom: '12px' }}>Membership Details</div>

            {/* Progress */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: MUTED, marginBottom: '5px' }}>
                <span>{daysLeft > 0 ? `${daysLeft} days remaining` : m.status === 'cancelled' ? 'Cancelled' : 'Expired'}</span>
                <span>{pct}%</span>
              </div>
              <div style={{ height: '3px', backgroundColor: 'rgba(40,40,40,0.08)', position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: '3px',
                  width: `${!isActive ? 100 : pct}%`,
                  backgroundColor: !isActive ? MUTED : isExpiring ? '#E6A817' : TC,
                }} />
              </div>
            </div>

            {/* Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Start</div>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>{new Date(m.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Expires</div>
                <div style={{ fontSize: '12px', fontWeight: isExpiring ? 700 : 600, color: isExpiring ? '#9E6200' : INK }}>{new Date(m.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
            </div>

            {/* Perks */}
            {perks.length > 0 && (
              <div>
                <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Perks</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {perks.map((p, i) => (
                    <span key={i} style={{ fontSize: '10px', padding: '3px 8px', backgroundColor: ALT, color: MUTED }}>{p}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
}
