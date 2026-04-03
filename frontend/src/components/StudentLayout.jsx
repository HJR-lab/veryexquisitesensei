import { Outlet, useLocation } from 'react-router-dom';

const TC = '#C4622D';
const RULE = 'rgba(40,40,40,0.09)';

const TABS = [
  { id: 'home',    label: 'Home',    icon: 'home',           href: '/dashboard' },
  { id: 'classes', label: 'Classes', icon: 'calendar_month', href: '/classes' },
  { id: 'credits', label: 'Credits', icon: 'toll',           href: '/credits' },
  { id: 'studio',  label: 'Studio',  icon: 'door_open',      href: '/studio-access' },
  { id: 'pieces',  label: 'Pieces',  icon: 'local_fire_department', href: '/my-pieces' },
  { id: 'gallery', label: 'Gallery', icon: 'photo_library',  href: '/gallery' },
  { id: 'account', label: 'Account', icon: 'person',         href: '/account' },
];

const getActiveTab = (pathname) => {
  if (pathname.startsWith('/classes')) return 'classes';
  if (pathname.startsWith('/credits')) return 'credits';
  if (pathname.startsWith('/studio')) return 'studio';
  if (pathname.startsWith('/my-pieces')) return 'pieces';
  if (pathname.startsWith('/gallery')) return 'gallery';
  if (pathname.startsWith('/account')) return 'account';
  if (pathname.startsWith('/upload')) return 'gallery';
  if (pathname.startsWith('/membership')) return 'account';
  if (pathname.startsWith('/policy')) return 'account';
  return 'home';
};

function BottomNav() {
  const location = useLocation();
  const activeTab = getActiveTab(location.pathname);

  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: '#FFFFFF', borderTop: `1px solid ${RULE}`, display: 'flex', height: '60px', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {TABS.map(tab => {
        const active = activeTab === tab.id;
        return (
          <a
            key={tab.id}
            href={tab.href}
            style={{ flex: 1, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', padding: '8px 0', position: 'relative', textDecoration: 'none' }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '22px', color: active ? TC : '#BBBBBB', fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400" }}
            >
              {tab.icon}
            </span>
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: active ? TC : '#BBBBBB' }}>{tab.label}</span>
            {active && <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '20px', height: '2px', backgroundColor: TC }} />}
          </a>
        );
      })}
    </nav>
  );
}

export default function StudentLayout() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}
