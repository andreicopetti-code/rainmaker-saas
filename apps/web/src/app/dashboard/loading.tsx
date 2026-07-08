import './dashboard.css';

export default function DashboardLoading() {
  return (
    <div className="dashboard-page">
      <div className="dash-root">
        <div className="dash-toolbar">
          <div className="dash-skel" style={{ width: 140, height: 28 }} />
        </div>
        <div className="dash-body">
          <div className="dash-kpi-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="dash-kpi dash-skel-block" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
