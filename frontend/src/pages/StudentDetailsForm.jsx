import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';

const TC = '#C4622D';
const TC_DARK = '#9E4A1E';
const TC_LIGHT = '#F9EDE6';
const INK = '#282828';
const MUTED = '#888888';

const EMPTY = { firstName: '', lastName: '', email: '', phone: '' };

// Public tokenized form: the purchaser of a multi-spot course order enters the
// extra students' real details here (placeholder "+dup" accounts get updated).
// One link covers the whole order — a qty-4 order shows 3 student sections.
export default function StudentDetailsForm() {
  const { token } = useParams();

  const [info, setInfo] = useState(null); // { courseTitle, students: [{token, status, submittedName}] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedNames, setSavedNames] = useState([]);
  const [note, setNote] = useState(null);

  const [forms, setForms] = useState({}); // token -> {firstName, lastName, email, phone}

  const load = () => {
    return api.get(`/student-details/${token}`)
      .then(res => {
        setInfo(res.data);
        setForms(prev => {
          const next = { ...prev };
          for (const s of res.data.students || []) {
            if (s.status === 'pending' && !next[s.token]) next[s.token] = { ...EMPTY };
          }
          return next;
        });
      });
  };

  useEffect(() => {
    load()
      .catch(err => setError(err.response?.data?.error || 'Unable to load this form.'))
      .finally(() => setLoading(false));
  }, [token]);

  const pending = (info?.students || []).filter(s => s.status === 'pending');
  const completed = (info?.students || []).filter(s => s.status !== 'pending');
  const multi = (info?.students || []).length > 1;

  const filledTokens = pending
    .map(s => s.token)
    .filter(t => {
      const f = forms[t] || EMPTY;
      return f.firstName.trim() || f.lastName.trim() || f.email.trim() || f.phone.trim();
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (filledTokens.length === 0) {
      setError('Please fill in at least one student.');
      return;
    }
    for (const t of filledTokens) {
      const f = forms[t];
      if (!f.firstName.trim() || !f.email.trim()) {
        setError('Each filled-in student needs at least a first name and email.');
        return;
      }
    }
    const emails = filledTokens.map(t => forms[t].email.trim().toLowerCase());
    if (new Set(emails).size !== emails.length) {
      setError('Each student needs their own email address.');
      return;
    }

    setSubmitting(true);
    const names = [];
    let anyNote = null;
    try {
      for (const t of filledTokens) {
        const { data } = await api.post(`/student-details/${t}`, forms[t]);
        names.push(forms[t].firstName.trim());
        if (data.note) anyNote = data.note;
      }
      setSavedNames(names);
      setNote(anyNote);
      await load().catch(() => {});
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
      await load().catch(() => {});
    } finally {
      setSubmitting(false);
    }
  };

  const field = (tok, label, key, type = 'text', required = false) => (
    <div className="mb-4">
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: TC_DARK }}>
        {label}{required && ' *'}
      </label>
      <input
        type={type}
        value={forms[tok]?.[key] || ''}
        onChange={e => setForms(prev => ({ ...prev, [tok]: { ...(prev[tok] || EMPTY), [key]: e.target.value } }))}
        className="w-full px-4 py-3 rounded-lg border text-sm outline-none focus:ring-2"
        style={{ borderColor: 'rgba(40,40,40,0.15)', color: INK }}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: TC_LIGHT }}>
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-transparent" style={{ borderColor: TC, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const allDone = info && pending.length === 0;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ backgroundColor: TC_LIGHT }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-8">
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: TC }}>VES Studio</p>

        {(error && !info) ? (
          <>
            <h1 className="text-xl font-bold mb-3" style={{ color: INK }}>Link not valid</h1>
            <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{error}</p>
          </>
        ) : savedNames.length > 0 && allDone ? (
          <>
            <h1 className="text-xl font-bold mb-3" style={{ color: INK }}>Thank you!</h1>
            <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
              {note || `${savedNames.join(', ')}${savedNames.length > 1 ? ' are' : ' is'} all set — we've created their student account${savedNames.length > 1 ? 's' : ''} and they'll receive studio updates directly.`}
            </p>
          </>
        ) : allDone ? (
          <>
            <h1 className="text-xl font-bold mb-3" style={{ color: INK }}>Already submitted</h1>
            <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
              Details for {completed.length > 1 ? 'these spots have' : 'this spot has'} already been submitted
              {completed.some(s => s.submittedName) ? ` for ${completed.map(s => s.submittedName).filter(Boolean).join(', ')}` : ''}.
              If anything needs correcting, just reply to our email.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold mb-2" style={{ color: INK }}>
              {multi ? "Who's joining you?" : "Who's joining you?"}
            </h1>
            <p className="text-sm leading-relaxed mb-6" style={{ color: MUTED }}>
              {info?.courseTitle ? `Your order for ${info.courseTitle} includes ${multi ? `${(info.students || []).length + 1} spots` : 'a second spot'}.` : `Your order includes ${multi ? 'extra spots' : 'a second spot'}.`}{' '}
              Tell us who {multi ? 'they’re' : "it's"} for so we can set up their own student account{multi ? 's' : ''}.
              {multi && savedNames.length === 0 ? ' Don’t have everyone’s details yet? Fill in who you know — this link keeps working for the rest.' : ''}
            </p>

            {savedNames.length > 0 && (
              <p className="text-sm leading-relaxed mb-4 px-4 py-3 rounded-lg" style={{ backgroundColor: TC_LIGHT, color: TC_DARK }}>
                Saved: {savedNames.join(', ')}. {pending.length} more to go — fill them in below whenever you're ready.
              </p>
            )}

            <form onSubmit={handleSubmit}>
              {pending.map((s, i) => (
                <div key={s.token} className={multi ? 'mb-6 pb-2 border-b' : ''} style={multi ? { borderColor: 'rgba(40,40,40,0.09)' } : {}}>
                  {multi && (
                    <p className="text-sm font-bold mb-3" style={{ color: INK }}>
                      Student {completed.length + i + 2}
                      <span className="font-normal" style={{ color: MUTED }}> (leave blank if unknown for now)</span>
                    </p>
                  )}
                  {field(s.token, 'First name', 'firstName', 'text', true)}
                  {field(s.token, 'Last name', 'lastName')}
                  {field(s.token, 'Email', 'email', 'email', true)}
                  {field(s.token, 'Mobile', 'phone', 'tel')}
                </div>
              ))}

              {error && (
                <p className="text-sm mb-4" style={{ color: '#B3261E' }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-lg text-white text-sm font-semibold disabled:opacity-60"
                style={{ backgroundColor: TC }}
              >
                {submitting ? 'Saving…' : 'Save Student Details'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
