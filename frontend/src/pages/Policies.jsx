const INK = '#282828';
const MUTED = '#888888';
const TC = '#C4622D';

export default function Policies() {
  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <img
          src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
          alt="VES" style={{ height: '48px', marginBottom: '16px' }}
        />
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: INK }}>Studio Policies</h1>
        <p style={{ margin: '8px 0 0', fontSize: '14px', color: MUTED }}>Ves Studio &middot; 75 Jalan Kelabu Asap, Singapore 278268</p>
      </div>

      <div style={{ fontSize: '14px', lineHeight: '1.7', color: INK }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>Class Size and Policies</h2>
        <p>To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.</p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>Make-Up Classes</h2>
        <p>While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for the final week (glazing), subject to our schedule and availability. Please inform us in advance if you need to schedule a make-up class.</p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>Punctuality</h2>
        <p>As this is a structured course, please be punctual. The studio opens for entry 10 minutes before class begins. Class will begin and end on time.</p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>Items Required</h2>
        <ul style={{ paddingLeft: '20px' }}>
          <li>Tools — available for purchase ($15, $12 for advanced trimming tool) or bring your own</li>
          <li>Apron — required, not provided (available for $18)</li>
          <li>Carry bag — not provided (tote bags available for $12)</li>
        </ul>

        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>Studio Rules</h2>
        <ul style={{ paddingLeft: '20px' }}>
          <li>Press the doorbell on the wall to enter</li>
          <li>Initial your work clearly in 3 text/numbers to avoid mix-ups</li>
          <li>Clean up after yourself and wipe your seat and wheels</li>
          <li>Wear a mask if you are unwell</li>
          <li>Wear comfortable clothes and closed-toe shoes</li>
          <li>Cut your nails appropriately</li>
          <li>Eating is not allowed in the studio</li>
          <li>If you are under 16, please notify us in advance</li>
        </ul>

        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>Collection &amp; Disposal</h2>
        <p>Collection of finished pieces is by appointment only, within 1 month after your final class. We reserve the right to dispose of uncollected pieces after 3 months. Please contact us to arrange collection.</p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>General</h2>
        <p>We reserve the right to blacklist and ban students that do not comply with the rules or conduct any illegal or inappropriate activity in our premises.</p>
      </div>

      <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '13px', color: MUTED }}>
        <p><a href="https://www.ves.sg" style={{ color: TC, textDecoration: 'none' }}>ves.sg</a> &middot; <a href="https://www.instagram.com/ves.studio/" style={{ color: TC, textDecoration: 'none' }}>Instagram</a> &middot; <a href="https://www.facebook.com/ves.studio.sg/" style={{ color: TC, textDecoration: 'none' }}>Facebook</a></p>
      </div>
    </div>
  );
}
