import './configuracoes.css';

function SettingsSkeleton() {
  return (
    <div className="settings-left">
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <div className="settings-section-title">Etapas do funil</div>
            <div className="settings-section-desc">Carregando…</div>
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="col-setting-row" style={{ opacity: 0.5 }}>
            <div style={{ width: 20, height: 16, background: 'var(--border)', borderRadius: 4 }} />
            <div style={{ width: 28, height: 28, background: 'var(--border)', borderRadius: 7 }} />
            <div style={{ flex: 1, height: 32, background: 'var(--border)', borderRadius: 7 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ConfiguracoesLoading() {
  return (
    <div className="settings-page">
      <div className="settings-body settings-two-col">
        <SettingsSkeleton />
      </div>
    </div>
  );
}
