export default function CeoLoading() {
  return (
    <div className="board-page">
      <div style={{ maxWidth: 780, margin: '32px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 200, height: 28, borderRadius: 8, background: 'var(--border2)' }} className="skel" />
        <div style={{ width: '100%', height: 120, borderRadius: 12, background: 'var(--border2)' }} className="skel" />
        <div style={{ width: '60%', height: 40, borderRadius: 8, background: 'var(--border2)' }} className="skel" />
      </div>
    </div>
  );
}
