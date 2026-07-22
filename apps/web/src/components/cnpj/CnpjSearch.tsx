'use client';

import { useState, useRef, useCallback, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { EmpresaPreview, EmpresaDetail, CnpjUsage, CnpjHistoryItem, OrgUfAccess } from '@/app/empresas/actions';
import {
  searchCnpjPreview,
  getEmpresaDetail,
  getCnpjHistory,
  sendCnpjToFunil,
  getCnpjUsage,
} from '@/app/empresas/actions';
import { isEmpresaUfAllowedForFicha } from '@/lib/billing/org-uf-access';
import { resolveRegimeDisplay } from '@/lib/empresas/empresa-contact';
import { OrganizationUfSelector } from '@/components/settings/OrganizationUfSelector';
import type { OrganizationUfSettings } from '@/app/configuracoes/actions';
import '@/components/settings/organization-uf.css';

// ── Types ─────────────────────────────────────────────────────────────────
type Tab = 'search' | 'historico';
type ViewState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'preview'; empresa: EmpresaPreview }
  | { kind: 'detail'; empresa: EmpresaDetail }
  | { kind: 'not_found'; cnpj: string }
  | { kind: 'error'; message: string };

// ── Helpers ────────────────────────────────────────────────────────────────
function maskCnpj(value: string): string {
  let v = value.replace(/\D/g, '').substring(0, 14);
  if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
  else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
  else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
  else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,3})/, '$1.$2');
  return v;
}

function formatCnpj(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length !== 14) return digits;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function detectStatus(situacao: string | null): { cls: string; label: string } {
  const raw = (situacao ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!raw) return { cls: 'indef', label: 'Status não informado' };
  if (raw.includes('ativa')) return { cls: 'ativa', label: '✓ ATIVA' };
  if (raw.includes('suspensa') || raw.includes('inapta')) return { cls: 'suspensa', label: '⚠ SUSPENSA' };
  if (raw.includes('baixada') || raw.includes('inativa') || raw.includes('cancelada')) return { cls: 'inativa', label: '✗ INATIVA' };
  return { cls: 'indef', label: situacao ?? '' };
}

/** Preview: não revela Real vs Presumido antes do unlock. */
function regimeSimples(empresa: EmpresaPreview): string {
  const display = resolveRegimeDisplay(empresa.regime_tributario, empresa.regime_historico);
  if (display.kind === 'empty') return '';
  const raw = display.kind === 'timeline' ? display.entries[0]?.val ?? '' : display.label;
  const u = raw.toUpperCase();
  if (u.includes('SIMPLES') || u.includes('MEI')) return 'Simples Nacional';
  if (u.includes('LUCRO') || u.includes('PRESUMIDO') || u.includes('REAL')) {
    return 'Lucro Real ou Presumido';
  }
  if (u.includes('IMUNE') || u.includes('ISENTO')) return 'Imune / Isento';
  return 'Ver dados completos';
}

function getSocios(socios: string | null): string[] {
  if (!socios || !socios.trim()) return [];
  let parts: string[];
  if (socios.includes(';') || socios.includes('|')) {
    parts = socios.split(/[;|]+/);
  } else {
    parts = socios.split(/-(?=[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÇ])/);
  }
  return parts.map(s => s.replace(/-$/, '').trim()).filter(s => s.length > 1);
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0]?.substring(0, 2) ?? '??').toUpperCase();
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch { return iso; }
}

type UnlockState =
  | { canUnlock: true }
  | { canUnlock: false; reason: 'limit' | 'selection' | 'uf'; uf?: string | null };

function getUnlockState(
  ufAccess: OrgUfAccess | null,
  empresa: EmpresaPreview,
  usage: CnpjUsage,
): UnlockState {
  if (usage.remaining <= 0 && usage.limit > 0) {
    return { canUnlock: false, reason: 'limit' };
  }
  if (!ufAccess) {
    return usage.remaining > 0 || usage.limit <= 0
      ? { canUnlock: true as const }
      : { canUnlock: false as const, reason: 'limit' as const };
  }
  if (ufAccess.needsSelection) {
    return { canUnlock: false as const, reason: 'selection' as const };
  }
  if (!isEmpresaUfAllowedForFicha(ufAccess, empresa.estado)) {
    return { canUnlock: false as const, reason: 'uf' as const, uf: empresa.estado };
  }
  return usage.remaining > 0 || usage.limit <= 0
    ? { canUnlock: true as const }
    : { canUnlock: false as const, reason: 'limit' as const };
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CreditsBar({ usage }: { usage: CnpjUsage }) {
  const pct = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  const color = usage.remaining === 0 ? 'var(--red)' : usage.remaining <= 3 ? 'var(--amber)' : 'var(--green)';
  return (
    <div className="cnpj-credits-wrap" title={`${usage.used} de ${usage.limit} créditos usados hoje`}>
      <svg viewBox="0 0 24 24" fill="currentColor" width={13} height={13} style={{ opacity: .7 }}>
        <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="2"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
      <span className="cnpj-credits-text">
        <span style={{ color }}>{usage.used}</span>/{usage.limit}
      </span>
      <div className="cnpj-credits-bar">
        <div className="cnpj-credits-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function StatusBadge({ situacao }: { situacao: string | null }) {
  const s = detectStatus(situacao);
  return <span className={`cnpj-status-badge ${s.cls}`}><span className="dot" />{s.label}</span>;
}

function PreviewCard({
  empresa,
  onVerDetalhe,
  usage,
  isPending,
  ufAccess,
}: {
  empresa: EmpresaPreview;
  onVerDetalhe: () => void;
  usage: CnpjUsage;
  isPending: boolean;
  ufAccess: OrgUfAccess | null;
}) {
  const cnpjFmt = formatCnpj(empresa.cnpj);
  const regime = regimeSimples(empresa);
  const unlock = getUnlockState(ufAccess, empresa, usage);
  const canUnlock = unlock.canUnlock;
  const colorRem = usage.remaining === 0 ? 'var(--red)' : usage.remaining <= 3 ? 'var(--amber)' : 'var(--text3)';

  let buttonLabel = 'Ver dados completos';
  if (isPending) buttonLabel = 'Carregando...';
  else if (!canUnlock && unlock.reason === 'limit') buttonLabel = 'Limite diário atingido';
  else if (!canUnlock && unlock.reason === 'selection') buttonLabel = 'Escolha a UF do plano';
  else if (!canUnlock && unlock.reason === 'uf') buttonLabel = `UF ${unlock.uf ?? '—'} não incluída no plano`;

  return (
    <div className="cnpj-card cnpj-preview-card">
      <div className="cnpj-card-header">
        <div className="cnpj-card-icon"><BuildingIcon /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cnpj-card-razao">{empresa.razao_social || '—'}</div>
          {empresa.nome_fantasia && (
            <div className="cnpj-card-fantasia">{empresa.nome_fantasia}</div>
          )}
          <div className="cnpj-card-cnpj">{cnpjFmt}</div>
          <StatusBadge situacao={empresa.situacao} />
        </div>
      </div>

      <div className="cnpj-fields">
        <div className="cnpj-field">
          <div className="cnpj-field-label">CIDADE</div>
          <div className="cnpj-field-value">{empresa.cidade || '—'}{empresa.estado ? ` · ${empresa.estado}` : ''}</div>
        </div>
        <div className="cnpj-field">
          <div className="cnpj-field-label">REGIME</div>
          <div className="cnpj-field-value">{regime || '—'}</div>
        </div>
      </div>

      <div className="cnpj-locked-section">
        <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14} style={{ opacity: .5 }}>
          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
        </svg>
        <span>Sócios · CNAE · Telefone · E-mail · Regime tributário</span>
        <span style={{ color: 'var(--text3)', fontSize: 11 }}>Disponíveis ao ver os dados completos.</span>
      </div>

      <button
        className="cnpj-btn-detail"
        onClick={onVerDetalhe}
        disabled={!canUnlock || isPending}
      >
        {isPending ? (
          'Carregando...'
        ) : !canUnlock ? (
          buttonLabel
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}>
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
            </svg>
            Ver dados completos
          </>
        )}
      </button>
      <div className="cnpj-credit-hint">
        Consome 1 crédito · <span style={{ color: colorRem, fontWeight: 700 }}>
          {usage.remaining === 0 && usage.limit > 0
            ? `Limite atingido — ${usage.periodKind === 'monthly' ? 'renova no início do mês' : 'renova à meia-noite'}`
            : !canUnlock && unlock.reason === 'uf' && ufAccess
              ? `Plano inclui: ${ufAccess.selectedUfs.join(', ') || 'nenhuma UF'}`
              : !canUnlock && unlock.reason === 'selection'
                ? 'Configure suas UFs acima'
                : `Restam ${usage.remaining} ${usage.periodKind === 'monthly' ? 'este mês' : 'hoje'}`}
        </span>
      </div>
    </div>
  );
}

function DetailCard({
  empresa,
  onBack,
  onEnviarFunil,
  isPending,
}: {
  empresa: EmpresaDetail;
  onBack: () => void;
  onEnviarFunil: () => void;
  isPending?: boolean;
}) {
  const cnpjFmt = formatCnpj(empresa.cnpj);
  const socios = getSocios(empresa.socios);
  const regime = resolveRegimeDisplay(empresa.regime_tributario, empresa.regime_historico);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(cnpjFmt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  let regimeEl: React.ReactNode;
  if (regime.kind === 'empty') {
    regimeEl = <span style={{ color: 'var(--text3)', fontSize: 13 }}>Não informado</span>;
  } else if (regime.kind === 'current') {
    regimeEl = <span className="cnpj-regime-raw">{regime.label}</span>;
  } else {
    regimeEl = (
      <div className="cnpj-regime-timeline">
        {regime.entries.map(e => (
          <div key={e.year} className="cnpj-regime-item">
            <span className="cnpj-regime-year">{e.year}</span>
            <span className="cnpj-regime-val">{e.val}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="cnpj-card">
      <button className="cnpj-back-btn" onClick={onBack}>← Voltar ao resumo</button>

      <div className="cnpj-card-header">
        <div className="cnpj-card-icon"><BuildingIcon /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cnpj-card-razao">{empresa.razao_social || '—'}</div>
          {empresa.nome_fantasia && <div className="cnpj-card-fantasia">{empresa.nome_fantasia}</div>}
          <div className="cnpj-card-cnpj">{cnpjFmt}</div>
          <StatusBadge situacao={empresa.situacao} />
        </div>
        <div className="cnpj-card-actions">
          <button className="cnpj-action-btn" onClick={onEnviarFunil} disabled={isPending} title="Enviar para o Funil">
            <svg viewBox="0 0 24 24" fill="currentColor" width={13} height={13}>
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
            </svg>
            Enviar para Leads
          </button>
          <button className="cnpj-action-btn" onClick={copyToClipboard} title="Copiar CNPJ">
            <svg viewBox="0 0 24 24" fill="currentColor" width={13} height={13}>
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            {copied ? 'Copiado!' : 'Copiar CNPJ'}
          </button>
        </div>
      </div>

      <div className="cnpj-fields">
        <div className="cnpj-field">
          <div className="cnpj-field-label">CIDADE</div>
          <div className="cnpj-field-value">{empresa.cidade || '—'}{empresa.estado ? ` · ${empresa.estado}` : ''}</div>
        </div>
        <div className="cnpj-field">
          <div className="cnpj-field-label">CNAE PRINCIPAL</div>
          <div className="cnpj-field-value">{empresa.cnae_codigo || '—'}</div>
        </div>
        {empresa.cnae_descricao && (
          <div className="cnpj-field" style={{ gridColumn: '1 / -1' }}>
            <div className="cnpj-field-label">ATIVIDADE</div>
            <div className="cnpj-field-value">{empresa.cnae_descricao}</div>
          </div>
        )}
        {empresa.endereco && (
          <div className="cnpj-field" style={{ gridColumn: '1 / -1' }}>
            <div className="cnpj-field-label">ENDEREÇO</div>
            <div className="cnpj-field-value">
              {empresa.endereco}{empresa.bairro ? `, ${empresa.bairro}` : ''}{empresa.cep ? ` · CEP ${empresa.cep}` : ''}
            </div>
          </div>
        )}
        {empresa.telefone && (
          <div className="cnpj-field">
            <div className="cnpj-field-label">TELEFONE</div>
            <div className="cnpj-field-value">{empresa.telefone}</div>
          </div>
        )}
        {empresa.email && (
          <div className="cnpj-field">
            <div className="cnpj-field-label">E-MAIL</div>
            <div className="cnpj-field-value">{empresa.email}</div>
          </div>
        )}
        {empresa.porte && (
          <div className="cnpj-field">
            <div className="cnpj-field-label">PORTE</div>
            <div className="cnpj-field-value">{empresa.porte}</div>
          </div>
        )}
        {empresa.data_inicio && (
          <div className="cnpj-field">
            <div className="cnpj-field-label">INÍCIO DAS ATIVIDADES</div>
            <div className="cnpj-field-value">{empresa.data_inicio}</div>
          </div>
        )}
      </div>

      {socios.length > 0 && (
        <div className="cnpj-socios-section">
          <div className="cnpj-section-title">
            <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}>
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
            SÓCIOS <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11 }}>({socios.length})</span>
          </div>
          {socios.map((s, i) => (
            <div key={i} className="cnpj-socio-item">
              <div className="cnpj-socio-avatar">{initials(s)}</div>
              <div className="cnpj-socio-name">{s}</div>
            </div>
          ))}
        </div>
      )}

      <div className="cnpj-regime-section">
        <div className="cnpj-section-title">
          <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}>
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/>
          </svg>
          REGIME TRIBUTÁRIO
        </div>
        {regimeEl}
      </div>
    </div>
  );
}

function HistoryTab({
  history,
  onSelect,
}: {
  history: CnpjHistoryItem[];
  onSelect: (cnpj: string) => void;
}) {
  if (history.length === 0) {
    return (
      <div className="cnpj-empty">
        <svg viewBox="0 0 24 24" fill="currentColor" width={40} height={40} style={{ opacity: .15 }}>
          <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
        </svg>
        <p>Nenhuma consulta realizada ainda</p>
      </div>
    );
  }

  return (
    <div className="cnpj-history-list">
      {history.map(h => (
        <button
          key={h.id}
          type="button"
          className="cnpj-history-item"
          onClick={() => onSelect(h.cnpj)}
          title={h.razao_social ? `Consultar ${formatCnpj(h.cnpj)}` : 'Consultar CNPJ (nome não registrado na consulta)'}
        >
          <div className="cnpj-history-main">
            <div className="cnpj-history-razao">{h.razao_social || 'Razão social não disponível'}</div>
            <div className="cnpj-history-cnpj">{formatCnpj(h.cnpj)}</div>
          </div>
          <div className="cnpj-history-date">{fmtDate(h.created_at)}</div>
        </button>
      ))}
    </div>
  );
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}>
      <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>
    </svg>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

interface Props {
  initialCount: number;
  initialUsage: CnpjUsage;
  initialHistory: CnpjHistoryItem[];
  initialUfSettings: OrganizationUfSettings | null;
}

export function CnpjSearch({ initialCount, initialUsage, initialHistory, initialUfSettings }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('search');
  const [inputValue, setInputValue] = useState('');
  const [view, setView] = useState<ViewState>({ kind: 'empty' });
  const [usage, setUsage] = useState<CnpjUsage>(initialUsage);
  const [history, setHistory] = useState<CnpjHistoryItem[]>(initialHistory);
  const [ufSettings, setUfSettings] = useState<OrganizationUfSettings | null>(initialUfSettings);
  const ufAccess = ufSettings;

  useEffect(() => {
    setUfSettings(initialUfSettings);
  }, [initialUfSettings]);

  useEffect(() => {
    if (tab === 'historico') {
      getCnpjHistory().then(setHistory);
    }
  }, [tab]);
  const [unlockedSet] = useState(() => new Set<string>());
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const currentPreviewRef = useRef<EmpresaPreview | null>(null);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskCnpj(e.target.value);
    setInputValue(masked);
    const digits = masked.replace(/\D/g, '');
    if (digits.length === 14) {
      doPreviewSearch(digits);
    } else if (digits.length === 0) {
      setView({ kind: 'empty' });
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const digits = inputValue.replace(/\D/g, '');
      if (digits.length === 14) doPreviewSearch(digits);
    }
  }, [inputValue]);

  function doPreviewSearch(digits: string) {
    setView({ kind: 'loading' });
    startTransition(async () => {
      const result = await searchCnpjPreview(digits);
      if (result.error || !result.data) {
        setView({ kind: 'not_found', cnpj: formatCnpj(digits) });
      } else {
        currentPreviewRef.current = result.data;
        setView({ kind: 'preview', empresa: result.data });
      }
    });
  }

  function handleSearch() {
    const digits = inputValue.replace(/\D/g, '');
    if (digits.length === 14) doPreviewSearch(digits);
  }

  function handleVerDetalhe() {
    const preview = currentPreviewRef.current;
    if (!preview) return;
    const cnpjRaw = preview.cnpj.replace(/\D/g, '');

    if (unlockedSet.has(cnpjRaw)) {
      // Already unlocked in this session – fetch full data without consuming credit
      setView({ kind: 'loading' });
      startTransition(async () => {
        const result = await getEmpresaDetail(cnpjRaw);
        if (result.error || !result.data) {
          setView({ kind: 'error', message: result.error ?? 'Erro ao carregar dados' });
        } else {
          setView({ kind: 'detail', empresa: result.data });
        }
        if (result.usage) setUsage(result.usage);
      });
      return;
    }

    setView({ kind: 'loading' });
    startTransition(async () => {
      const result = await getEmpresaDetail(cnpjRaw);
      if (result.error || !result.data) {
        // Revert to preview if limit hit
        if (preview) setView({ kind: 'preview', empresa: preview });
        else setView({ kind: 'error', message: result.error ?? 'Erro ao carregar dados' });
      } else {
        unlockedSet.add(cnpjRaw);
        setView({ kind: 'detail', empresa: result.data });
        // Refresh history
        getCnpjHistory().then(setHistory);
      }
      if (result.usage) setUsage(result.usage);
    });
  }

  function handleBackToPreview() {
    const preview = currentPreviewRef.current;
    if (preview) setView({ kind: 'preview', empresa: preview });
    else setView({ kind: 'empty' });
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function handleEnviarFunil() {
    const empresa = view.kind === 'detail' ? view.empresa : null;
    if (!empresa) return;
    startTransition(async () => {
      const res = await sendCnpjToFunil(empresa);
      if (res.success) {
        const nome = empresa.nome_fantasia || empresa.razao_social || 'Empresa';
        showToast(`${nome} adicionada aos Leads!`);
        setTimeout(() => router.push('/funil'), 800);
      } else if (res.alreadyExists) {
        showToast(res.error ?? 'Empresa já está no funil');
      } else {
        showToast(res.error ?? 'Erro ao enviar para o funil');
      }
    });
  }

  function handleHistorySelect(cnpj: string) {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return;
    setInputValue(formatCnpj(digits));
    setTab('search');
    doPreviewSearch(digits);
  }

  function handleRecarregar() {
    startTransition(async () => {
      const u = await getCnpjUsage();
      setUsage(u);
    });
  }

  const contractedUfLabel = ufSettings?.isNational
    ? 'Brasil'
    : ufSettings?.selectedUfs.length
      ? ufSettings.selectedUfs.join(', ')
      : null;
  const totalFmt = initialCount > 0
    ? contractedUfLabel
      ? `${initialCount.toLocaleString('pt-BR')} empresas (${contractedUfLabel})`
      : `${initialCount.toLocaleString('pt-BR')} empresas`
    : 'Base RainMaker';

  return (
    <div className="cnpj-page">
      {/* Top bar */}
      <div className="cnpj-topbar">
        <div className="cnpj-topbar-left">
          <div className="cnpj-icon-wrap">
            <BuildingIcon />
          </div>
          <div>
            <div className="cnpj-title">Consulta CNPJ</div>
            <div className="cnpj-subtitle">Busque empresas da Base RainMaker por CNPJ</div>
          </div>
        </div>
        <div className="cnpj-topbar-right">
          <CreditsBar usage={usage} />
          <div className="cnpj-input-wrap">
            <input
              ref={inputRef}
              className="cnpj-input"
              type="text"
              placeholder="00.000.000/0000-00"
              maxLength={18}
              value={inputValue}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
          </div>
          <button
            className="cnpj-btn-search"
            onClick={handleSearch}
            disabled={isPending}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}>
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            Buscar
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="cnpj-statusbar">
        <div className="cnpj-sync-info">
          <span className={`cnpj-sync-dot ${initialCount > 0 ? 'ok' : 'loading'}`} />
          <span className="cnpj-sync-msg">
            {initialCount > 0 ? `✓ Base RainMaker · ${totalFmt}` : 'Conectando à Base RainMaker...'}
          </span>
        </div>
        <button className="cnpj-recarregar-btn" onClick={handleRecarregar}>
          <svg viewBox="0 0 24 24" fill="currentColor" width={12} height={12}>
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
          Recarregar
        </button>
      </div>

      {ufSettings?.needsSelection && (
        <div className="cnpj-uf-banner">
          <OrganizationUfSelector
            settings={ufSettings}
            compact
            onSaved={() => router.refresh()}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="cnpj-tabs">
        <button
          className={`cnpj-tab-btn${tab === 'search' ? ' active' : ''}`}
          onClick={() => setTab('search')}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width={13} height={13}>
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          Busca
        </button>
        <button
          className={`cnpj-tab-btn${tab === 'historico' ? ' active' : ''}`}
          onClick={() => setTab('historico')}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width={13} height={13}>
            <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
          </svg>
          Histórico
          {history.length > 0 && <span className="cnpj-tab-count">{history.length}</span>}
        </button>
      </div>

      {/* Body */}
      <div className="cnpj-body">
        {tab === 'historico' ? (
          <HistoryTab history={history} onSelect={handleHistorySelect} />
        ) : (
          <>
            {view.kind === 'empty' && (
              <div className="cnpj-empty">
                <BuildingIcon />
                <p>Digite o CNPJ completo para ver o resumo da empresa</p>
                <p style={{ fontSize: 11, marginTop: 4, opacity: .6 }}>
                  A busca acontece automaticamente ao completar os 14 dígitos
                </p>
              </div>
            )}

            {view.kind === 'loading' && (
              <div className="cnpj-loading">
                <svg viewBox="0 0 24 24" fill="currentColor" width={28} height={28} style={{ opacity: .25 }}>
                  <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                </svg>
                Buscando...
              </div>
            )}

            {view.kind === 'not_found' && (
              <div className="cnpj-not-found">
                <svg viewBox="0 0 24 24" fill="currentColor" width={36} height={36} style={{ opacity: .3 }}>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <p>CNPJ não encontrado na base</p>
                <span>{view.cnpj}</span>
              </div>
            )}

            {view.kind === 'error' && (
              <div className="cnpj-not-found">
                <svg viewBox="0 0 24 24" fill="currentColor" width={36} height={36} style={{ opacity: .3, color: 'var(--red)' }}>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <p style={{ color: 'var(--red)' }}>{view.message}</p>
              </div>
            )}

            {view.kind === 'preview' && (
              <PreviewCard
                empresa={view.empresa}
                onVerDetalhe={handleVerDetalhe}
                usage={usage}
                isPending={isPending}
                ufAccess={ufAccess}
              />
            )}

            {view.kind === 'detail' && (
              <DetailCard
                empresa={view.empresa}
                onBack={handleBackToPreview}
                onEnviarFunil={handleEnviarFunil}
                isPending={isPending}
              />
            )}
          </>
        )}
      </div>

      {toast && <div className="cnpj-toast">{toast}</div>}
    </div>
  );
}
