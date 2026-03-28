import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import ImpersonationBanner from '../components/ImpersonationBanner';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const DEFAULT_SECTIONS = [
  { title: 'Course Overview', description: 'This six-week course covers the fundamentals of wheel-throwing. Students will learn to throw cylinder and bowl forms, turn and trim bases, and apply glazing techniques using VES studio glazes. By the end of the course, each student will have produced a set of glazed cups and bowls, available for collection within one month following the final glaze firing.', rules: [] },
  { title: 'What Your Course Fee Includes', rules: ['Clay, bisque firing for up to seven (7) pieces, and use of all advanced tools and equipment.', 'Decorating and glazing materials, including glaze firing.', 'Additional tools and supplementary pieces are available at extra cost.'] },
  { title: 'Refunds & Transfers', rules: ['All course fees are strictly non-refundable.', 'Students may transfer their entire course enrolment to another individual. Partial transfers are not permitted.'] },
  { title: 'Attendance & Make-Up Sessions', rules: ['Each student is entitled to one (1) make-up session during Weeks 1\u20135, and one (1) additional make-up session for Week 6 (glazing), subject to scheduling and availability.', 'Students must notify the studio in advance to arrange a make-up session.'] },
  { title: 'Rescheduling & Attendance', rules: ['You are allowed to reschedule up to three (3) makeup classes, subject to cohort schedule and availability.', 'You must reschedule a makeup class more than twenty-four (24) hours before it starts.', 'Missed course classes are forfeited — no credit will be given for unattended course classes.', 'A $20 no-show fee applies if you miss a rescheduled makeup class, as your makeup spot could have gone to another student.', 'A $40 fee applies per makeup class outside of your cohort schedule. There is no fee requirement to reschedule final glazing classes.'] },
  { title: 'Punctuality', rules: ['As this is a structured course, punctuality is expected of all students.', 'The studio doors will open ten (10) minutes prior to the scheduled start time. Classes will begin and end promptly as scheduled.'] },
  { title: 'Required Items', rules: ['Pottery Tool Set \u2014 Required; bring your own or purchase ($18).', 'Advanced Trimming Tool \u2014 Optional add-on ($12).', 'Apron \u2014 Required; not provided by the studio. VES branded aprons available ($45).', 'Carry Bag / Tote \u2014 Required for transporting finished work. VES totes available ($12).'] },
  { title: 'Studio Etiquette', rules: ['Upon arrival, please press the doorbell located on the wall. A staff member will attend to you.', 'All work must be clearly initialled by the maker using three (3) characters (letters or numbers) to prevent any mix-ups.', 'Please clean your workspace after each session, including wiping down your seat and wheel for the next user.', 'Students who are unwell are asked to wear a mask while in the studio.', 'Comfortable clothing and closed-toe shoes are recommended.', 'Please ensure fingernails are trimmed appropriately for working with clay.', 'Food and beverages (other than water) are not permitted in the studio.', 'Students under the age of 16 must notify the studio in advance of enrolment.'] },
  { title: 'Additional Pieces & Studio Access', rules: ['Students wishing to produce more than seven (7) pieces may do so at a rate of $20 per additional piece.', 'Unguided wheel-throwing studio access is available to current students at $20 per hour, with a minimum booking of two (2) hours. Bookings are accepted in full-hour increments only.'] },
  { title: 'Returning Student Credits', highlight: true, rules: ['NEW FOR 2026 \u2014 All returning students will receive $20 in studio credits for each wheel-throwing course completed.', 'Credits may be applied towards additional pieces, studio access bookings, or a discount on your next course enrolment.', 'For enquiries, please email us at info@ves.sg.'] },
  { title: 'Firing Policy', rules: ['All pieces submitted for firing must be clearly signed by the maker. Unsigned works will not be fired.', 'VES Pottery Studio accepts no responsibility for unsigned or unclaimed pieces.'] },
  { title: 'Collection & Disposal', rules: ['Collection of finished pieces is by appointment only, beginning 9 May 2026.', 'The studio reserves the right to dispose of any uncollected pieces after 9 July 2026.', 'No reminder notifications will be issued. It is the student\u2019s responsibility to arrange timely collection.'] },
  { title: 'General Policy', rules: ['VES Pottery Studio reserves the right to refuse service, blacklist, or ban any individual who fails to comply with studio rules, or who engages in illegal, disruptive, or inappropriate conduct on the premises.'] },
];

export default function StudioPolicy() {
  const navigate = useNavigate();
  const [sections, setSections] = useState(DEFAULT_SECTIONS);

  useEffect(() => {
    api.get('/settings/studio-policy')
      .then(res => { if (res.data.sections) setSections(res.data.sections); })
      .catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8' }}>
      <ImpersonationBanner />
      {/* Header */}
      <header style={{ backgroundColor: '#FFF', borderBottom: `1px solid ${RULE}`, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: INK }}>arrow_back</span>
        </button>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em' }}>Studio Policy</div>
          <div style={{ fontSize: '10px', color: MUTED, letterSpacing: '0.04em', textTransform: 'uppercase' }}>VES Pottery Studio</div>
        </div>
      </header>

      <main style={{ maxWidth: '520px', margin: '0 auto', padding: '24px 16px 64px' }}>
        {/* Important banner */}
        <div style={{
          padding: '14px 16px',
          backgroundColor: TC_LIGHT,
          border: `1px solid ${TC}`,
          marginBottom: '24px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: TC_DARK, flexShrink: 0, marginTop: '1px' }}>gavel</span>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TC_DARK, marginBottom: '4px' }}>Important</div>
            <div style={{ fontSize: '12px', color: INK, lineHeight: 1.5 }}>
              By enrolling in any VES course, you agree to the following studio policies. Please read this document carefully before your first session.
            </div>
          </div>
        </div>

        {/* Policy sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sections.filter(s => !s.hidden).map((section, si) => (
            <div key={si} style={{ backgroundColor: '#FFF', border: `1px solid ${section.highlight ? TC : RULE}` }}>
              <div style={{
                padding: '14px 16px 12px',
                borderBottom: `1px solid ${section.highlight ? TC : RULE}`,
                backgroundColor: section.highlight ? TC_LIGHT : ALT,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK }}>{section.title}</div>
                  {section.highlight && (
                    <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#FFF', backgroundColor: TC, padding: '3px 8px' }}>New</span>
                  )}
                </div>
              </div>
              <div style={{ padding: '14px 16px' }}>
                {section.description && (
                  <div style={{ fontSize: '13px', color: INK, lineHeight: 1.6 }}>{section.description}</div>
                )}
                {section.rules?.map((rule, ri) => (
                  <div
                    key={ri}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start',
                      padding: '8px 0',
                      borderBottom: ri < section.rules.length - 1 ? `1px solid ${RULE}` : 'none',
                    }}
                  >
                    <div style={{
                      width: '18px', height: '18px', flexShrink: 0,
                      backgroundColor: TC_LIGHT, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', fontWeight: 700, color: TC_DARK, marginTop: '1px',
                    }}>
                      {ri + 1}
                    </div>
                    <div style={{ fontSize: '13px', color: INK, lineHeight: 1.55 }}>{rule}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div style={{ marginTop: '24px', padding: '16px', backgroundColor: ALT, border: `1px solid ${RULE}`, textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: MUTED, marginBottom: '6px' }}>Questions about our policies?</div>
          <a
            href="mailto:info@ves.sg"
            style={{ fontSize: '13px', fontWeight: 700, color: TC, textDecoration: 'none' }}
          >
            info@ves.sg
          </a>
        </div>
      </main>
    </div>
  );
}
