import { useState } from 'react';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const MY_PIECES = [
  { id: 1, title: 'First Bowl',       clay: 'Stoneware',  date: 'Jan 2026', glaze: 'Celadon',       img: 'https://picsum.photos/seed/ves-p1/600/600', isPublic: true  },
  { id: 2, title: 'Mug No. 2',        clay: 'Porcelain',  date: 'Jan 2026', glaze: 'Ash',           img: 'https://picsum.photos/seed/ves-p2/600/600', isPublic: false },
  { id: 3, title: 'Vase Attempt',     clay: 'Stoneware',  date: 'Feb 2026', glaze: 'Tenmoku',       img: 'https://picsum.photos/seed/ves-p3/600/600', isPublic: true  },
  { id: 4, title: 'Teapot',           clay: 'Terracotta', date: 'Feb 2026', glaze: 'Unglazed',      img: 'https://picsum.photos/seed/ves-p4/600/600', isPublic: false },
  { id: 5, title: 'Pinch Pot',        clay: 'Stoneware',  date: 'Feb 2026', glaze: 'Celadon',       img: 'https://picsum.photos/seed/ves-p5/600/600', isPublic: true  },
  { id: 6, title: 'Slab Bowl',        clay: 'Porcelain',  date: 'Feb 2026', glaze: 'Iron Red',      img: 'https://picsum.photos/seed/ves-p6/600/600', isPublic: false },
];

const COMMUNITY = [
  { id: 1, student: 'Ming',    title: 'Glazed Bowl',   clay: 'Porcelain',  date: 'Feb 2026', img: 'https://picsum.photos/seed/ves-c1/600/600' },
  { id: 2, student: 'Priya',  title: 'Yunomi Cup',    clay: 'Stoneware',  date: 'Feb 2026', img: 'https://picsum.photos/seed/ves-c2/600/600' },
  { id: 3, student: 'Jun',    title: 'Slab Plate',    clay: 'Stoneware',  date: 'Jan 2026', img: 'https://picsum.photos/seed/ves-c3/600/600' },
  { id: 4, student: 'Farah',  title: 'Coil Vase',     clay: 'Terracotta', date: 'Jan 2026', img: 'https://picsum.photos/seed/ves-c4/600/600' },
  { id: 5, student: 'Leon',   title: 'Celadon Mug',   clay: 'Porcelain',  date: 'Feb 2026', img: 'https://picsum.photos/seed/ves-c5/600/600' },
  { id: 6, student: 'Aisha',  title: 'Tea Bowl',      clay: 'Stoneware',  date: 'Feb 2026', img: 'https://picsum.photos/seed/ves-c6/600/600' },
];

export default function TestGallery() {
  const [activeTab, setActiveTab] = useState('gallery');
  const [galleryTab, setGalleryTab] = useState('mine'); // 'mine' | 'community'
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [publicPieces, setPublicPieces] = useState(new Set(MY_PIECES.filter(p => p.isPublic).map(p => p.id)));

  function togglePublic(id) {
    setPublicPieces(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>

      {/* TOP BAR */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600" alt="VES" style={{ height: '26px', width: 'auto' }} />
        </div>
      </header>

      <main style={{ maxWidth: '520px', margin: '0 auto', padding: '0 0 88px' }}>

        {/* Page header */}
        <div style={{ padding: '28px 20px 0', borderBottom: `1px solid ${RULE}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: '0 0 4px' }}>Gallery</h1>
              <div style={{ fontSize: '13px', color: MUTED }}>{MY_PIECES.length} pieces</div>
            </div>
            <button style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 14px', border: 'none', backgroundColor: TC, color: '#FFF',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add_photo_alternate</span>
              Upload
            </button>
          </div>

          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: '0' }}>
            {[{ id: 'mine', label: 'My Work' }, { id: 'community', label: 'Community' }].map(t => (
              <button
                key={t.id}
                onClick={() => setGalleryTab(t.id)}
                style={{
                  flex: 1, padding: '10px', border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: galleryTab === t.id ? INK : MUTED,
                  borderBottom: `2px solid ${galleryTab === t.id ? INK : 'transparent'}`,
                  transition: 'all 0.15s ease',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* MY WORK */}
        {galleryTab === 'mine' && (
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
              {MY_PIECES.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPiece(p)}
                  style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', backgroundColor: '#F0EDE9', cursor: 'pointer' }}
                >
                  <img src={p.img} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {/* Public indicator */}
                  {publicPieces.has(p.id) && (
                    <div style={{ position: 'absolute', top: '6px', right: '6px', backgroundColor: TC, width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '11px', color: '#FFF', fontVariationSettings: "'FILL' 1" }}>visibility</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* COMMUNITY */}
        {galleryTab === 'community' && (
          <div style={{ padding: '20px 20px' }}>
            <p style={{ fontSize: '13px', color: MUTED, marginBottom: '18px', lineHeight: 1.5 }}>
              Get inspired by what your fellow potters are making.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {COMMUNITY.map(p => (
                <div key={p.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedPiece({ ...p, isCommunity: true })}>
                  <div style={{ aspectRatio: '1', overflow: 'hidden', backgroundColor: '#F0EDE9', marginBottom: '8px' }}>
                    <img src={p.img} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '1px' }}>{p.title}</div>
                  <div style={{ fontSize: '11px', color: MUTED }}>by {p.student} · {p.clay}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* PIECE DETAIL BOTTOM SHEET */}
      {selectedPiece && (
        <>
          <div onClick={() => setSelectedPiece(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 60 }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61,
            backgroundColor: '#FFFFFF',
            maxWidth: '520px', margin: '0 auto',
            maxHeight: '85vh', overflowY: 'auto',
          }}>
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: '36px', height: '3px', backgroundColor: RULE }} />
            </div>

            {/* Image */}
            <div style={{ aspectRatio: '1', overflow: 'hidden', backgroundColor: '#F0EDE9', margin: '12px 0 0' }}>
              <img src={selectedPiece.img} alt={selectedPiece.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>

            <div style={{ padding: '20px 20px 40px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '2px' }}>{selectedPiece.title}</div>
                  {selectedPiece.isCommunity
                    ? <div style={{ fontSize: '13px', color: MUTED }}>by {selectedPiece.student}</div>
                    : <div style={{ fontSize: '13px', color: MUTED }}>{selectedPiece.clay} · {selectedPiece.date}</div>
                  }
                </div>
                <button onClick={() => setSelectedPiece(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px', color: MUTED }}>close</span>
                </button>
              </div>

              {/* Meta row */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {[selectedPiece.clay, selectedPiece.glaze, selectedPiece.date].filter(Boolean).map((tag, i) => (
                  <span key={i} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 8px', backgroundColor: ALT, color: MUTED }}>
                    {tag}
                  </span>
                ))}
              </div>

              {/* Share toggle (own pieces only) */}
              {!selectedPiece.isCommunity && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px', border: `1px solid ${RULE}`, backgroundColor: ALT,
                }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '2px' }}>Share with community</div>
                    <div style={{ fontSize: '11px', color: MUTED }}>Visible to other VES students for inspiration</div>
                  </div>
                  {/* Toggle */}
                  <button
                    onClick={() => togglePublic(selectedPiece.id)}
                    style={{
                      width: '44px', height: '24px',
                      backgroundColor: publicPieces.has(selectedPiece.id) ? TC : '#DDD',
                      borderRadius: '12px', border: 'none', cursor: 'pointer',
                      position: 'relative', transition: 'background-color 0.2s ease', flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '3px',
                      left: publicPieces.has(selectedPiece.id) ? '23px' : '3px',
                      width: '18px', height: '18px', borderRadius: '50%',
                      backgroundColor: '#FFF', transition: 'left 0.2s ease',
                    }} />
                  </button>
                </div>
              )}

              {/* Actions */}
              {!selectedPiece.isCommunity && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <button style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', color: MUTED }}>
                    Edit
                  </button>
                  <button style={{ flex: 1, padding: '12px', border: `1px solid rgba(200,50,50,0.3)`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', color: '#C03030' }}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}

function BottomNav({ activeTab, setActiveTab }) {
  const TC = '#C4622D';
  const RULE = 'rgba(40,40,40,0.09)';
  const tabs = [
    { id: 'home',    label: 'Home',    icon: 'home',           href: '/test/dashboard' },
    { id: 'classes', label: 'Classes', icon: 'calendar_month', href: '/test/classes' },
    { id: 'gallery', label: 'Gallery', icon: 'photo_library',  href: '/test/gallery' },
    { id: 'account', label: 'Account', icon: 'person',         href: '/test/account', badge: true },
  ];
  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: '#FFFFFF', borderTop: `1px solid ${RULE}`, display: 'flex', height: '60px', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {tabs.map(tab => {
        const active = activeTab === tab.id;
        return (
          <a key={tab.id} href={tab.href} onClick={e => { e.preventDefault(); setActiveTab(tab.id); window.location.href = tab.href; }}
            style={{ flex: 1, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', padding: '8px 0', position: 'relative', textDecoration: 'none' }}
          >
            {tab.badge && <span style={{ position: 'absolute', top: '7px', right: 'calc(50% - 16px)', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: TC }} />}
            <span className="material-symbols-outlined" style={{ fontSize: '22px', color: active ? TC : '#BBBBBB', fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400" }}>{tab.icon}</span>
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: active ? TC : '#BBBBBB' }}>{tab.label}</span>
            {active && <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '20px', height: '2px', backgroundColor: TC }} />}
          </a>
        );
      })}
    </nav>
  );
}
