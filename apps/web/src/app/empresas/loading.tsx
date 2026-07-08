export default function EmpresasLoading() {
  return (
    <div className="cnpj-page-wrap">
      <main className="cnpj-main">
        <div className="cnpj-page">
          <div className="cnpj-topbar">
            <div className="cnpj-topbar-left">
              <div className="cnpj-icon-wrap">
                <div className="skel" style={{ width: 36, height: 36, borderRadius: 8 }} />
              </div>
              <div>
                <div className="skel" style={{ width: 140, height: 16, borderRadius: 4, marginBottom: 6 }} />
                <div className="skel" style={{ width: 200, height: 12, borderRadius: 4 }} />
              </div>
            </div>
            <div className="cnpj-topbar-right">
              <div className="skel" style={{ width: 60, height: 28, borderRadius: 20 }} />
              <div className="skel" style={{ width: 280, height: 38, borderRadius: 8 }} />
              <div className="skel" style={{ width: 90, height: 38, borderRadius: 8 }} />
            </div>
          </div>

          <div className="cnpj-tabs">
            <div className="skel" style={{ width: 70, height: 32, borderRadius: 6 }} />
            <div className="skel" style={{ width: 100, height: 32, borderRadius: 6 }} />
            <div className="skel" style={{ width: 100, height: 32, borderRadius: 6 }} />
          </div>

          <div className="cnpj-body">
            <div className="cnpj-empty">
              <div className="skel" style={{ width: 48, height: 48, borderRadius: 8, marginBottom: 16 }} />
              <div className="skel" style={{ width: 220, height: 14, borderRadius: 4, marginBottom: 8 }} />
              <div className="skel" style={{ width: 180, height: 12, borderRadius: 4 }} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
