'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveOrgRevenueGoals } from '@/app/dashboard/actions';
import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import { formatBRL } from '@/lib/funnel/stages';
import {
  computeRevenueGoalsFromOpps,
  type GoalPeriodProgress,
  type OrgRevenueGoals,
  type WonOppLike,
} from '@/lib/goals/revenue-goals';

type Props = {
  goals: OrgRevenueGoals;
  opps: WonOppLike[];
  stageConfig: FunnelStageConfig[];
  canEdit: boolean;
};

function goalInputValue(n: number | null): string {
  if (n == null) return '';
  return String(n);
}

function ProgressRow({
  title,
  periodHint,
  row,
}: {
  title: string;
  periodHint: string;
  row: GoalPeriodProgress;
}) {
  if (!row.hasGoal || row.goal == null) {
    return (
      <div className="dash-metas-row dash-metas-row--empty">
        <div className="dash-metas-row-head">
          <span className="dash-metas-period">{title}</span>
          <span className="dash-metas-hint">{periodHint}</span>
        </div>
        <p className="dash-metas-cta-text">
          Realizado: <strong>{formatBRL(row.achieved)}</strong>
          <span> · Meta não definida</span>
        </p>
      </div>
    );
  }

  const pct = row.pct ?? 0;
  const barPct = Math.min(100, Math.max(0, pct));
  const over = pct > 100;
  const gap = row.gap ?? 0;
  const gapLabel =
    gap > 0
      ? `Faltam ${formatBRL(gap)}`
      : gap < 0
        ? `Acima em ${formatBRL(Math.abs(gap))}`
        : 'Meta batida';

  return (
    <div className={`dash-metas-row${over ? ' dash-metas-row--over' : ''}`}>
      <div className="dash-metas-row-head">
        <span className="dash-metas-period">{title}</span>
        <span className="dash-metas-pct">{pct.toLocaleString('pt-BR')}%</span>
      </div>
      <div className="dash-metas-numbers">
        <strong>{formatBRL(row.achieved)}</strong>
        <span>de {formatBRL(row.goal)}</span>
      </div>
      <div className="dash-metas-track" aria-hidden="true">
        <div
          className="dash-metas-fill"
          style={{ width: `${Math.max(over ? 100 : 4, barPct)}%` }}
        />
      </div>
      <div className="dash-metas-gap">{gapLabel}</div>
    </div>
  );
}

export function MetasCard({ goals, opps, stageConfig, canEdit }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [monthlyDraft, setMonthlyDraft] = useState(goalInputValue(goals.monthly));
  const [annualDraft, setAnnualDraft] = useState(goalInputValue(goals.annual));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const progress = useMemo(
    () => computeRevenueGoalsFromOpps(goals, opps, stageConfig),
    [goals, opps, stageConfig],
  );

  const anyGoal = progress.monthly.hasGoal || progress.annual.hasGoal;

  const openEdit = () => {
    setMonthlyDraft(goalInputValue(goals.monthly));
    setAnnualDraft(goalInputValue(goals.annual));
    setError(null);
    setEditing(true);
  };

  const closeEdit = () => {
    if (pending) return;
    setEditing(false);
    setError(null);
  };

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveOrgRevenueGoals({
        monthly: monthlyDraft,
        annual: annualDraft,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <div className="dash-card dash-metas-card">
      <div className="dash-card-head">
        <h3>Metas</h3>
        <div className="dash-metas-actions">
          <span className="dash-card-hint">Receita fechada (ganhos)</span>
          {canEdit ? (
            <button type="button" className="dash-metas-edit-btn" onClick={openEdit}>
              {anyGoal ? 'Editar meta' : 'Definir meta'}
            </button>
          ) : null}
        </div>
      </div>

      {!anyGoal ? (
        <div className="dash-metas-empty">
          <p>
            Defina a meta mensal e anual para acompanhar o progresso da receita fechada
            (negócios ganhos no período).
          </p>
          <p className="dash-metas-realized">
            Realizado este mês: <strong>{formatBRL(progress.monthly.achieved)}</strong>
            {' · '}
            no ano: <strong>{formatBRL(progress.annual.achieved)}</strong>
          </p>
          {canEdit ? (
            <button type="button" className="dash-btn dash-btn-primary" onClick={openEdit}>
              Definir meta
            </button>
          ) : (
            <p className="dash-metas-hint-admin">Peça a um admin para definir as metas.</p>
          )}
        </div>
      ) : (
        <div className="dash-metas-grid">
          <ProgressRow
            title="Mensal"
            periodHint="Mês calendário"
            row={progress.monthly}
          />
          <ProgressRow
            title="Anual"
            periodHint="Ano calendário"
            row={progress.annual}
          />
        </div>
      )}

      {editing ? (
        <div
          className="dash-metas-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dash-metas-edit-title"
          onClick={closeEdit}
        >
          <div className="dash-metas-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dash-metas-modal-head">
              <h4 id="dash-metas-edit-title">Editar metas</h4>
              <button type="button" className="dash-btn dash-btn-ghost" onClick={closeEdit} disabled={pending}>
                Fechar
              </button>
            </div>
            <p className="dash-metas-modal-hint">
              Valores em R$. Deixe em branco para remover a meta. Progresso = negócios em Ganho
              com data de atualização no período (horário de Brasília).
            </p>
            <label className="dash-metas-field">
              <span>Meta mensal</span>
              <input
                type="text"
                inputMode="decimal"
                className="form-input"
                placeholder="Ex: 150000"
                value={monthlyDraft}
                onChange={(e) => setMonthlyDraft(e.target.value)}
                disabled={pending}
              />
            </label>
            <label className="dash-metas-field">
              <span>Meta anual</span>
              <input
                type="text"
                inputMode="decimal"
                className="form-input"
                placeholder="Ex: 1800000"
                value={annualDraft}
                onChange={(e) => setAnnualDraft(e.target.value)}
                disabled={pending}
              />
            </label>
            {error ? <p className="dash-metas-error">{error}</p> : null}
            <div className="dash-metas-modal-foot">
              <button type="button" className="dash-btn dash-btn-ghost" onClick={closeEdit} disabled={pending}>
                Cancelar
              </button>
              <button type="button" className="dash-btn dash-btn-primary" onClick={onSave} disabled={pending}>
                {pending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
