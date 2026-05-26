import { Link } from 'react-router-dom';
import AdminPage from '../components/AdminPage';
import '../styles/UtilityDashboard.css';

const sidebarItems = [
  { label: 'Overview', icon: 'bolt', href: '/admin/doe-dashboard', active: true },
  { label: 'Usage history', icon: 'bar_chart_4_bars', href: '/admin/doe-dashboard' },
  { label: 'Meters', icon: 'electrical_services', href: '/admin/students' },
  { label: 'Alerts', icon: 'warning', href: '/admin/classes' },
  { label: 'Tariffs', icon: 'settings', href: '/admin/courses' },
];

const metrics = [
  { label: 'Current usage', value: '12.84 MW', detail: '+4.6% vs yesterday', tone: 'good' },
  { label: 'Peak demand', value: '14.21 MW', detail: 'Recorded at 18:20', tone: 'accent' },
  { label: 'Grid health', value: '99.2%', detail: 'No feeder outages', tone: 'good' },
];

const trend = [
  { day: 'M', height: 44 },
  { day: 'T', height: 58 },
  { day: 'W', height: 52 },
  { day: 'T', height: 66, active: true },
  { day: 'F', height: 74, active: true },
  { day: 'S', height: 60 },
  { day: 'S', height: 48 },
];

const historyRows = [
  { period: 'Feb 2026', usage: '9,420 MWh', peak: '14.21 MW', cost: '$1.82M' },
  { period: 'Jan 2026', usage: '8,970 MWh', peak: '13.54 MW', cost: '$1.71M' },
  { period: 'Dec 2025', usage: '8,610 MWh', peak: '13.11 MW', cost: '$1.64M' },
  { period: 'Nov 2025', usage: '8,180 MWh', peak: '12.77 MW', cost: '$1.55M' },
];

const usageDetails = [
  { label: 'Reserve margin', value: '18.7%', tone: 'good' },
  { label: 'Peak threshold', value: '15.50 MW', tone: 'accent' },
  { label: 'Substations online', value: '18 / 18', tone: 'good' },
];

export default function UtilityDashboard() {
  return (
    <AdminPage
      title="Utility Operations"
      subtitle="Track live usage, peak demand, and billing trends across the current cycle."
      actions={
        <div className="utility-header-actions">
          <button type="button" className="utility-button utility-button-secondary">Feb 2026</button>
          <button type="button" className="utility-button utility-button-primary">Export report</button>
        </div>
      }
    >
      <div className="utility-dashboard">
        <aside className="utility-sidebar">
          <div className="utility-brand">
            <div className="utility-brand-mark">
              <span className="material-symbols-outlined">offline_bolt</span>
            </div>
            <div>
              <div className="utility-brand-name">LUNARIS GRID</div>
              <div className="utility-brand-subtitle">DOE frontend shell</div>
            </div>
          </div>

          <div className="utility-sidebar-group-label">Operations</div>
          <nav className="utility-sidebar-nav">
            {sidebarItems.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                className={`utility-sidebar-link${item.active ? ' is-active' : ''}`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="utility-sidebar-footer">
            <div className="utility-sidebar-footer-title">North Utility Ops</div>
            <div className="utility-sidebar-footer-copy">ops@lunaris.energy</div>
          </div>
        </aside>

        <div className="utility-main">
          <section className="utility-metrics">
          {metrics.map((metric) => (
            <article key={metric.label} className="utility-card utility-metric-card">
              <div className="utility-card-label">{metric.label}</div>
              <div className="utility-metric-value">{metric.value}</div>
              <div className={`utility-card-detail is-${metric.tone}`}>{metric.detail}</div>
            </article>
          ))}
        </section>

        <section className="utility-body">
          <article className="utility-card utility-usage-card">
            <div className="utility-card-header">
              <h2>Current usage</h2>
              <p>Live network demand and today&apos;s operating envelope.</p>
            </div>

            <div className="utility-usage-value">12.84 MW</div>
            <p className="utility-usage-copy">
              Current draw across 64,210 smart meters in the north service area.
            </p>

            <div className="utility-usage-details">
              {usageDetails.map((detail) => (
                <div key={detail.label} className="utility-detail-row">
                  <span>{detail.label}</span>
                  <strong className={`is-${detail.tone}`}>{detail.value}</strong>
                </div>
              ))}
            </div>

            <div className="utility-trend-card">
              <div className="utility-trend-title">7-day trend</div>
              <div className="utility-trend-bars">
                {trend.map((item) => (
                  <div key={item.day} className="utility-trend-day">
                    <div
                      className={`utility-trend-bar${item.active ? ' is-active' : ''}`}
                      style={{ height: `${item.height}px` }}
                    />
                    <span>{item.day}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="utility-card utility-history-card">
            <div className="utility-card-header">
              <h2>Usage history</h2>
              <p>Billing periods, average load, and monthly cost trends.</p>
            </div>

            <div className="utility-history-toolbar">
              <input type="text" value="Search billing period" readOnly aria-label="Search billing period" />
              <button type="button" className="utility-button utility-button-secondary">Download CSV</button>
            </div>

            <div className="utility-table-wrap">
              <table className="utility-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Usage</th>
                    <th>Peak</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row) => (
                    <tr key={row.period}>
                      <td>{row.period}</td>
                      <td>{row.usage}</td>
                      <td>{row.peak}</td>
                      <td>{row.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="utility-table-footer">
              <span>Showing 4 periods</span>
              <div className="utility-table-pagination">
                <button type="button" className="utility-pagination-link">Previous</button>
                <span className="utility-pagination-indicator">1</span>
                <button type="button" className="utility-pagination-link">Next</button>
              </div>
            </div>
          </article>
        </section>
        </div>
      </div>
    </AdminPage>
  );
}
