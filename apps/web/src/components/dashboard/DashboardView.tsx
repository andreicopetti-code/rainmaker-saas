'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DashboardData } from '@/app/dashboard/actions';
import { formatBRL } from '@/lib/funnel/stages';
import {
  computeExtendedDashboardMetrics,
  filterOppsByPeriod,
  type DashPeriod,
  type ExtendedDashboardMetrics,
  type VolumeWindow,
} from '@/lib/dashboard/extended-metrics';

type Props = { data: DashboardData };
type ViewMode = 'summary' | 'full';

const VIEW_MODE_KEY = 'ceo-dashboard-view';
const PERIODS: { id: DashPeriod; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: '180', label: '180d' },
  { id: '90', label: '90d' },
  { id: '30', label: '30d' },
  { id: '7', label: '7d' },
];

const VOLUME_WINDOWS: { id: VolumeWindow; label: string }[] = [
  { id: 30, label: '30d' },
  { id: 90, label: '90d' },
  { id: 180, label: '180d' },
];

const SECTIONS = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'velocidade', label: 'Velocidade' },
  { id: 'receita', label: 'Receita' },
  { id: 'risco', label: 'Saúde & risco' },
  { id: 'segmentacao', label: 'Segmentação' },
  { id: 'equipe', label: 'Equipe' },
  { id: 'alertas', label: 'Alertas & ações' },
] as const;

function fmtCompact(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (value >= 1_000) return `R$ ${Math.round(value / 1_000)}k`;
  return formatBRL(value);
}

function deltaLabel(n: number, suffix = ''): string {
  if (n === 0) return '—';
  return `${n > 0 ? '+' : ''}${n}${suffix}`;
}

function readViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'summary';
  return localStorage.getItem(VIEW_MODE_KEY) === 'full' ? 'full' : 'summary';
}

function HealthRing({ score, color, label }: { score: number; color: string; label: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="dash-health-ring">
      <svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="dash-health-ring-text">
        <strong style={{ color }}>{score}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
  trend,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
  trend?: 'good' | 'warn' | 'bad';
}) {
  return (
    <div className="dash-kpi" style={{ borderLeftColor: accent }}>
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value" style={{ color: accent }}>{value}</div>
      <div className="dash-kpi-sub">{sub}</div>
      {trend ? <span className={`dash-kpi-trend dash-kpi-trend--${trend}`} /> : null}
    </div>
  );
}

function SectionHead({ id, title, hint }: { id: string; title: string; hint?: string }) {
  return (
    <div className="dash-section-head" id={id}>
      <h2>{title}</h2>
      {hint ? <p>{hint}</p> : null}
    </div>
  );
}

function DashboardSummary({
  m,
  openDeal,
  goAgenda,
  onShowFull,
}: {
  m: ExtendedDashboardMetrics;
  openDeal: (id: string) => void;
  goAgenda: () => void;
  onShowFull: () => void;
}) {
  const maxStageCount = Math.max(...m.stages.map((s) => s.count), 1);
  const decisivos = m.kpis.wonCount + m.kpis.lostCount;
  const wrTrend = m.kpis.winRate >= 30 ? 'good' : m.kpis.winRate >= 15 ? 'warn' : decisivos > 0 ? 'bad' : undefined;
  const stalledTrend = m.kpis.stalledCount === 0 ? 'good' : m.kpis.stalledCount <= 3 ? 'warn' : 'bad';
  const criticalFlags = m.redFlags.filter((f) => f.severity === 'critical').slice(0, 4);
  const urgentPending = m.pendingActions.filter((a) => a.isLate).slice(0, 5);

  return (
    <>
      <section className="dash-hero">
        <HealthRing score={m.health.score} color={m.health.color} label={m.health.label} />
        <div className="dash-hero-content">
          <h2>Saúde da carteira: {m.health.label}</h2>
          <p>
            {m.kpis.activeCount} negócios ativos
            {m.kpis.stalledCount > 0 ? ` · ${m.kpis.stalledCount} parado${m.kpis.stalledCount !== 1 ? 's' : ''}` : ''}
            {m.kpis.overdueAppointments > 0
              ? ` · ${m.kpis.overdueAppointments} compromisso${m.kpis.overdueAppointments !== 1 ? 's' : ''} atrasado${m.kpis.overdueAppointments !== 1 ? 's' : ''}`
              : ''}
          </p>
          <div className="dash-hero-chips">
            <span className="dash-chip dash-chip-green">Fechar: {m.classif.fechar.length}</span>
            <span className="dash-chip dash-chip-amber">Risco: {m.classif.risco.length}</span>
            <span className="dash-chip dash-chip-muted">Cultivar: {m.classif.cultivar.length}</span>
            {m.classif.descartar.length > 0 ? (
              <span className="dash-chip dash-chip-red">Descartar: {m.classif.descartar.length}</span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="dash-kpi-grid dash-kpi-grid--4">
        <KpiCard
          label="Pipeline aberto"
          value={fmtCompact(m.kpis.pipelineValue)}
          sub={`${m.kpis.activeCount} negócios ativos`}
          accent="#2563EB"
        />
        <KpiCard
          label="Forecast ponderado"
          value={`~${fmtCompact(m.forecast.realistic)}`}
          sub="Valor × probabilidade"
          accent="#7C3AED"
        />
        <KpiCard
          label="Win rate"
          value={decisivos > 0 ? `${m.kpis.winRate.toFixed(1)}%` : '—'}
          sub={`${m.kpis.wonCount} ganhos / ${decisivos} decisivos`}
          accent={m.kpis.winRate >= 30 ? '#16A34A' : m.kpis.winRate >= 15 ? '#D97706' : '#DC2626'}
          trend={wrTrend}
        />
        <KpiCard
          label="Deals parados"
          value={String(m.kpis.stalledCount)}
          sub="14+ dias sem atividade"
          accent={m.kpis.stalledCount === 0 ? '#16A34A' : m.kpis.stalledCount <= 3 ? '#D97706' : '#DC2626'}
          trend={stalledTrend}
        />
      </section>

      <section className="dash-split">
        <div className="dash-card dash-card-accent">
          <div className="dash-card-head">
            <h3>Ações prioritárias</h3>
            <span className="dash-card-hint">Clique para abrir no funil</span>
          </div>
          {m.priorityActions.length === 0 ? (
            <p className="dash-empty-inline">Nenhuma ação urgente identificada.</p>
          ) : (
            <ul className="dash-action-list">
              {m.priorityActions.map((a, i) => (
                <li key={`${a.kind}-${i}`}>
                  <button
                    type="button"
                    className={`dash-action-item dash-action-item--${a.urgency}`}
                    onClick={() => (a.kind === 'overdue' ? goAgenda() : openDeal(a.opportunityId))}
                  >
                    <span className="dash-action-kind">
                      {a.kind === 'close' ? '🔥' : a.kind === 'risk' ? '⚠️' : a.kind === 'overdue' ? '📅' : '⏸️'}
                    </span>
                    <span className="dash-action-text">
                      <strong>{a.name}</strong>
                      <small>{a.subtitle}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dash-card">
          <h3>Funil por etapa</h3>
          <div className="dash-funnel-bars">
            {m.stages
              .filter((s) => s.count > 0 || !/perd|ganho/i.test(s.label))
              .slice(0, 8)
              .map((s) => (
                <div key={s.id} className="dash-funnel-row">
                  <span className="dash-funnel-label" title={s.label}>{s.label}</span>
                  <div className="dash-funnel-track">
                    <div
                      className="dash-funnel-fill"
                      style={{
                        width: `${Math.max(4, Math.round((s.count / maxStageCount) * 100))}%`,
                        background: s.color,
                      }}
                    />
                  </div>
                  <span className="dash-funnel-count">{s.count}</span>
                </div>
              ))}
          </div>
        </div>
      </section>

      {(criticalFlags.length > 0 || urgentPending.length > 0) && (
        <section className="dash-split">
          {criticalFlags.length > 0 ? (
            <div className="dash-card">
              <h3>Alertas críticos</h3>
              <ul className="dash-flag-list">
                {criticalFlags.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="dash-flag dash-flag--critical"
                      onClick={() => f.opportunityId && openDeal(f.opportunityId)}
                      disabled={!f.opportunityId}
                    >
                      <strong>{f.title}</strong>
                      <small>{f.detail}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {urgentPending.length > 0 ? (
            <div className="dash-card">
              <h3>Próximos passos atrasados</h3>
              <ul className="dash-deal-list">
                {urgentPending.map((a) => (
                  <li key={a.opportunityId}>
                    <button type="button" className="dash-deal-item" onClick={() => openDeal(a.opportunityId)}>
                      <span className="dash-deal-rank bad">{a.daysIdle}d</span>
                      <span className="dash-deal-info">
                        <strong>{a.name}</strong>
                        <small>{a.nextAction}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      )}

      <div className="dash-summary-footer">
        <p>Precisa de mais detalhe? Abra a análise completa com conversão, receita, segmentação e equipe.</p>
        <button type="button" className="dash-btn dash-btn-primary" onClick={onShowFull}>
          Ver análise completa
        </button>
      </div>
    </>
  );
}

export function DashboardView({ data }: Props) {
  const router = useRouter();
  const [period, setPeriod] = useState<DashPeriod>('all');
  const [volumeWindow, setVolumeWindow] = useState<VolumeWindow>(90);
  const [viewMode, setViewMode] = useState<ViewMode>('summary');

  useEffect(() => {
    setViewMode(readViewMode());
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const m = useMemo(() => {
    const filtered = filterOppsByPeriod(data.opps, period);
    return computeExtendedDashboardMetrics(
      data.opps,
      filtered,
      data.stageConfig,
      data.overdueAppointments,
      data.upcomingAppointments,
      volumeWindow,
      period,
    );
  }, [data, period, volumeWindow]);

  const openDeal = (id?: string) => {
    if (id) router.push(`/funil?deal=${id}`);
    else router.push('/agenda');
  };

  if (data.opps.length === 0) {
    return (
      <div className="dash-empty">
        <h2>Nenhum dado no funil ainda</h2>
        <p>Adicione negócios no funil para ver métricas executivas aqui.</p>
        <div className="dash-empty-actions">
          <Link href="/funil" className="dash-btn dash-btn-primary">Ir para o Funil</Link>
        </div>
      </div>
    );
  }

  const maxVol = Math.max(...m.volumeTrend.map((v) => v.count), 1);
  const maxWaterfall = Math.max(...m.waterfall.map((w) => w.count), 1);

  return (
    <div className="dash-root">
      <div className="dash-toolbar">
        <div className="dash-toolbar-left">
          <h1 className="dash-title">Dashboard</h1>
          <div className="dash-view-toggle" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              className={`dash-view-btn${viewMode === 'summary' ? ' active' : ''}`}
              onClick={() => setViewMode('summary')}
            >
              Resumo
            </button>
            <button
              type="button"
              className={`dash-view-btn${viewMode === 'full' ? ' active' : ''}`}
              onClick={() => setViewMode('full')}
            >
              Completo
            </button>
          </div>
          <div className="dash-period-toggle" role="group" aria-label="Período">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`dash-period-btn${period === p.id ? ' active' : ''}`}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="dash-toolbar-right">
          <Link href="/ceo" className="dash-btn dash-btn-ceo">Análise CEO Brain</Link>
        </div>
      </div>

      {viewMode === 'full' ? (
        <nav className="dash-section-nav" aria-label="Seções do dashboard">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#dash-${s.id}`} className="dash-section-link">
              {s.label}
            </a>
          ))}
        </nav>
      ) : null}

      <div className="dash-body">
        {viewMode === 'summary' ? (
          <DashboardSummary
            m={m}
            openDeal={(id) => openDeal(id)}
            goAgenda={() => router.push('/agenda')}
            onShowFull={() => setViewMode('full')}
          />
        ) : (
          <>
            <SectionHead id="dash-visao" title="1. Visão geral do funil" hint="Amplitude, distribuição e gargalos entre etapas." />

            <section className="dash-kpi-grid">
              {m.amplitude.filter((a) => a.count > 0).slice(0, 6).map((a) => (
                <div key={a.id} className="dash-kpi" style={{ borderLeftColor: a.color }}>
                  <div className="dash-kpi-label">{a.label}</div>
                  <div className="dash-kpi-value" style={{ color: a.color }}>{a.count}</div>
                  <div className="dash-kpi-sub">{a.pct}% do funil · {fmtCompact(a.value)}</div>
                </div>
              ))}
            </section>

            <section className="dash-grid">
              <div className="dash-card dash-card-wide">
                <div className="dash-card-head"><h3>Distribuição por etapa</h3></div>
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Etapa</th>
                        <th>Volume</th>
                        <th>% funil</th>
                        <th>Valor</th>
                        <th>Média</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.amplitude.map((a) => (
                        <tr key={a.id}>
                          <td><span className="dash-dot" style={{ background: a.color }} />{a.label}</td>
                          <td>{a.count}</td>
                          <td>{a.pct}%</td>
                          <td>{fmtCompact(a.value)}</td>
                          <td>{a.avgValue > 0 ? fmtCompact(a.avgValue) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="dash-card">
                <div className="dash-card-head"><h3>Waterfall — redução entre etapas</h3></div>
                <div className="dash-waterfall">
                  {m.waterfall.map((w) => (
                    <div key={w.label} className="dash-waterfall-row">
                      <span className="dash-waterfall-label">{w.label}</span>
                      <div className="dash-funnel-track">
                        <div
                          className="dash-funnel-fill"
                          style={{ width: `${Math.max(8, (w.count / maxWaterfall) * 100)}%`, background: w.color }}
                        />
                      </div>
                      <span className="dash-waterfall-count">{w.count}</span>
                      {w.drop > 0 ? <span className="dash-waterfall-drop">−{w.drop} ({w.dropPct}%)</span> : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="dash-card">
                <div className="dash-card-head">
                  <h3>Evolução de entrada</h3>
                  <div className="dash-period-toggle dash-period-toggle-sm">
                    {VOLUME_WINDOWS.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        className={`dash-period-btn${volumeWindow === w.id ? ' active' : ''}`}
                        onClick={() => setVolumeWindow(w.id)}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="dash-rev-chart">
                  {m.volumeTrend.length === 0 ? (
                    <p className="dash-empty-inline">Sem novos deals no período.</p>
                  ) : (
                    m.volumeTrend.map((v) => (
                      <div key={v.label} className="dash-rev-col">
                        <span className="dash-rev-val">{v.count || ''}</span>
                        <div className="dash-rev-bar" style={{ height: Math.max(4, (v.count / maxVol) * 120) }} />
                        <span className="dash-rev-label">{v.label}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <SectionHead id="dash-velocidade" title="2. Velocidade de conversão" hint="Taxas entre etapas, ciclo e comparativo com período anterior." />

            <section className="dash-split">
              <div className="dash-card">
                <h3>Comparativo de período</h3>
                <div className="dash-compare-grid">
                  <div>
                    <span className="dash-compare-label">Deals (atual)</span>
                    <strong>{m.periodComparison.current.deals}</strong>
                    <small>{deltaLabel(m.periodComparison.deltaDeals)} vs anterior</small>
                  </div>
                  <div>
                    <span className="dash-compare-label">Ganhos</span>
                    <strong>{m.periodComparison.current.won}</strong>
                    <small>{deltaLabel(m.periodComparison.deltaWon)}</small>
                  </div>
                  <div>
                    <span className="dash-compare-label">Pipeline</span>
                    <strong>{fmtCompact(m.periodComparison.current.pipeline)}</strong>
                    <small>{deltaLabel(Math.round(m.periodComparison.deltaPipeline / 1000), 'k')}</small>
                  </div>
                  <div>
                    <span className="dash-compare-label">Conversão funil completo</span>
                    <strong>{m.fullFunnelConversion}%</strong>
                    <small>entrada → ganho</small>
                  </div>
                </div>
              </div>

              <div className="dash-card dash-card-wide">
                <h3>Dias médios por etapa (P25 · P50 · P75)</h3>
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Etapa</th>
                        <th>Deals</th>
                        <th>Média</th>
                        <th>P25</th>
                        <th>P50</th>
                        <th>P75</th>
                        <th>Conv. → próx.</th>
                        <th>Conv. ant.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.velocity.map((v) => (
                        <tr key={v.id}>
                          <td><span className="dash-dot" style={{ background: v.color }} />{v.label}</td>
                          <td>{v.dealCount}</td>
                          <td className={v.avgDays > 30 ? 'warn' : ''}>{v.avgDays}d</td>
                          <td>{v.p25}d</td>
                          <td>{v.p50}d</td>
                          <td>{v.p75}d</td>
                          <td className={v.conversionToNext >= 50 ? 'good' : 'warn'}>{v.conversionToNext}%</td>
                          <td>{v.conversionPrevPeriod != null ? `${v.conversionPrevPeriod}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <SectionHead id="dash-receita" title="3. Valor e receita prevista" hint="Pipeline, forecast ponderado e cenários." />

            <section className="dash-kpi-grid dash-kpi-grid--4">
              <KpiCard label="Pipeline aberto" value={fmtCompact(m.kpis.pipelineValue)} sub={`${m.kpis.activeCount} negócios`} accent="#2563EB" />
              <KpiCard label="Forecast realista" value={fmtCompact(m.forecast.realistic)} sub="Valor × probabilidade" accent="#7C3AED" />
              <KpiCard label="Receita comprometida" value={fmtCompact(m.forecast.committed)} sub="Etapas ≥ 70% prob." accent="#16A34A" />
              <KpiCard label="Pipeline / forecast" value={`${m.benchmarks.pipelineToForecastRatio}x`} sub={`Meta: ${m.benchmarks.healthyPipelineMultiple}x`} accent="#0891B2" />
            </section>

            <section className="dash-grid">
              <div className="dash-card">
                <h3>Cenários de receita</h3>
                <div className="dash-scenario-list">
                  <div><span>Otimista</span><strong>{fmtCompact(m.forecast.optimistic)}</strong></div>
                  <div><span>Realista</span><strong>{fmtCompact(m.forecast.realistic)}</strong></div>
                  <div><span>Pessimista</span><strong>{fmtCompact(m.forecast.pessimistic)}</strong></div>
                  <div><span>Confirmada (ganhos)</span><strong>{fmtCompact(m.kpis.confirmedRevenue)}</strong></div>
                </div>
              </div>
              <div className="dash-card">
                <h3>Valor por etapa</h3>
                <div className="dash-table-wrap">
                  <table className="dash-table compact">
                    <thead><tr><th>Etapa</th><th>Total</th><th>Média</th></tr></thead>
                    <tbody>
                      {m.valueByStage.map((v) => (
                        <tr key={v.label}>
                          <td><span className="dash-dot" style={{ background: v.color }} />{v.label}</td>
                          <td>{fmtCompact(v.total)}</td>
                          <td>{v.avg > 0 ? fmtCompact(v.avg) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="dash-card">
                <h3>Distribuição por tamanho</h3>
                <div className="dash-size-buckets">
                  <div><span>Pequeno (&lt;25k)</span><strong>{m.sizeDistribution.pequeno}</strong></div>
                  <div><span>Médio (25k–100k)</span><strong>{m.sizeDistribution.medio}</strong></div>
                  <div><span>Grande (&gt;100k)</span><strong>{m.sizeDistribution.grande}</strong></div>
                </div>
              </div>
              <div className="dash-card">
                <h3>Receita mensal (ganhos)</h3>
                <div className="dash-rev-chart">
                  {m.monthlyRevenue.map((mo) => {
                    const maxR = Math.max(...m.monthlyRevenue.map((x) => x.value), 1);
                    return (
                      <div key={mo.key} className="dash-rev-col">
                        <div className={`dash-rev-bar${mo.isCurrent ? ' current' : ''}`} style={{ height: Math.max(4, (mo.value / maxR) * 100) }} />
                        <span className="dash-rev-label">{mo.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <SectionHead id="dash-risco" title="4. Saúde e risco do pipeline" hint="Deals vencidos, inativos e engajamento recente." />

            <section className="dash-kpi-grid dash-kpi-grid--4">
              <KpiCard label="Vencidos" value={String(m.overdueDeals.length)} sub="Além da data esperada" accent="#DC2626" />
              <KpiCard label="Parados 14+ dias" value={String(m.kpis.stalledCount)} sub="Sem atividade" accent="#D97706" />
              <KpiCard label="Baixa probabilidade" value={String(m.lowProbDeals.length)} sub="Abaixo da etapa" accent="#7C3AED" />
              <KpiCard label="Engajamento 30d" value={`${m.engagement.withTouch30d}/${m.kpis.activeCount}`} sub={`${m.engagement.noTouch30d} sem toque`} accent="#0891B2" />
            </section>

            <section className="dash-split">
              <div className="dash-card">
                <h3>Deals vencidos</h3>
                {m.overdueDeals.length === 0 ? (
                  <p className="dash-empty-inline good">Nenhum deal vencido.</p>
                ) : (
                  <ul className="dash-deal-list">
                    {m.overdueDeals.map((d) => (
                      <li key={d.id}>
                        <button type="button" className="dash-deal-item" onClick={() => openDeal(d.id)}>
                          <span className="dash-deal-rank bad">{d.daysOverdue}d</span>
                          <span className="dash-deal-info"><strong>{d.name}</strong><small>{d.stage}</small></span>
                          <span className="dash-deal-value">{fmtCompact(d.value)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="dash-card">
                <h3>Inativos (14+ dias)</h3>
                <ul className="dash-deal-list">
                  {m.inactiveDeals.slice(0, 6).map((d) => (
                    <li key={d.id}>
                      <button type="button" className="dash-deal-item" onClick={() => openDeal(d.id)}>
                        <span className="dash-deal-rank warn">{d.days}d</span>
                        <span className="dash-deal-info"><strong>{d.name}</strong><small>{d.stage}</small></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <SectionHead id="dash-segmentacao" title="5. Origem e segmentação" hint="Fonte, setor, porte e perfil de deal." />

            <section className="dash-grid">
              <div className="dash-card">
                <h3>Fonte do deal</h3>
                <div className="dash-table-wrap">
                  <table className="dash-table compact">
                    <thead><tr><th>Origem</th><th>Qtd</th><th>Conv.</th><th>Pipeline</th></tr></thead>
                    <tbody>
                      {m.sources.map((s) => (
                        <tr key={s.source}>
                          <td>{s.source}</td>
                          <td>{s.count}</td>
                          <td>{s.conversion}%</td>
                          <td>{fmtCompact(s.pipelineValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="dash-card">
                <h3>Setores</h3>
                {m.segments.sectors.map((s) => (
                  <div key={s.name} className="dash-bar-row">
                    <span className="dash-bar-label">{s.name}</span>
                    <span className="dash-bar-count">{s.count} · WR {s.winRate}%</span>
                  </div>
                ))}
              </div>
              <div className="dash-card">
                <h3>Perfil (tier)</h3>
                {m.segments.tiers.map((t) => (
                  <div key={t.id} className="dash-bar-row">
                    <span className="dash-bar-label">{t.label}</span>
                    <span className="dash-bar-count">{t.count} · {fmtCompact(t.value)}</span>
                  </div>
                ))}
              </div>
              <div className="dash-card">
                <h3>Tendência trimestral</h3>
                {m.pipelineTrend.map((t) => (
                  <div key={t.label} className="dash-bar-row">
                    <span className="dash-bar-label">{t.label}</span>
                    <span className="dash-bar-count">+{t.entered} · {t.won} ganhos · {t.active} ativos</span>
                  </div>
                ))}
              </div>
            </section>

            <SectionHead id="dash-equipe" title="6. Performance por responsável" hint="Carteira, pipeline e win rate por vendedor." />

            <section className="dash-card dash-card-wide">
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Responsável</th>
                      <th>Deals</th>
                      <th>Ativos</th>
                      <th>Pipeline</th>
                      <th>Dias médios</th>
                      <th>Win rate</th>
                      <th>Parados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.owners.map((o) => (
                      <tr key={o.ownerId}>
                        <td>{o.name}</td>
                        <td>{o.dealCount}</td>
                        <td>{o.activeCount}</td>
                        <td>{fmtCompact(o.pipelineValue)}</td>
                        <td className={o.avgDaysInStage > 30 ? 'warn' : ''}>{o.avgDaysInStage}d</td>
                        <td>{o.winRate}%</td>
                        <td className={o.stalledCount > 0 ? 'warn' : 'good'}>{o.stalledCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <SectionHead id="dash-alertas" title="11–12. Alertas e próximos passos" hint="Red flags automáticas e ações pendentes por deal." />

            <section className="dash-split">
              <div className="dash-card dash-card-accent">
                <h3>Red flags</h3>
                <ul className="dash-flag-list">
                  {m.redFlags.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        className={`dash-flag dash-flag--${f.severity}`}
                        onClick={() => openDeal(f.opportunityId)}
                        disabled={!f.opportunityId}
                      >
                        <strong>{f.title}</strong>
                        <small>{f.detail}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="dash-card">
                <h3>Ações pendentes</h3>
                <div className="dash-table-wrap">
                  <table className="dash-table compact">
                    <thead>
                      <tr><th>Deal</th><th>Próxima ação</th><th>Resp.</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {m.pendingActions.map((a) => (
                        <tr key={a.opportunityId} className={a.isLate ? 'row-late' : ''}>
                          <td>
                            <div className="dash-deal-cell">
                              <button type="button" className="dash-link-btn" onClick={() => openDeal(a.opportunityId)}>
                                {a.name}
                              </button>
                              <span className="dash-deal-stage">{a.stage}</span>
                            </div>
                          </td>
                          <td>{a.nextAction}</td>
                          <td>{a.responsible}</td>
                          <td>{a.isLate ? `⚠ ${a.daysIdle}d` : `${a.daysIdle}d`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
