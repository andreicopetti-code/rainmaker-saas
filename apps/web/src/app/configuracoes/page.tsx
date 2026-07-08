import { CompaniesImportExport } from '@/components/settings/CompaniesImportExport';
import { FunnelStagesEditor } from '@/components/settings/FunnelStagesEditor';
import { OrganizationUfSelector } from '@/components/settings/OrganizationUfSelector';
import { OrganizationTeamPanel } from '@/components/settings/OrganizationTeamPanel';
import { getFunnelSettings, getOrganizationUfSettings } from './actions';
import { getTeamOverview } from './team-actions';
import './configuracoes.css';
import '@/components/settings/organization-uf.css';

export default async function ConfiguracoesPage() {
  const [settings, ufSettings, team] = await Promise.all([
    getFunnelSettings(),
    getOrganizationUfSettings().catch(() => null),
    getTeamOverview().catch(() => null),
  ]);

  return (
    <div className="settings-page">
      {!settings ? (
        <div className="settings-empty">
          Nenhum funil encontrado para sua organização.
        </div>
      ) : (
        <div className="settings-body">
          {ufSettings && (
            <div className="settings-uf-section">
              <OrganizationUfSelector settings={ufSettings} />
            </div>
          )}
          {team && <OrganizationTeamPanel initial={team} />}
          <div className="settings-two-col">
            <FunnelStagesEditor
              funnelId={settings.funnelId}
              initialConfig={settings.stageConfig}
              initialCounts={settings.stageCounts}
            />
            <CompaniesImportExport />
          </div>
        </div>
      )}
    </div>
  );
}
