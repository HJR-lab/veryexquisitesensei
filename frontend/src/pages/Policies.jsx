import { STUDIO_POLICIES } from '../utils/courseDetails';

const INK = '#282828';
const MUTED = '#888888';
const TC = '#C4622D';

function PolicySection({ section }) {
  if (section.items) {
    return (
      <>
        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>{section.title}</h2>
        <ul style={{ paddingLeft: '20px' }}>
          {section.items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      </>
    );
  }
  return (
    <>
      <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 8px', color: INK }}>{section.title}</h2>
      <p>{section.content}</p>
    </>
  );
}

export default function Policies() {
  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <img
          src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
          alt="VES" style={{ height: '29px', marginBottom: '16px' }}
        />
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: INK }}>Studio Policies</h1>
        <p style={{ margin: '8px 0 0', fontSize: '14px', color: MUTED }}>Ves Studio &middot; 75 Jalan Kelabu Asap, Singapore 278268</p>
      </div>

      <div style={{ fontSize: '14px', lineHeight: '1.7', color: INK }}>
        {Object.values(STUDIO_POLICIES).map((section, i) => (
          <PolicySection key={i} section={section} />
        ))}
      </div>

      <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '13px', color: MUTED }}>
        <p><a href="https://www.ves.sg" style={{ color: TC, textDecoration: 'none' }}>ves.sg</a> &middot; <a href="https://www.instagram.com/ves.studio/" style={{ color: TC, textDecoration: 'none' }}>Instagram</a> &middot; <a href="https://www.facebook.com/ves.studio.sg/" style={{ color: TC, textDecoration: 'none' }}>Facebook</a></p>
      </div>
    </div>
  );
}
