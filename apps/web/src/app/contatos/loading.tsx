import './contatos.css';

function SkeletonRows() {
  return (
    <div className="contacts-body">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="contacts-skeleton-row" />
      ))}
    </div>
  );
}

export default function ContatosLoading() {
  return (
    <div className="contacts-page">
      <div className="contacts-panel">
        <div className="contacts-toolbar">
          <div className="contacts-search" style={{ height: 34, background: 'var(--border)', borderRadius: 8 }} />
        </div>
        <SkeletonRows />
      </div>
    </div>
  );
}
