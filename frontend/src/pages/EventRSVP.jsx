import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '../utils/api';

const TC = '#C4622D';
const TC_DARK = '#9E4A1E';
const TC_LIGHT = '#F9EDE6';
const INK = '#282828';

function formatEventDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-SG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatEventTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function EventRSVP() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [rsvpResponse, setRsvpResponse] = useState(null); // 'attending' | 'declined'

  useEffect(() => {
    if (!token) {
      setError('Invalid RSVP link. Please check the link in your invitation.');
      setLoading(false);
      return;
    }

    api.get(`/events/${eventId}`)
      .then(res => {
        setEvent(res.data);
        setLoading(false);
      })
      .catch(err => {
        const msg = err.response?.data?.error || 'Unable to load event details.';
        setError(msg);
        setLoading(false);
      });
  }, [eventId, token]);

  const handleRSVP = async (response) => {
    setSubmitting(true);
    try {
      await api.post(`/events/${eventId}/rsvp`, { token, response });
      setRsvpResponse(response);
    } catch (err) {
      const msg = err.response?.data?.error || 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const isPastDeadline = event?.rsvp_deadline && new Date(event.rsvp_deadline) < new Date();
  const isFull = event?.max_capacity && event.attending_count >= event.max_capacity;

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: TC_LIGHT }}>
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-transparent" style={{ borderColor: TC, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  // Error state
  if (error && !event) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: TC_LIGHT }}>
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="text-4xl mb-4">:(</div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: INK }}>Something went wrong</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8" style={{ backgroundColor: TC_LIGHT }}>
      {/* Header */}
      <h1 className="text-2xl font-bold tracking-wide mb-6" style={{ color: TC_DARK, fontFamily: 'Atak, sans-serif' }}>
        VES
      </h1>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full overflow-hidden">
        {/* Invitation header */}
        <div className="px-8 pt-8 pb-4 text-center">
          <p className="text-sm uppercase tracking-widest mb-1" style={{ color: TC }}>You're Invited</p>
        </div>

        {/* Event details */}
        <div className="mx-6 rounded-xl p-6" style={{ backgroundColor: TC_LIGHT }}>
          <h2 className="text-xl font-bold mb-3" style={{ color: INK }}>{event.title}</h2>
          <div className="space-y-1 text-sm" style={{ color: INK }}>
            <p>{formatEventDate(event.event_date)}</p>
            <p>{formatEventTime(event.event_date)}</p>
            {event.location && <p>{event.location}</p>}
          </div>
          {event.description && (
            <p className="mt-4 text-sm leading-relaxed" style={{ color: '#555' }}>
              {event.description}
            </p>
          )}
        </div>

        {/* Attendance count */}
        {event.attending_count > 0 && (
          <p className="text-center text-sm mt-4" style={{ color: '#888' }}>
            {event.attending_count} {event.attending_count === 1 ? 'person' : 'people'} attending
          </p>
        )}

        {/* Actions area */}
        <div className="px-8 py-6">
          {/* Error after event loaded (e.g. RSVP submission error) */}
          {error && (
            <div className="text-center mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
              {error}
            </div>
          )}

          {rsvpResponse ? (
            // Confirmed state
            <div className="text-center py-2">
              {rsvpResponse === 'attending' ? (
                <>
                  <div className="text-3xl mb-2">&#10003;</div>
                  <h3 className="text-lg font-semibold mb-1" style={{ color: INK }}>You're going!</h3>
                  <p className="text-sm" style={{ color: '#888' }}>We look forward to seeing you there.</p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold mb-1" style={{ color: INK }}>Thanks for letting us know</h3>
                  <p className="text-sm" style={{ color: '#888' }}>Sorry you can't make it this time.</p>
                </>
              )}
            </div>
          ) : isPastDeadline ? (
            <div className="text-center py-2">
              <p className="font-medium" style={{ color: '#888' }}>RSVP deadline has passed</p>
            </div>
          ) : isFull ? (
            <div className="text-center py-2">
              <p className="font-medium" style={{ color: '#888' }}>This event is full</p>
            </div>
          ) : (
            // RSVP buttons
            <div className="flex gap-3">
              <button
                onClick={() => handleRSVP('attending')}
                disabled={submitting}
                className="flex-1 py-3 rounded-full text-white font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: TC }}
                onMouseEnter={e => { if (!submitting) e.target.style.backgroundColor = TC_DARK; }}
                onMouseLeave={e => { if (!submitting) e.target.style.backgroundColor = TC; }}
              >
                {submitting ? 'Sending...' : 'Attend'}
              </button>
              <button
                onClick={() => handleRSVP('declined')}
                disabled={submitting}
                className="flex-1 py-3 rounded-full font-medium transition-colors border-2 disabled:opacity-50"
                style={{ borderColor: TC, color: TC, backgroundColor: 'transparent' }}
                onMouseEnter={e => { if (!submitting) { e.target.style.backgroundColor = TC_LIGHT; } }}
                onMouseLeave={e => { if (!submitting) { e.target.style.backgroundColor = 'transparent'; } }}
              >
                Decline
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs" style={{ color: '#aaa' }}>VES Pottery Studio</p>
    </div>
  );
}
