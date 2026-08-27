// ─── Design tokens ───────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const labelSt = { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' };
const inputSt = { width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' };
const selectSt = { ...inputSt };

// ── Add Single Class Modal ─────────────────────────────────────────────────
export function AddSingleClassModal({ show, onClose, isMobile, courses }) {
  if (!show) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#FFFFFF', padding: isMobile ? '24px 20px' : '32px', width: '480px', maxWidth: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>Add Single Class</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED, lineHeight: 1, padding: '0 0 0 16px' }}>&#10005;</button>
        </div>
        <div style={{ fontSize: '12px', color: MUTED, marginBottom: '22px' }}>One-off session — holiday replacement or instructor unavailability</div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
          <div>
            <label style={labelSt}>Date</label>
            <input type="date" style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>Time Slot</label>
            <select style={selectSt}>
              <option>AM — 9:30am</option>
              <option>PM — 1:00pm</option>
              <option>NT — 7:00pm</option>
              <option>EV — 4:00pm</option>
            </select>
          </div>
          <div>
            <label style={labelSt}>Class Type</label>
            <select style={selectSt}>
              <option>WT — Wheel Throwing</option>
              <option>HB — Handbuilding</option>
            </select>
          </div>
          <div>
            <label style={labelSt}>Instructor</label>
            <select style={selectSt}>
              <option>JL — Joyce Lim</option>
              <option>DL — Dillon Lin</option>
              <option>LT — Lynette Ting</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={labelSt}>Link to Course</label>
          <select style={selectSt}>
            <option value="">— Standalone (not linked) —</option>
            {courses.map(c => (
              <option key={c.identifier} value={c.identifier}>{c.identifier}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={labelSt}>Reason</label>
          <select style={selectSt}>
            <option>Holiday replacement</option>
            <option>Instructor unavailable</option>
            <option>Extra / makeup session</option>
            <option>Other</option>
          </select>
        </div>

        <div style={{ padding: '10px 14px', backgroundColor: '#FFF7E6', border: '1px solid #E6A817', marginBottom: '18px', fontSize: '12px', color: '#7A4E00' }}>
          <span style={{ fontWeight: 700 }}>Note:</span> This adds a single class only — students enrolled in the linked course will not be auto-booked. Notify them separately.
        </div>

        <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
          <button style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Add Class</button>
        </div>
      </div>
    </div>
  );
}

// ── Create Course Modal ─────────────────────────────────────────────────────
export function CreateCourseModal({
  show, onClose, isMobile,
  createClassData, setCreateClassData,
  handleNumberOfClassesChange, handleClassDateChange,
  handleCreateClass, creatingClass,
}) {
  if (!show) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#FFFFFF', width: '540px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ padding: isMobile ? '20px 20px 0' : '28px 32px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>Create New Course</div>
            <div style={{ fontSize: '12px', color: MUTED, marginTop: '3px' }}>Min 4 students required to confirm schedule</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED, lineHeight: 1, padding: '0 0 0 16px' }}>&#10005;</button>
        </div>

        <div style={{ padding: isMobile ? '16px 20px 20px' : '16px 32px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            {/* Class Type */}
            <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
              <label style={labelSt}>Class Type / Identifier *</label>
              <input
                type="text"
                value={createClassData.classType}
                onChange={e => setCreateClassData({ ...createClassData, classType: e.target.value })}
                placeholder="e.g., WT1210AM_DL6"
                style={{ ...inputSt, fontFamily: 'monospace' }}
              />
              <div style={{ fontSize: '10px', color: MUTED, marginTop: '3px' }}>Format: [WT/HB][MMDD][AM/PM/NT]_[INSTRUCTOR][WEEKS]</div>
            </div>

            {/* Instructor */}
            <div>
              <label style={labelSt}>Instructor *</label>
              <input
                type="text"
                value={createClassData.instructor}
                onChange={e => setCreateClassData({ ...createClassData, instructor: e.target.value })}
                placeholder="e.g., Dillon Lin"
                style={inputSt}
              />
            </div>

            {/* Room / Type */}
            <div>
              <label style={labelSt}>Type *</label>
              <input
                type="text"
                value={createClassData.room}
                onChange={e => setCreateClassData({ ...createClassData, room: e.target.value })}
                placeholder="e.g., Wheelthrowing, Handbuilding"
                style={inputSt}
              />
            </div>
          </div>

          {/* Number of classes */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelSt}>Number of Classes *</label>
            <input
              type="number" min="1" max="12"
              value={createClassData.numberOfClasses}
              onChange={e => handleNumberOfClassesChange(e.target.value)}
              style={{ ...inputSt, width: '100px' }}
            />
          </div>

          {/* Class dates */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelSt}>Class Dates *</label>
            <div style={{ border: `1px solid ${RULE}`, backgroundColor: ALT, padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
              {createClassData.classDates.map((date, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#FFF', padding: '6px 10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: MUTED, width: '52px', flexShrink: 0 }}>Week {index + 1}</span>
                  <input
                    type="date"
                    value={date}
                    onChange={e => handleClassDateChange(index, e.target.value)}
                    style={{ ...inputSt, flex: 1, padding: '5px 8px' }}
                  />
                  {date && <span style={{ color: TC, fontSize: '12px' }}>&#10003;</span>}
                </div>
              ))}
            </div>
            <div style={{ fontSize: '10px', color: MUTED, marginTop: '4px' }}>
              {createClassData.classDates.filter(d => d).length} of {createClassData.numberOfClasses} dates selected
            </div>
          </div>

          {/* Start / End time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={labelSt}>Start Time *</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select value={createClassData.startTimeHour} onChange={e => setCreateClassData({ ...createClassData, startTimeHour: e.target.value })} style={{ ...selectSt, flex: 1, padding: '7px 6px' }}>
                  <option value="">H</option>
                  {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
                <select value={createClassData.startTimeMinute} onChange={e => setCreateClassData({ ...createClassData, startTimeMinute: e.target.value })} style={{ ...selectSt, flex: 1, padding: '7px 6px' }}>
                  <option value="">M</option>
                  <option value="00">00</option><option value="15">15</option><option value="30">30</option><option value="45">45</option>
                </select>
                <select value={createClassData.startTimePeriod} onChange={e => setCreateClassData({ ...createClassData, startTimePeriod: e.target.value })} style={{ ...selectSt, width: '52px', padding: '7px 4px' }}>
                  <option value="AM">AM</option><option value="PM">PM</option>
                </select>
              </div>
            </div>
            <div>
              <label style={labelSt}>End Time *</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select value={createClassData.endTimeHour} onChange={e => setCreateClassData({ ...createClassData, endTimeHour: e.target.value })} style={{ ...selectSt, flex: 1, padding: '7px 6px' }}>
                  <option value="">H</option>
                  {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
                <select value={createClassData.endTimeMinute} onChange={e => setCreateClassData({ ...createClassData, endTimeMinute: e.target.value })} style={{ ...selectSt, flex: 1, padding: '7px 6px' }}>
                  <option value="">M</option>
                  <option value="00">00</option><option value="15">15</option><option value="30">30</option><option value="45">45</option>
                </select>
                <select value={createClassData.endTimePeriod} onChange={e => setCreateClassData({ ...createClassData, endTimePeriod: e.target.value })} style={{ ...selectSt, width: '52px', padding: '7px 4px' }}>
                  <option value="AM">AM</option><option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>

          {/* Capacity fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            <div>
              <label style={labelSt}>Teaching Cap</label>
              <input type="number" min="1" max="50" value={createClassData.teachingCapacity} onChange={e => setCreateClassData({ ...createClassData, teachingCapacity: parseInt(e.target.value) || 10 })} style={inputSt} />
              <div style={{ fontSize: '9px', color: MUTED, marginTop: '2px' }}>typically 8–10</div>
            </div>
            <div>
              <label style={labelSt}>Makeup Cap</label>
              <input type="number" min="0" max="20" value={createClassData.makeUpCapacity} onChange={e => setCreateClassData({ ...createClassData, makeUpCapacity: parseInt(e.target.value) || 2 })} style={inputSt} />
              <div style={{ fontSize: '9px', color: MUTED, marginTop: '2px' }}>typically 2</div>
            </div>
            <div>
              <label style={labelSt}>Glazing Cap</label>
              <input type="number" min="1" max="50" value={createClassData.glazingCapacity} onChange={e => setCreateClassData({ ...createClassData, glazingCapacity: parseInt(e.target.value) || 14 })} style={inputSt} />
              <div style={{ fontSize: '9px', color: MUTED, marginTop: '2px' }}>typically 14</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
            <button onClick={onClose} disabled={creatingClass} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: creatingClass ? 0.5 : 1 }}>Cancel</button>
            <button onClick={handleCreateClass} disabled={creatingClass} style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: creatingClass ? 'not-allowed' : 'pointer', opacity: creatingClass ? 0.7 : 1 }}>
              {creatingClass ? 'Creating...' : 'Create Course'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit Class Modal ────────────────────────────────────────────────────────
export function EditClassModal({
  show, editingClass, onClose, isMobile,
  editClassData, setEditClassData,
  handleUpdateClass, updatingClass,
}) {
  if (!show || !editingClass) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#FFFFFF', padding: isMobile ? '24px 20px' : '32px', width: '480px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>Edit Class</div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', color: MUTED, marginTop: '3px' }}>{editingClass.fullCourseIdentifier}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED, lineHeight: 1, padding: '0 0 0 16px' }}>&#10005;</button>
        </div>

        <div style={{ padding: '10px 14px', backgroundColor: '#FFF7E6', border: '1px solid #E6A817', marginBottom: '18px', marginTop: '12px', fontSize: '12px', color: '#7A4E00' }}>
          <span style={{ fontWeight: 700 }}>Note:</span> Changing date/time will NOT update the class identifier. This may cause mismatches.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
          <div>
            <label style={labelSt}>Class Title</label>
            <input type="text" value={editClassData.classTitle} onChange={e => setEditClassData({ ...editClassData, classTitle: e.target.value })} placeholder="e.g., Glazing, Trimming" style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>Class Details</label>
            <input type="text" value={editClassData.classDescription} onChange={e => setEditClassData({ ...editClassData, classDescription: e.target.value })} placeholder="e.g., Bring your own tools, glazing session" style={inputSt} maxLength={120} />
          </div>
          <div>
            <label style={labelSt}>Class Date *</label>
            <input type="date" value={editClassData.classDate} onChange={e => setEditClassData({ ...editClassData, classDate: e.target.value })} style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>Start Time *</label>
            <input type="text" value={editClassData.startTime} onChange={e => setEditClassData({ ...editClassData, startTime: e.target.value })} placeholder="e.g., 9:30 AM" style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>End Time *</label>
            <input type="text" value={editClassData.endTime} onChange={e => setEditClassData({ ...editClassData, endTime: e.target.value })} placeholder="e.g., 12:00 PM" style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>Instructor *</label>
            <input type="text" value={editClassData.instructor} onChange={e => setEditClassData({ ...editClassData, instructor: e.target.value })} placeholder="e.g., Dillon Lin" style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>Max Capacity *</label>
            <input type="number" min="1" max="50" value={editClassData.maxCapacity} onChange={e => setEditClassData({ ...editClassData, maxCapacity: parseInt(e.target.value) || 12 })} style={inputSt} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
          <button onClick={onClose} disabled={updatingClass} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: updatingClass ? 0.5 : 1 }}>Cancel</button>
          <button onClick={handleUpdateClass} disabled={updatingClass} style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: updatingClass ? 'not-allowed' : 'pointer', opacity: updatingClass ? 0.7 : 1 }}>
            {updatingClass ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reschedule Modal ────────────────────────────────────────────────────────
export function RescheduleModal({
  show, reschedulingBooking, onClose, isMobile,
  availableClasses, rescheduleData, setRescheduleData,
  handleReschedule, rescheduling, formatDate,
}) {
  if (!show || !reschedulingBooking) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#FFFFFF', width: '560px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>Reschedule Class</div>
            <div style={{ fontSize: '12px', color: MUTED, marginTop: '3px' }}>{reschedulingBooking.studentName} · {reschedulingBooking.classInstance.class_type}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED, lineHeight: 1, padding: '0 0 0 16px' }}>&#10005;</button>
        </div>

        <div style={{ padding: '0 28px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Current class info */}
          <div style={{ padding: '10px 14px', backgroundColor: TC_LIGHT, border: `1px solid rgba(196,98,45,0.25)`, fontSize: '12px' }}>
            <div style={{ fontWeight: 700, color: TC_DARK, marginBottom: '3px' }}>Current Class</div>
            <div style={{ color: INK }}>{formatDate(reschedulingBooking.classInstance.class_date)} · {reschedulingBooking.classInstance.start_time} – {reschedulingBooking.classInstance.end_time}</div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', color: MUTED, marginTop: '2px' }}>{reschedulingBooking.classInstance.fullCourseIdentifier}</div>
          </div>

          {/* Fee note */}
          <div style={{ padding: '10px 14px', backgroundColor: '#FFF7E6', border: '1px solid #E6A817', fontSize: '12px', color: '#7A4E00' }}>
            <span style={{ fontWeight: 700 }}>Fee policy:</span> FREE within cohort period (Jan 17 – Mar 3, 2026). $40 outside this period.
          </div>

          {/* Select new class */}
          <div>
            <label style={labelSt}>Select New Class *</label>
            {availableClasses.length === 0 ? (
              <div style={{ padding: '16px', border: `1px solid ${RULE}`, textAlign: 'center', color: MUTED, fontSize: '12px' }}>No available classes found</div>
            ) : (
              <div style={{ maxHeight: '240px', overflowY: 'auto', border: `1px solid ${RULE}` }}>
                {availableClasses.map(cls => {
                  const cohortStart = '2026-01-17', cohortEnd = '2026-03-03';
                  const origDate = reschedulingBooking.classInstance.class_date.split('T')[0];
                  const newDate  = cls.class_date.split('T')[0];
                  const isSame   = origDate >= cohortStart && origDate <= cohortEnd && newDate >= cohortStart && newDate <= cohortEnd;
                  const hasFee   = !rescheduleData.isGlazing && !isSame;
                  const isSel    = rescheduleData.newClassInstanceId === cls.id;
                  return (
                    <button
                      key={cls.id}
                      onClick={() => setRescheduleData({ ...rescheduleData, newClassInstanceId: cls.id })}
                      style={{
                        width: '100%', textAlign: 'left', padding: '10px 14px',
                        backgroundColor: isSel ? TC_LIGHT : '#FFFFFF',
                        border: 'none',
                        borderBottom: `1px solid ${RULE}`,
                        borderLeft: isSel ? `3px solid ${TC}` : '3px solid transparent',
                        cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700 }}>{formatDate(cls.class_date)}</div>
                        <div style={{ fontSize: '11px', color: MUTED }}>{cls.start_time} – {cls.end_time} · {cls.class_type}</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: MUTED }}>{cls.fullCourseIdentifier}</div>
                        <div style={{ fontSize: '10px', color: MUTED }}>{cls.bookingCount}/{cls.max_capacity} enrolled</div>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', backgroundColor: hasFee ? '#FFF7E6' : TC_LIGHT, color: hasFee ? '#9E6200' : TC_DARK, flexShrink: 0 }}>
                        {hasFee ? '$40 fee' : 'Free'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <label style={labelSt}>Reason (optional)</label>
            <textarea
              value={rescheduleData.reason}
              onChange={e => setRescheduleData({ ...rescheduleData, reason: e.target.value })}
              rows={3}
              placeholder="Optional note..."
              style={{ ...inputSt, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} disabled={rescheduling} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: rescheduling ? 0.5 : 1 }}>Cancel</button>
            <button onClick={handleReschedule} disabled={rescheduling || !rescheduleData.newClassInstanceId} style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (rescheduling || !rescheduleData.newClassInstanceId) ? 'not-allowed' : 'pointer', opacity: (rescheduling || !rescheduleData.newClassInstanceId) ? 0.6 : 1 }}>
              {rescheduling ? 'Rescheduling...' : 'Confirm Reschedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add Student Modal ───────────────────────────────────────────────────────
export function AddStudentModal({
  show, onClose,
  studentSearchQuery, setStudentSearchQuery,
  loadingStudents, getFilteredStudents,
  handleAddStudent, addingStudent,
}) {
  if (!show) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#FFFFFF', width: '520px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>Add Student to Class</div>
            <div style={{ fontSize: '12px', color: MUTED, marginTop: '3px' }}>Search for a student to add</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED, lineHeight: 1, padding: '0 0 0 16px' }}>&#10005;</button>
        </div>

        <div style={{ padding: '0 28px 24px' }}>
          {/* Search */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelSt}>Search Student</label>
            <input
              type="text"
              value={studentSearchQuery}
              onChange={e => setStudentSearchQuery(e.target.value)}
              placeholder="Name or email..."
              style={inputSt}
            />
          </div>

          {/* List */}
          <div>
            <label style={labelSt}>Select Student</label>
            {loadingStudents ? (
              <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>Loading students...</div>
            ) : getFilteredStudents().length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>
                {studentSearchQuery ? 'No students found' : 'No students available'}
              </div>
            ) : (
              <div style={{ maxHeight: '320px', overflowY: 'auto', border: `1px solid ${RULE}` }}>
                {getFilteredStudents().map(student => (
                  <button
                    key={student.dbId}
                    onClick={() => handleAddStudent(student.dbId)}
                    disabled={addingStudent}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 14px',
                      backgroundColor: '#FFFFFF', border: 'none', borderBottom: `1px solid ${RULE}`,
                      cursor: addingStudent ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                      opacity: addingStudent ? 0.6 : 1,
                    }}
                    onMouseEnter={e => { if (!addingStudent) e.currentTarget.style.backgroundColor = TC_LIGHT; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
                  >
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700 }}>{student.firstName} {student.lastName}</div>
                      <div style={{ fontSize: '11px', color: MUTED }}>{student.email}</div>
                    </div>
                    <span style={{ fontSize: '18px', color: TC }}>+</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose} disabled={addingStudent} style={{ padding: '10px 20px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: addingStudent ? 0.5 : 1 }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
