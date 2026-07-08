export default function FunilLoading() {
  return (
    <div className="board-page">
      <div className="board-main">
        <div className="board-toolbar">
          <div style={{ width: 220, height: 32, borderRadius: 8, background: 'var(--border2)' }} className="skel" />
        </div>
        <div className="board" style={{ padding: '0 20px' }}>
          {[1, 2, 3, 4, 5].map((col) => (
            <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 230 }}>
              {/* Column header */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 0 6px' }}>
                <div style={{ width: 80, height: 14, borderRadius: 4, background: 'var(--border2)' }} className="skel" />
                <div style={{ width: 22, height: 18, borderRadius: 10, background: 'var(--border2)' }} className="skel" />
              </div>
              {/* Cards */}
              {Array.from({ length: col === 3 ? 2 : col === 1 ? 3 : 1 }).map((_, i) => (
                <div key={i} className="card" style={{ opacity: 1, cursor: 'default', borderLeftColor: 'var(--border2)' }}>
                  <div style={{ width: '75%', height: 13, borderRadius: 4, background: 'var(--border2)', marginBottom: 6 }} className="skel" />
                  <div style={{ width: '45%', height: 10, borderRadius: 4, background: 'var(--border2)', marginBottom: 8 }} className="skel" />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ width: 52, height: 16, borderRadius: 8, background: 'var(--border2)' }} className="skel" />
                    <div style={{ width: 60, height: 10, borderRadius: 4, background: 'var(--border2)' }} className="skel" />
                  </div>
                  <div style={{ width: '90%', height: 18, borderRadius: 6, background: 'var(--border2)', marginTop: 8 }} className="skel" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
