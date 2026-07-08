export default function AgendaLoading() {
  return (
    <div className="board-page">
      <div className="cal-wrap" style={{ flexDirection: 'column', padding: '16px 20px' }}>
        {/* Toolbar skeleton */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingBottom: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--border2)' }} className="skel" />
          <div style={{ width: 160, height: 22, borderRadius: 6, background: 'var(--border2)' }} className="skel" />
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--border2)' }} className="skel" />
          <div style={{ width: 60, height: 28, borderRadius: 8, background: 'var(--border2)' }} className="skel" />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <div style={{ width: 70, height: 28, borderRadius: 8, background: 'var(--border2)' }} className="skel" />
            <div style={{ width: 100, height: 28, borderRadius: 8, background: 'var(--border2)' }} className="skel" />
          </div>
        </div>

        {/* Weekday header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
          {['DOM','SEG','TER','QUA','QUI','SEX','SÁB'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text3)', padding: '6px 0' }}>{d}</div>
          ))}
        </div>

        {/* Grid skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flex: 1, borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>
          {Array.from({ length: 42 }).map((_, i) => (
            <div key={i} style={{ borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 5, background: i % 11 === 0 ? '#EFF6FF' : 'var(--surface)' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--border2)', marginBottom: 4 }} className="skel" />
              {i % 7 === 2 || i % 7 === 4 ? (
                <div style={{ height: 14, borderRadius: 4, background: 'var(--border2)', marginBottom: 2 }} className="skel" />
              ) : null}
              {i % 11 === 3 ? (
                <div style={{ height: 14, borderRadius: 4, background: 'var(--border2)' }} className="skel" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
