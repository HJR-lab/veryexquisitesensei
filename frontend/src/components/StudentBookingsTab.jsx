// ─── Design tokens ───────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const BOOKING_STYLE = {
  booked:    { bg: TC_LIGHT,  text: TC_DARK    },
  attended:  { bg: ALT,       text: MUTED      },
  completed: { bg: ALT,       text: MUTED      },
  missed:    { bg: '#FFF0F0', text: '#C03030'  },
  cancelled: { bg: ALT,       text: MUTED      },
  unbooked:  { bg: '#FFFBEA', text: '#9E6200'  },
  waitlisted:{ bg: '#FFF7E6', text: '#9E6200'  },
};

export default function StudentBookingsTab({
  filteredBookings,
  statusFilter,
  setStatusFilter,
  completedCourseCount,
  showCompletedCourses,
  setShowCompletedCourses,
  unbookedCount,
  flexPlaceholderCount = 0,
  flexEnrollmentId = null,
  today,
  parseCourseName,
  handleToggleAttended,
  handleOpenMakeupModal,
  deleteConfirmId,
  setDeleteConfirmId,
  deletingBookingId,
  handleDeleteBooking,
  handleConvertToCredit,
  isHBEnrollment = false,
  hbCreditsAllocated = 0,
  waitlistEntries = [],
}) {
  // For HB students: determine which booking is the last (glazing) class
  // If all credits booked, last booking by date = glazing
  // If not all booked, the last unbooked placeholder = glazing
  const allHBBooked = isHBEnrollment && filteredBookings.length >= hbCreditsAllocated && hbCreditsAllocated > 0;
  const lastHBBookingId = (isHBEnrollment && allHBBooked && filteredBookings.length > 0)
    ? filteredBookings[filteredBookings.length - 1]?.id
    : null;
  return (
    <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>

      {/* Filter row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', padding: '12px 16px', borderBottom: `1px solid ${RULE}`, gap: '6px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '4px' }}>Filter:</span>
        {['all', 'booked', 'attended', 'waitlisted', 'missed', 'cancelled'].map(f => (
          <button key={f} onClick={() => setStatusFilter(f)} style={{
            padding: '4px 10px', border: `1px solid ${statusFilter === f ? TC : RULE}`,
            backgroundColor: statusFilter === f ? TC_LIGHT : 'transparent',
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'capitalize',
            color: statusFilter === f ? TC_DARK : MUTED, cursor: 'pointer',
          }}>{f}</button>
        ))}
        {completedCourseCount > 0 && (
          <button
            onClick={() => setShowCompletedCourses(!showCompletedCourses)}
            style={{
              marginLeft: 'auto', padding: '4px 10px',
              border: `1px solid ${showCompletedCourses ? '#5A2D82' : RULE}`,
              backgroundColor: showCompletedCourses ? 'rgba(90,45,130,0.06)' : 'transparent',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
              color: showCompletedCourses ? '#5A2D82' : MUTED, cursor: 'pointer',
            }}
          >
            {showCompletedCourses ? 'Hide' : 'Show'} {completedCourseCount} completed course{completedCourseCount !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: '540px' }}>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px 110px 120px 90px 1fr', padding: '9px 16px', backgroundColor: ALT, borderBottom: `1px solid ${RULE}` }}>
            {['Course', 'Date', 'Time', 'Status', ''].map((h, i) => (
              <span key={i} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{h}</span>
            ))}
          </div>

          {/* Waitlist rows merged with bookings */}
          {(() => {
            // Convert waitlist entries to booking-like rows
            const waitlistRows = (statusFilter === 'all' || statusFilter === 'booked' || statusFilter === 'waitlisted') ? waitlistEntries.map(w => ({
              id: `wl-${w.id}`,
              _isWaitlist: true,
              class_date: w.classDate,
              class_type: w.classType,
              start_time: w.startTime,
              end_time: w.endTime,
              instructor: w.instructor,
              course_identifier: w.classType,
              status: 'waitlisted',
            })) : [];

            const bookingRows = statusFilter === 'waitlisted' ? [] : filteredBookings;
            const allRows = [...bookingRows, ...waitlistRows].sort((a, b) => {
              return new Date(a.class_date) - new Date(b.class_date);
            });

            return allRows.map((booking, i) => {
            const classDate = new Date(booking.class_date);
            classDate.setHours(0, 0, 0, 0);
            const isPast = classDate < today;
            const displayStatus = booking._isWaitlist ? 'waitlisted' : (isPast && booking.status === 'booked') ? 'attended' : booking.status;
            const isHBGlazing = isHBEnrollment && booking.id === lastHBBookingId;
            const courseName = booking._isWaitlist ? (booking.class_type || '—') : isHBGlazing ? 'Glazing' : parseCourseName(booking.course_identifier, booking.class_type);
            const timeStr = booking.start_time && booking.end_time ? `${booking.start_time} – ${booking.end_time}` : booking.start_time || '—';
            const dateStr = new Date(booking.class_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
            const isDeleting = deletingBookingId === booking.id;
            const style = BOOKING_STYLE[displayStatus] || BOOKING_STYLE.attended;

            return (
              <div key={booking.id} style={{ borderBottom: `1px solid ${RULE}` }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '130px 110px 120px 90px 1fr',
                  padding: '11px 16px', alignItems: 'center',
                  backgroundColor: displayStatus === 'booked' ? TC_LIGHT : displayStatus === 'waitlisted' ? '#FFF7E6' : '#FFFFFF',
                }}>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, color: TC_DARK }}>{courseName}</span>
                  <div style={{ fontSize: '13px', fontWeight: displayStatus === 'booked' ? 700 : 400 }}>{dateStr}</div>
                  <span style={{ fontSize: '12px', color: MUTED }}>{timeStr}</span>
                  <span
                    onClick={isPast && (displayStatus === 'attended' || displayStatus === 'booked') ? () => handleToggleAttended(booking.id, displayStatus) : undefined}
                    title={isPast && (displayStatus === 'attended' || displayStatus === 'booked') ? `Click to mark as ${displayStatus === 'attended' ? 'not attended' : 'attended'}` : ''}
                    style={{
                    fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                    padding: '3px 8px', display: 'inline-block',
                    backgroundColor: style.bg, color: style.text,
                    cursor: isPast && (displayStatus === 'attended' || displayStatus === 'booked') ? 'pointer' : 'default',
                  }}>{displayStatus}</span>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleOpenMakeupModal(booking)}
                      style={{ padding: '4px 10px', border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: INK }}
                    >Reschedule</button>
                    {handleConvertToCredit && booking.status === 'booked' && (
                      <button
                        onClick={() => handleConvertToCredit(booking.id)}
                        style={{ padding: '4px 10px', border: `1px solid ${TC}`, background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: TC }}
                      >Convert</button>
                    )}
                    <button
                      onClick={() => setDeleteConfirmId(booking.id)}
                      style={{ padding: '4px 10px', border: '1px solid #F0C0C0', background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#C03030' }}
                    >Delete</button>
                  </div>
                </div>

                {/* Inline delete confirm */}
                {deleteConfirmId === booking.id && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: '#FFF5F5', borderTop: '1px solid #F0C0C0' }}>
                    <span style={{ fontSize: '12px', color: '#C03030' }}>Delete this booking? This cannot be undone.</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        style={{ padding: '5px 12px', border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: MUTED }}
                      >Cancel</button>
                      <button
                        onClick={() => handleDeleteBooking(booking.id)}
                        disabled={isDeleting}
                        style={{ padding: '5px 12px', border: 'none', backgroundColor: '#C03030', cursor: isDeleting ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#FFF', opacity: isDeleting ? 0.7 : 1 }}
                      >{isDeleting ? 'Deleting…' : 'Confirm Delete'}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          });
          })()}

          {/* Unbooked credit placeholder rows */}
          {statusFilter === 'all' && Array.from({ length: unbookedCount }).map((_, i) => {
            const placeholderBooking = { id: `unbooked-${i}`, isPlaceholder: true };
            const isLastUnbooked = isHBEnrollment && i === unbookedCount - 1;
            return (
              <div key={`unbooked-${i}`} style={{ borderBottom: `1px solid ${RULE}` }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '130px 110px 120px 90px 1fr',
                  padding: '11px 16px', alignItems: 'center',
                  backgroundColor: '#FFFBEA',
                }}>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, color: isLastUnbooked ? TC_DARK : MUTED }}>{isLastUnbooked ? 'Glazing' : '—'}</span>
                  <div style={{ fontSize: '13px', color: MUTED }}>—</div>
                  <span style={{ fontSize: '12px', color: MUTED }}>—</span>
                  <span style={{
                    fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                    padding: '3px 8px', display: 'inline-block',
                    backgroundColor: '#FFF7E6', color: '#9E6200',
                  }}>unbooked</span>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleOpenMakeupModal(placeholderBooking)}
                      style={{ padding: '4px 10px', border: `1px solid ${TC}`, background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: TC }}
                    >Book</button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Flex credit placeholder rows (from a 10-class package whose enrollment
              is not the one currently displayed). These book into the package
              enrollment, and can be used for either a WT or HB class. */}
          {statusFilter === 'all' && Array.from({ length: flexPlaceholderCount }).map((_, i) => {
            const placeholderBooking = { id: `flex-${i}`, isPlaceholder: true, isFlex: true, courseEnrollmentId: flexEnrollmentId };
            return (
              <div key={`flex-${i}`} style={{ borderBottom: `1px solid ${RULE}` }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '130px 110px 120px 90px 1fr',
                  padding: '11px 16px', alignItems: 'center',
                  backgroundColor: '#FFFBEA',
                }}>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, color: MUTED }}>—</span>
                  <div style={{ fontSize: '13px', color: MUTED }}>—</div>
                  <span style={{ fontSize: '12px', color: MUTED }}>—</span>
                  <span style={{
                    fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                    padding: '3px 8px', display: 'inline-block',
                    backgroundColor: '#FFF7E6', color: '#9E6200',
                  }}>unbooked</span>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleOpenMakeupModal(placeholderBooking)}
                      style={{ padding: '4px 10px', border: `1px solid ${TC}`, background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: TC }}
                    >Book</button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {filteredBookings.length === 0 && unbookedCount === 0 && flexPlaceholderCount === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No bookings found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
