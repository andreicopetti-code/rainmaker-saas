'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { TIERS } from '@ceo-brain/shared';
import {
  createAppointment,
  updateAppointment,
  toggleAppointmentDone,
  deleteAppointment,
  getOpportunityAppointments,
} from '@/app/funil/appointmentActions';
import type {
  Appointment,
  AppointmentInput,
  AppointmentTipo,
  OrgMember,
  OpportunityFormData,
  OpportunityItem,
  StageOption,
} from './types';
import { isOrgAdmin } from '@/lib/org/deal-access';
import { memberDisplayName } from '@/lib/org/member-display';
import { AppointmentTipoIcon } from './AppointmentTipoIcon';
import {
  APPOINTMENT_TIPOS as APPT_TIPOS,
  LEAD_SOURCES as LEAD_SRC,
  SETORES as SETORES_LIST,
  REGIMES_TRIBUTARIOS as REGIMES_LIST,
  PORTES_EMPRESA as PORTES_LIST,
} from './types';

import { getApptDisplay, apptTipoStyle } from '@/lib/appointments/display';
import {
  buildScheduledAt,
  formatApptCardDate,
  scheduledAtToDate,
  scheduledAtToTime,
  todayInAppTz,
} from '@/lib/appointments/datetime';
import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { isLostStage } from '@/lib/ceo/stage-utils';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function fmtDate(iso: string) {
  return formatApptCardDate(iso);
}

/* ─── sub-components ──────────────────────────────────────────────────────── */
type ApptFormState = { open: boolean; editing: Appointment | null };

function AppointmentForm({
  onSave,
  onCancel,
  initial,
}: {
  onSave: (d: AppointmentInput) => Promise<void>;
  onCancel: () => void;
  initial?: Appointment | null;
}) {
  const [tipo, setTipo] = useState<AppointmentTipo>(initial?.tipo ?? 'ligacao');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(
    initial ? scheduledAtToDate(initial.scheduled_at) : todayInAppTz(),
  );
  const [time, setTime] = useState(
    initial ? scheduledAtToTime(initial.scheduled_at) : '09:00',
  );
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  async function handleSubmit() {
    const root = rootRef.current;
    if (root) {
      const fields = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
      for (const field of fields) {
        if (!field.checkValidity()) {
          field.reportValidity();
          return;
        }
      }
    }
    setSaving(true);
    try {
      await onSave({ tipo, title, scheduled_at: buildScheduledAt(date, time), note });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={rootRef}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', marginTop: 8 }}
    >
      {/* Tipo */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {APPT_TIPOS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTipo(t.id)}
            className={`type-btn${tipo === t.id ? ' active' : ''}`}
            style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <AppointmentTipoIcon tipo={t.id} size={12} />
            {t.label}
          </button>
        ))}
      </div>
      {/* Título */}
      <div className="form-group">
        <label className="form-label">Título / Assunto</label>
        <input
          required
          className="form-input"
          placeholder="Ex: Ligar para confirmar proposta"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      {/* Data + Hora */}
      <div className="form-row cols2">
        <div className="form-group">
          <label className="form-label">Data</label>
          <input required type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Hora</label>
          <input required type="time" className="form-input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      {/* Nota */}
      <div className="form-group">
        <label className="form-label">Nota (opcional)</label>
        <textarea rows={2} className="form-input form-textarea" placeholder="Contexto…" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-ghost" style={{ padding: '6px 14px', fontSize: 12 }} onClick={onCancel}>Cancelar</button>
        <button type="button" className="btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} disabled={saving} onClick={() => void handleSubmit()}>
          {saving ? 'Salvando…' : initial ? 'Atualizar' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

/* ─── Main modal ──────────────────────────────────────────────────────────── */
type Props = {
  open: boolean;
  stageConfig: FunnelStageConfig[];
  stageOptions: StageOption[];
  initialStage: string;
  opportunity: OpportunityItem | null;
  members: OrgMember[];
  currentUserId: string;
  userRole: string;
  onClose: () => void;
  onSave: (data: OpportunityFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
};

const emptyForm = (stage: string, userId: string): OpportunityFormData => ({
  title: '',
  stage,
  value: '',
  description: '',
  contact_tipo_pessoa: 'pj',
  owner_id: userId,
  tags: [],
});

type RfbData = {
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  situacao_cadastral?: string | number;
  municipio?: string;
  uf?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  ddd_telefone_1?: string;
  email?: string;
  data_inicio_atividade?: string;
};

export function OpportunityModal({
  open,
  stageConfig,
  stageOptions,
  initialStage,
  opportunity,
  members,
  currentUserId,
  userRole,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [form, setForm] = useState<OpportunityFormData>(emptyForm(initialStage, currentUserId));
  const isAdmin = isOrgAdmin(userRole);
  const selfMember =
    members.find((m) => m.user_id === currentUserId) ??
    ({ user_id: currentUserId, full_name: null } satisfies OrgMember);
  const ownerOptions = useMemo(() => {
    const byId = new Map(members.map((m) => [m.user_id, m]));
    const ownerId = form.owner_id ?? currentUserId;
    if (ownerId && !byId.has(ownerId)) {
      byId.set(ownerId, { user_id: ownerId, full_name: null });
    }
    return [...byId.values()];
  }, [members, form.owner_id, currentUserId]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tagInput, setTagInput] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptForm, setApptForm] = useState<ApptFormState>({ open: false, editing: null });
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [rfbLoading, setRfbLoading] = useState(false);
  const [rfbResult, setRfbResult] = useState<RfbData | null>(null);
  const [rfbError, setRfbError] = useState<string | null>(null);

  const stageLabel = stageOptions.find((s) => s.id === form.stage)?.label ?? form.stage;
  const isWon = stageLabel.toLowerCase().includes('ganho');
  const isLost = isLostStage(form.stage, stageConfig);

  // reset RFB state when modal closes/opens
  useEffect(() => {
    if (!open) { setRfbResult(null); setRfbError(null); }
  }, [open]);

  // populate form when editing
  useEffect(() => {
    if (!open) return;
    const cf = opportunity?.custom_fields;
    const contact = opportunity?.contact;
    if (opportunity) {
      const resolvedStage =
        stageOptions.find((s) => s.id === opportunity.stage || s.label === opportunity.stage)?.id
        ?? opportunity.stage;
      setForm({
        title: opportunity.title,
        stage: resolvedStage,
        value: opportunity.value != null ? String(opportunity.value) : '',
        description: opportunity.description ?? '',
        tier: cf?.tier,
        value_deferred: !!cf?.value_deferred,
        probability: opportunity.probability ?? undefined,
        expected_close_date: opportunity.expected_close_date ?? '',
        lost_reason: opportunity.lost_reason ?? '',
        lead_source: cf?.lead_source ?? '',
        owner_id: opportunity.owner_id,
        tags: opportunity.tags ?? [],
        contact_id: contact?.id,
        contact_name: contact?.name ?? '',
        contact_company: contact?.company ?? '',
        contact_cnpj: contact?.cnpj ?? '',
        contact_email: contact?.email ?? '',
        contact_phone: contact?.phone ?? '',
        contact_person_name: contact?.custom_fields?.contact_person ?? '',
        contact_position: contact?.position ?? '',
        contact_tipo_pessoa: contact?.custom_fields?.tipo_pessoa ?? 'pj',
        contact_situacao: contact?.custom_fields?.situacao ?? '',
        contact_endereco: contact?.custom_fields?.endereco ?? '',
        contact_municipio: contact?.custom_fields?.municipio ?? '',
        contact_uf: contact?.custom_fields?.uf ?? '',
        contact_cep: contact?.custom_fields?.cep ?? '',
        contact_setor: contact?.custom_fields?.setor ?? '',
        contact_regime_tributario: contact?.custom_fields?.regime_tributario ?? '',
        contact_porte: contact?.custom_fields?.porte ?? '',
      });
    } else {
      setForm(emptyForm(initialStage, currentUserId));
    }
    setError(null);
    setTagInput('');
    setApptForm({ open: false, editing: null });
  }, [open, opportunity, initialStage, currentUserId, stageOptions]);

  // load appointments when editing existing deal
  useEffect(() => {
    if (!open || !opportunity) { setAppointments([]); return; }
    setLoadingAppts(true);
    getOpportunityAppointments(opportunity.id)
      .then(setAppointments)
      .catch(() => setAppointments([]))
      .finally(() => setLoadingAppts(false));
  }, [open, opportunity]);

  if (!open) return null;

  function set(patch: Partial<OpportunityFormData>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    if (!(form.tags ?? []).includes(tag)) {
      set({ tags: [...(form.tags ?? []), tag] });
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    set({ tags: (form.tags ?? []).filter((t) => t !== tag) });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isLost && !form.lost_reason?.trim()) {
      setError('Informe o motivo da perda antes de salvar.');
      return;
    }
    if (isWon) {
      const parsed = form.value ? parseFloat(form.value.replace(',', '.')) : NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Informe o valor contratado ao marcar o negócio como ganho.');
        return;
      }
    }
    startTransition(async () => {
      try {
        await onSave(form);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar');
      }
    });
  }

  function handleDelete() {
    if (!onDelete || !confirm('Mover este deal para a lixeira?')) return;
    startTransition(async () => {
      try { await onDelete(); onClose(); }
      catch (err) { setError(err instanceof Error ? err.message : 'Erro ao excluir'); }
    });
  }

  async function handleSaveAppt(data: AppointmentInput) {
    if (!opportunity) return;
    if (apptForm.editing) {
      await updateAppointment(apptForm.editing.id, data);
    } else {
      await createAppointment(opportunity.id, data);
    }
    const updated = await getOpportunityAppointments(opportunity.id);
    setAppointments(updated);
    setApptForm({ open: false, editing: null });
  }

  async function handleToggleAppt(appt: Appointment) {
    await toggleAppointmentDone(appt.id, !appt.done);
    setAppointments((prev) => prev.map((a) => a.id === appt.id ? { ...a, done: !a.done } : a));
  }

  async function handleDeleteAppt(id: string) {
    if (!confirm('Apagar este compromisso?')) return;
    await deleteAppointment(id);
    setAppointments((prev) => prev.filter((a) => a.id !== id));
  }

  async function lookupCNPJ() {
    const raw = (form.contact_cnpj ?? '').replace(/\D/g, '');
    if (raw.length !== 14) {
      setRfbError('Digite um CNPJ com 14 dígitos antes de buscar.');
      setRfbResult(null);
      return;
    }
    setRfbLoading(true);
    setRfbError(null);
    setRfbResult(null);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${raw}`);
      if (!res.ok) throw new Error(
        res.status === 404
          ? 'CNPJ não encontrado na base da Receita Federal.'
          : `Erro ${res.status} ao consultar a Receita Federal.`
      );
      const d: RfbData = await res.json();

      const situacaoMap: Record<string, string> = {
        '01': 'Nula', '02': 'Ativa', '03': 'Suspensa', '04': 'Inapta', '08': 'Baixada',
      };
      const situacao = d.descricao_situacao_cadastral ||
        situacaoMap[String(d.situacao_cadastral ?? '').trim()] || '';

      const endereco = [d.logradouro, d.numero ? `Nº ${d.numero}` : '', d.complemento, d.bairro]
        .map((s) => (s ?? '').trim()).filter(Boolean).join(', ');

      set({
        contact_name:           d.razao_social     || form.contact_name,
        contact_company:        d.nome_fantasia     || form.contact_company,
        contact_situacao:       situacao            || form.contact_situacao,
        contact_municipio:      d.municipio         || form.contact_municipio,
        contact_uf:             d.uf                || form.contact_uf,
        contact_cep:            d.cep?.replace(/\D/g, '') || form.contact_cep,
        contact_endereco:       endereco            || form.contact_endereco,
        contact_email:          d.email?.toLowerCase() || form.contact_email,
        contact_phone:          d.ddd_telefone_1?.replace(/\D/g, '') || form.contact_phone,
        // preenche título do deal com a razão social se ainda vazio
        title: form.title || d.razao_social || '',
      });
      setRfbResult(d);
    } catch (e) {
      setRfbError(e instanceof Error ? e.message : 'Não foi possível consultar a Receita Federal.');
    } finally {
      setRfbLoading(false);
    }
  }

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <span className="modal-title">{opportunity ? 'Editar Deal' : 'Novo Deal'}</span>
          <button type="button" className="btn-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #FCA5A5', fontSize: 13 }}>
                {error}
              </div>
            )}

            {/* ── Tipo PJ / PF ── */}
            <div className="type-toggle">
              <button type="button" className={`type-btn${form.contact_tipo_pessoa === 'pj' ? ' active' : ''}`} onClick={() => set({ contact_tipo_pessoa: 'pj' })}>Pessoa Jurídica</button>
              <button type="button" className={`type-btn${form.contact_tipo_pessoa === 'pf' ? ' active' : ''}`} onClick={() => set({ contact_tipo_pessoa: 'pf' })}>Pessoa Física</button>
            </div>

            {/* ── CNPJ / CPF ── */}
            <div className="form-group">
              <label className="form-label">{form.contact_tipo_pessoa === 'pj' ? 'CNPJ' : 'CPF'}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  style={{ flex: 1 }}
                  placeholder={form.contact_tipo_pessoa === 'pj' ? '00.000.000/0001-00' : '000.000.000-00'}
                  value={form.contact_cnpj ?? ''}
                  onChange={(e) => { set({ contact_cnpj: e.target.value }); setRfbResult(null); setRfbError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (form.contact_tipo_pessoa === 'pj') lookupCNPJ(); } }}
                />
                {form.contact_tipo_pessoa === 'pj' && (
                  <button
                    type="button"
                    className={`btn-cnpj-lookup${rfbLoading ? ' loading' : ''}`}
                    onClick={lookupCNPJ}
                    disabled={rfbLoading}
                    title="Buscar dados na Receita Federal (BrasilAPI)"
                  >
                    {rfbLoading ? (
                      <svg viewBox="0 0 24 24" width="14" height="14" style={{ animation: 'spin 1s linear infinite' }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 60" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                    )}
                    {rfbLoading ? 'Buscando…' : 'Buscar RFB'}
                  </button>
                )}
              </div>
              {/* Banner de sucesso RFB */}
              {rfbResult && (
                <div className="rfb-banner visible" style={{ marginTop: 8 }}>
                  <div className="rfb-banner-title">✓ Dados importados da Receita Federal</div>
                  <p>
                    {rfbResult.razao_social && <><b>Razão social:</b> {rfbResult.razao_social}<br /></>}
                    {rfbResult.nome_fantasia && <><b>Fantasia:</b> {rfbResult.nome_fantasia}<br /></>}
                    {rfbResult.descricao_situacao_cadastral && <><b>Situação:</b> {rfbResult.descricao_situacao_cadastral}<br /></>}
                    {rfbResult.municipio && rfbResult.uf && <><b>Localização:</b> {rfbResult.municipio}/{rfbResult.uf}<br /></>}
                    {rfbResult.data_inicio_atividade && <><b>Abertura:</b> {rfbResult.data_inicio_atividade.split('-').reverse().join('/')}</>}
                  </p>
                </div>
              )}
              {/* Banner de erro RFB */}
              {rfbError && (
                <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid #FCA5A5', fontSize: 12, color: 'var(--red)' }}>
                  {rfbError}
                </div>
              )}
            </div>

            {/* ── Razão Social ── */}
            <div className="form-group">
              <label className="form-label">
                {form.contact_tipo_pessoa === 'pj' ? 'Razão Social *' : 'Nome Completo *'}
              </label>
              <input
                required
                className="form-input"
                placeholder={form.contact_tipo_pessoa === 'pj' ? 'Ex: TechSul Transportes Ltda' : 'Ex: João da Silva'}
                value={form.contact_name ?? ''}
                onChange={(e) => set({ contact_name: e.target.value, title: e.target.value })}
              />
            </div>

            {form.contact_tipo_pessoa === 'pj' && (
              <div className="form-row cols2">
                <div className="form-group">
                  <label className="form-label">Nome Fantasia</label>
                  <input className="form-input" placeholder="TechSul" value={form.contact_company ?? ''} onChange={(e) => set({ contact_company: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Situação Cadastral</label>
                  <input className="form-input" placeholder="ATIVA" value={form.contact_situacao ?? ''} onChange={(e) => set({ contact_situacao: e.target.value })} />
                </div>
              </div>
            )}

            {/* ── Contato ── */}
            <div className="form-row cols2">
              <div className="form-group">
                <label className="form-label">Nome do Contato</label>
                <input className="form-input" placeholder="Ex: João da Silva" value={form.contact_person_name ?? ''} onChange={(e) => set({ contact_person_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Cargo / Função</label>
                <input className="form-input" placeholder="Ex: Diretor Comercial" value={form.contact_position ?? ''} onChange={(e) => set({ contact_position: e.target.value })} />
              </div>
            </div>

            {/* ── Telefone + E-mail ── */}
            <div className="form-row cols2">
              <div className="form-group">
                <label className="form-label">Telefone</label>
                <input className="form-input" placeholder="(00) 00000-0000" value={form.contact_phone ?? ''} onChange={(e) => set({ contact_phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">E-mail</label>
                <input type="email" className="form-input" placeholder="contato@empresa.com" value={form.contact_email ?? ''} onChange={(e) => set({ contact_email: e.target.value })} />
              </div>
            </div>

            {/* ── Endereço ── */}
            <div className="form-group">
              <label className="form-label">Endereço</label>
              <input className="form-input" placeholder="Rua, número, bairro" value={form.contact_endereco ?? ''} onChange={(e) => set({ contact_endereco: e.target.value })} />
            </div>
            <div className="form-row cols2">
              <div className="form-group">
                <label className="form-label">Município</label>
                <input className="form-input" placeholder="Porto Alegre" value={form.contact_municipio ?? ''} onChange={(e) => set({ contact_municipio: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">UF</label>
                <input className="form-input" placeholder="RS" maxLength={2} value={form.contact_uf ?? ''} onChange={(e) => set({ contact_uf: e.target.value.toUpperCase() })} />
              </div>
            </div>

            {/* ── Setor + Regime ── */}
            <div className="form-row cols2">
              <div className="form-group">
                <label className="form-label">Setor / Segmento</label>
                <select className="form-input form-select" value={form.contact_setor ?? ''} onChange={(e) => set({ contact_setor: e.target.value })}>
                  <option value="">Selecione…</option>
                  {SETORES_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Regime Tributário</label>
                <select className="form-input form-select" value={form.contact_regime_tributario ?? ''} onChange={(e) => set({ contact_regime_tributario: e.target.value })}>
                  <option value="">Selecione…</option>
                  {REGIMES_LIST.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {/* ── Porte ── */}
            <div className="form-group">
              <label className="form-label">Porte da Empresa</label>
              <select className="form-input form-select" value={form.contact_porte ?? ''} onChange={(e) => set({ contact_porte: e.target.value })}>
                <option value="">Selecione…</option>
                {PORTES_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* ── Divisor: dados do deal ── */}
            <div className="form-section" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>
                Dados do Negócio
              </div>

              {/* Valor do negócio */}
              <div className="form-group">
                <label className="form-label">
                  {isWon ? (
                    <>Valor Contratado (R$) <span style={{ color: 'var(--green)', fontSize: 11 }}>✓ Negócio ganho</span></>
                  ) : (
                    'Valor do Negócio (R$)'
                  )}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="form-input"
                  placeholder={form.value_deferred && !isWon ? 'Definido no fechamento' : 'Ex: 150000'}
                  value={form.value_deferred && !isWon ? '' : form.value}
                  disabled={!!form.value_deferred && !isWon}
                  onChange={(e) => set({ value: e.target.value, value_deferred: false })}
                />
                {!isWon ? (
                  <label
                    className="form-check"
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      marginTop: 10,
                      cursor: 'pointer',
                      fontSize: 13,
                      color: 'var(--text2)',
                      lineHeight: 1.4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!form.value_deferred}
                      onChange={(e) =>
                        set({
                          value_deferred: e.target.checked,
                          value: e.target.checked ? '' : form.value,
                        })
                      }
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      Valor será conhecido apenas no fechamento
                      <span className="form-hint" style={{ display: 'block', marginTop: 2 }}>
                        Use em negócios por êxito, recuperação de créditos ou quando o preço só existe após a entrega.
                        A IA não tratará isso como cadastro incompleto.
                      </span>
                    </span>
                  </label>
                ) : null}
              </div>

              {/* Classificação (porte / prioridade) */}
              <div className="form-group">
                <label className="form-label">Classificação</label>
                <div className="tier-selector">
                  {TIERS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`tier-opt tier-${t.id}${form.tier === t.id ? ' selected' : ''}`}
                      onClick={() => set({ tier: t.id as OpportunityFormData['tier'] })}
                    >
                      <span className="tier-opt-label">{t.label}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`tier-opt tier-none${!form.tier ? ' selected' : ''}`}
                    onClick={() => set({ tier: undefined })}
                  >
                    <span className="tier-opt-label">—</span>
                  </button>
                </div>
                <p className="form-hint">
                  Indica porte ou prioridade do negócio. Não substitui o valor em R$ para métricas financeiras.
                </p>
              </div>

              {/* Motivo perda (só Perdido) */}
              {isLost && (
                <div className="form-group">
                  <label className="form-label">Motivo da Perda *</label>
                  <input className="form-input" placeholder="Ex: Preço, prazo, concorrente…" value={form.lost_reason ?? ''} onChange={(e) => set({ lost_reason: e.target.value })} required />
                </div>
              )}

              {/* Etapa + Probabilidade */}
              <div className="form-row cols2">
                <div className="form-group">
                  <label className="form-label">Coluna no Funil</label>
                  <select className="form-input form-select" value={form.stage} onChange={(e) => set({ stage: e.target.value })}>
                    {stageOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Probabilidade (%)</label>
                  <input type="number" min={0} max={100} className="form-input" placeholder="0–100" value={form.probability ?? ''} onChange={(e) => set({ probability: e.target.value ? Number(e.target.value) : undefined })} />
                </div>
              </div>

              {/* Previsão de fechamento + Origem */}
              <div className="form-row cols2">
                <div className="form-group">
                  <label className="form-label">Previsão de Fechamento</label>
                  <input type="date" className="form-input" value={form.expected_close_date ?? ''} onChange={(e) => set({ expected_close_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Origem do Lead</label>
                  <select className="form-input form-select" value={form.lead_source ?? ''} onChange={(e) => set({ lead_source: e.target.value })}>
                    <option value="">Selecione…</option>
                    {LEAD_SRC.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Responsável */}
              <div className="form-group">
                <label className="form-label">Responsável pelo Deal</label>
                {isAdmin ? (
                  <select
                    className="form-input form-select"
                    value={form.owner_id ?? currentUserId}
                    onChange={(e) => set({ owner_id: e.target.value })}
                  >
                    {ownerOptions.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {memberDisplayName(m)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <div className="form-input form-select" style={{ cursor: 'default', opacity: 0.92 }}>
                      {memberDisplayName(selfMember)}
                    </div>
                    <p className="form-hint">
                      Negócios que você cadastra ficam automaticamente sob sua responsabilidade.
                    </p>
                  </>
                )}
              </div>

              {/* Tags */}
              <div className="form-group">
                <label className="form-label">Tags</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="form-input"
                    style={{ flex: 1 }}
                    placeholder="Nova tag (Enter para adicionar)…"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  />
                  <button type="button" className="btn-ghost" style={{ padding: '8px 12px', fontSize: 12 }} onClick={addTag}>+ Tag</button>
                </div>
                {(form.tags ?? []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                    {(form.tags ?? []).map((tag) => (
                      <span key={tag} style={{ background: 'var(--blue-bg)', color: 'var(--blue-dark)', border: '1px solid #B6D4F5', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue-dark)', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Observação */}
              <div className="form-group">
                <label className="form-label">Observação</label>
                <textarea rows={3} className="form-input form-textarea" placeholder="Anotações sobre o negócio…" value={form.description} onChange={(e) => set({ description: e.target.value })} />
              </div>
            </div>

            {/* ── Compromissos ── */}
            {opportunity && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text3)' }}>
                    Compromissos Agendados
                  </span>
                  {!apptForm.open && (
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ padding: '4px 10px', fontSize: 11 }}
                      onClick={() => setApptForm({ open: true, editing: null })}
                    >
                      + Compromisso
                    </button>
                  )}
                </div>

                {apptForm.open && (
                  <AppointmentForm
                    initial={apptForm.editing}
                    onSave={handleSaveAppt}
                    onCancel={() => setApptForm({ open: false, editing: null })}
                  />
                )}

                {loadingAppts ? (
                  <div style={{ fontSize: 12, color: 'var(--text3)', padding: 8 }}>Carregando…</div>
                ) : appointments.length === 0 && !apptForm.open ? (
                  <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>Nenhum compromisso agendado.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {appointments.map((appt) => {
                      const display = getApptDisplay(appt.tipo, appt.scheduled_at, appt.done);
                      return (
                        <div
                          key={appt.id}
                          className={`${display.statusClass} appt-chip--with-bar`}
                          style={{
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            padding: '10px 12px',
                            borderRadius: 10,
                            ...apptTipoStyle(display.tipoAccent),
                          }}
                        >
                          <span
                            className="appt-tipo-bar"
                            style={{ background: display.tipoAccent }}
                            aria-hidden="true"
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                            <AppointmentTipoIcon tipo={appt.tipo} badge size={10} />
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{appt.title}</span>
                          </div>
                          <div style={{ fontSize: 11, marginTop: 2, opacity: .8 }}>{fmtDate(appt.scheduled_at)}</div>
                          {appt.note && <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text2)', fontStyle: 'italic' }}>{appt.note}</div>}
                          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <button type="button" onClick={() => setApptForm({ open: true, editing: appt })} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border2)', background: 'transparent', cursor: 'pointer', color: 'var(--text2)' }}>✎ Editar</button>
                            <button type="button" onClick={() => handleToggleAppt(appt)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: `1px solid ${appt.done ? 'var(--border2)' : 'var(--green)'}`, background: 'transparent', cursor: 'pointer', color: appt.done ? 'var(--text3)' : 'var(--green)' }}>
                              {appt.done ? '↩ Reabrir' : '✓ Cumprido'}
                            </button>
                            <button type="button" onClick={() => handleDeleteAppt(appt.id)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #FCA5A5', background: 'transparent', cursor: 'pointer', color: 'var(--red)' }}>✕ Apagar</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Botão de compromisso para novo deal */}
            {!opportunity && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, fontSize: 12, color: 'var(--text3)' }}>
                Salve o deal primeiro para adicionar compromissos.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="modal-footer">
            {opportunity && onDelete ? (
              <button type="button" className="btn-danger" onClick={handleDelete} disabled={pending}>Excluir</button>
            ) : <span />}
            <div className="modal-footer-right">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
