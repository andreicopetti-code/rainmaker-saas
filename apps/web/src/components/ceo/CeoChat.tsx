'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import '@/app/ceo/ceo.css';
import { askCeo, type AiProvider, type ChatMessage, type CeoPageData } from '@/app/ceo/actions';
import { APP_AI_AVATAR_LABEL } from '@/lib/brand';
import type { ChipFocus } from '@/lib/ceo/context';
import { resolveDealId as matchDealId, stripDealIdMarkers } from '@/lib/ceo/deal-links';
import {
  buildStoredChallenge,
  loadStoredChallenge,
  saveStoredChallenge,
  type StoredChallenge,
  getChallengeBarSummary,
} from '@/lib/ceo/challenge';

// ── Types ──────────────────────────────────────────────────────────────────────

type Message = { id: string; role: 'user' | 'assistant'; content: string };
type Props   = { pageData: CeoPageData };

const AI_PROVIDER_STORAGE_KEY = 'rm-ai-provider';

function loadAiProvider(): AiProvider {
  try {
    const raw = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
    if (raw === 'groq' || raw === 'deepseek') return raw;
  } catch {
    /* ignore */
  }
  return 'groq';
}

// ── Action Groups ──────────────────────────────────────────────────────────────

type ChipVariant = 'green' | 'amber' | 'red' | 'blue' | 'muted';
type ChipDef = {
  id: string;
  label: string;
  focus: ChipFocus;
  variant: ChipVariant;
  prompt: string;
  countKey?: 'fechar' | 'risco' | 'descartar';
};

const ACTION_GROUPS: { label: string; chips: ChipDef[] }[] = [
  {
    label: 'AGIR AGORA',
    chips: [
      {
        id: 'fechar', label: 'Fechar agora', focus: 'fechar', variant: 'green', countKey: 'fechar',
        prompt: 'Liste até 3 negócios para fechar esta semana. Use o formato de cards do sistema (🔥 FECHAR AGORA).',
      },
      {
        id: 'risco', label: 'Em risco', focus: 'risco', variant: 'amber', countKey: 'risco',
        prompt: 'Quais negócios estão em risco de se perder? Para cada um: causa provável e ações específicas para reverter.',
      },
      {
        id: 'parados', label: 'Parados', focus: 'parados', variant: 'amber',
        prompt: 'Liste todos os negócios parados por mais tempo, com quantos dias, e dê um plano de reativação específico para cada um.',
      },
      {
        id: 'descartar', label: 'Descartar', focus: 'descartar', variant: 'muted', countKey: 'descartar',
        prompt: 'Quais negócios devo descartar da carteira agora? Justifique com dados concretos e diga como liberar o foco da equipe.',
      },
    ],
  },
  {
    label: 'DIAGNÓSTICO',
    chips: [
      {
        id: 'diagnostico', label: 'Visão geral', focus: 'visao', variant: 'blue',
        prompt: 'Faça um diagnóstico executivo da carteira de vendas: saúde, riscos imediatos, gargalos e as 3 ações prioritárias desta semana.',
      },
      {
        id: 'movimentos', label: 'Próximos movimentos', focus: 'movimentos', variant: 'blue',
        prompt: 'Quais são os 3 movimentos mais estratégicos que devo fazer na carteira nas próximas 2 semanas para maximizar receita?',
      },
      {
        id: 'concentracao', label: 'Concentração de risco', focus: 'concentracao', variant: 'blue',
        prompt: 'Existe concentração de risco na carteira? Quais negócios, se perdidos, comprometem seriamente o resultado do mês?',
      },
    ],
  },
  {
    label: 'ANÁLISE',
    chips: [
      {
        id: 'perdas', label: 'Perdas recentes', focus: 'perdas', variant: 'muted',
        prompt: 'Analise os negócios perdidos. Existe padrão de classificação, etapa ou setor? O que muda no processo para evitar repetição?',
      },
      {
        id: 'meta', label: 'Meta do mês', focus: 'meta', variant: 'muted',
        prompt: 'Com base nos negócios ativos e datas previstas, estou no caminho de fechar o mês bem? Quais negócios podem virar receita este mês?',
      },
    ],
  },
];

// ── Chip Icons (SVG monochromatic, 14px) ───────────────────────────────────────

function ChipIcon({ id }: { id: string }) {
  const paths: Record<string, React.ReactNode> = {
    fechar:       <><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
    risco:        <><path d="M12 3L2 20h20L12 3z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/><line x1="12" y1="9" x2="12" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="17" r="0.75" fill="currentColor"/></>,
    parados:      <><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none"/><polyline points="12 7 12 12 15 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
    descartar:    <><polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/><path d="M9 6V4h6v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></>,
    diagnostico:  <><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="11" y1="8" x2="11" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="8" y1="11" x2="14" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>,
    movimentos:   <><path d="M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
    concentracao: <><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/><path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/><path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></>,
    perdas:       <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
    meta:         <><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/><line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.5"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>,
  };
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {paths[id] ?? <circle cx="12" cy="12" r="4" fill="currentColor" />}
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyInlineMarkdown(text: string) {
  return escapeHtml(stripDealIdMarkers(text)).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/** Collapse leftover "ação| para X| até Y" pipes in displayed action text. */
function normalizeActionPipes(text: string) {
  return text
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function applyActionMarkdown(text: string) {
  return applyInlineMarkdown(normalizeActionPipes(text));
}

/** Optional trailing [id:…] after a bold company name (full or truncated UUID). */
const DEAL_ID_SUFFIX = String.raw`(\s*\[id:\s*[0-9a-f][0-9a-f-]*\])?`;

type DealResolver = (company: string) => string | null;

function renderDealCard(
  num: string | null,
  company: string,
  meta: string | null,
  action: string,
  resolveDealId?: DealResolver,
) {
  const dealId = resolveDealId?.(company) ?? null;
  const displayCompany = stripDealIdMarkers(company) || company;
  const numHtml = num
    ? `<span class="ceo-card-num">${escapeHtml(num)}</span>`
    : '<span class="ceo-card-dot" aria-hidden="true"></span>';
  const metaHtml = meta
    ? `<div class="ceo-card-meta">${applyInlineMarkdown(meta)}</div>`
    : '';
  const linkClass = dealId ? ' ceo-card--link' : '';
  const dataAttr = dealId ? ` data-deal-id="${escapeHtml(dealId)}"` : '';
  const openHtml = dealId
    ? `<div class="ceo-card-open">Abrir negócio →</div>`
    : '';
  return (
    `<div class="ceo-card${linkClass}"${dataAttr}>` +
    `${numHtml}` +
    `<div class="ceo-card-body">` +
    `<div class="ceo-card-title">${applyInlineMarkdown(displayCompany)}</div>` +
    metaHtml +
    `<div class="ceo-card-action">${applyActionMarkdown(action)}</div>` +
    openHtml +
    `</div></div>`
  );
}

function parseDashParts(content: string) {
  const plain = content.replace(/\*\*(.+?)\*\*/g, '$1').trim();
  const parts = plain.split(/\s*[—–]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return {
      company: parts[0],
      meta: parts.slice(1, -1).join(' · '),
      action: parts[parts.length - 1],
    };
  }
  if (parts.length === 2) {
    return { company: parts[0], meta: null, action: parts[1] };
  }
  return null;
}

function isImmediateActionsSection(section: string) {
  const s = section.toLowerCase();
  return s.includes('ações imediatas') || s.includes('acoes imediatas')
    || s.includes('próxima ação') || s.includes('proxima acao');
}

function renderImmediateActionItems(text: string) {
  const cleaned = text.replace(/^\*\*|\*\*$/g, '').trim();
  const items = cleaned.includes(';')
    ? cleaned.split(/;\s*/).map((s) => s.trim()).filter(Boolean)
    : [cleaned];
  return items
    .map((item) => `<div class="ceo-bullet ceo-bullet--immediate">${applyActionMarkdown(item)}</div>`)
    .join('');
}

function renderHashSection(lines: string[], resolveDealId?: DealResolver) {
  const company = lines[0].replace(/^###+\s+/, '').trim();
  const metaParts: string[] = [];
  const actionParts: string[] = [];

  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (!line || /^Ações concretas/i.test(line)) continue;
    if (/^-\s+Etapa:/i.test(line)) {
      metaParts.push(line.replace(/^-\s+/, ''));
    } else if (/^-\s+Perfil:/i.test(line)) {
      metaParts.push(line.replace(/^-\s+Perfil:\s*/i, ''));
    } else if (/^\d+\s*$/.test(line)) {
      continue;
    } else if (/^\d+\s+/.test(line)) {
      actionParts.push(line.replace(/^\d+\s+/, '').trim());
    } else if (line.startsWith('-')) {
      metaParts.push(line.replace(/^-\s+/, ''));
    }
  }

  const meta = metaParts.join(' · ') || null;
  const action = actionParts.join('; ') || 'Ver detalhes no funil';
  return renderDealCard(null, company, meta, action, resolveDealId);
}

function renderMarkdownTable(lines: string[]) {
  const rows = lines.filter((l) => l.includes('|'));
  if (rows.length < 2) return `<p class="ceo-para">${applyInlineMarkdown(lines.join(' '))}</p>`;

  const parseRow = (row: string) =>
    row.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length);

  const header = parseRow(rows[0]);
  const bodyRows = rows.slice(2).map(parseRow);

  const headHtml = header.map((h) => `<th>${applyInlineMarkdown(h)}</th>`).join('');
  const bodyHtml = bodyRows
    .map((cells) => `<tr>${cells.map((c) => `<td>${applyInlineMarkdown(c)}</td>`).join('')}</tr>`)
    .join('');

  return `<div class="ceo-table-wrap"><table class="ceo-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

function renderMarkdown(text: string, resolveDealId?: DealResolver) {
  const sectionRe = /^((?:⏰|🧭|🔥|⚠️|📋|🎯|✅|🗑️|🏆|📊)\s+.+)$/;

  const blocks = text.split(/\n\n+/);
  const html: string[] = [];
  let lastSection = '';

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) continue;

    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] ?? '';

    if (/^###+\s+/.test(firstLine)) {
      html.push(renderHashSection(lines, resolveDealId));
      continue;
    }

    if (lines.some((l) => l.includes('|')) && lines.some((l) => /^[\|\s:-]+$/.test(l))) {
      html.push(renderMarkdownTable(lines));
      continue;
    }

    if (sectionRe.test(firstLine) && lines.length === 1) {
      const title = firstLine;
      const emoji = title.slice(0, 2).trim();
      const label = title.slice(2).trim();
      lastSection = label.toLowerCase();
      html.push(
        `<div class="ceo-section-title">` +
        `<span class="ceo-section-emoji">${emoji}</span>` +
        `<span class="ceo-section-label">${applyInlineMarkdown(label)}</span>` +
        `</div>`,
      );
      continue;
    }

    if (sectionRe.test(firstLine) && lines.length > 1) {
      const title = firstLine;
      const emoji = title.slice(0, 2).trim();
      const label = title.slice(2).trim();
      lastSection = label.toLowerCase();
      html.push(
        `<div class="ceo-section-title">` +
        `<span class="ceo-section-emoji">${emoji}</span>` +
        `<span class="ceo-section-label">${applyInlineMarkdown(label)}</span>` +
        `</div>`,
      );
      html.push(renderLines(lines.slice(1), lastSection, resolveDealId));
      continue;
    }

    if (lines.length === 1) {
      html.push(renderBlock(lines[0], lastSection, resolveDealId));
      continue;
    }

    html.push(renderLines(lines, lastSection, resolveDealId));
  }

  return html.join('');
}

function renderLines(lines: string[], lastSection: string, resolveDealId?: DealResolver) {
  const parts: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const titleMatch = line.match(new RegExp(`^(\\d+)\\.\\s+\\*\\*(.+?)\\*\\*${DEAL_ID_SUFFIX}$`, 'i'));
    if (titleMatch && lines[i + 1] && lines[i + 2] && /^→\s+/.test(lines[i + 2])) {
      const company = `${titleMatch[2]}${titleMatch[3] ?? ''}`.trim();
      parts.push(renderDealCard(titleMatch[1], company, lines[i + 1], lines[i + 2].replace(/^→\s+/, ''), resolveDealId));
      i += 2;
      continue;
    }
    const bulletTitleMatch = line.match(new RegExp(`^•\\s+\\*\\*(.+?)\\*\\*${DEAL_ID_SUFFIX}\\s*[—–-]\\s*(.+)$`, 'i'));
    if (bulletTitleMatch && lines[i + 1] && /^→\s+/.test(lines[i + 1])) {
      const company = `${bulletTitleMatch[1]}${bulletTitleMatch[2] ?? ''}`.trim();
      parts.push(renderDealCard(null, company, bulletTitleMatch[3], lines[i + 1].replace(/^→\s+/, ''), resolveDealId));
      i += 1;
      continue;
    }
    parts.push(renderLine(line, lastSection, resolveDealId));
  }
  return parts.join('');
}

function renderBlock(block: string, lastSection: string, resolveDealId?: DealResolver) {
  const dealCardMatch = block.match(new RegExp(
    `^(\\d+)\\.\\s+\\*\\*(.+?)\\*\\*${DEAL_ID_SUFFIX}\\s*\\n([\\s\\S]+?)\\n→\\s*([\\s\\S]+)$`,
    'i',
  ));
  if (dealCardMatch) {
    const company = `${dealCardMatch[2]}${dealCardMatch[3] ?? ''}`.trim();
    return renderDealCard(dealCardMatch[1], company, dealCardMatch[4], dealCardMatch[5], resolveDealId);
  }

  const numMatch = block.match(/^(\d+)\.\s+([\s\S]+)$/);
  if (numMatch) {
    const parsed = parseDashParts(numMatch[2]);
    if (parsed) return renderDealCard(numMatch[1], parsed.company, parsed.meta, parsed.action, resolveDealId);
    return (
      `<div class="ceo-card">` +
      `<span class="ceo-card-num">${escapeHtml(numMatch[1])}</span>` +
      `<div class="ceo-card-body"><div class="ceo-card-action">${applyActionMarkdown(numMatch[2])}</div></div></div>`
    );
  }

  const bulletArrowMatch = block.match(new RegExp(
    `^•\\s+\\*\\*(.+?)\\*\\*${DEAL_ID_SUFFIX}\\s*[—–-]\\s*([\\s\\S]+?)\\n→\\s*([\\s\\S]+)$`,
    'i',
  ));
  if (bulletArrowMatch) {
    const company = `${bulletArrowMatch[1]}${bulletArrowMatch[2] ?? ''}`.trim();
    return renderDealCard(null, company, bulletArrowMatch[3], bulletArrowMatch[4], resolveDealId);
  }

  const bulletMatch = block.match(/^•\s+([\s\S]+)$/);
  if (bulletMatch) {
    const parsed = parseDashParts(bulletMatch[1]);
    if (parsed) return renderDealCard(null, parsed.company, parsed.meta, parsed.action, resolveDealId);
    const cls = isImmediateActionsSection(lastSection) ? 'ceo-bullet ceo-bullet--immediate' : 'ceo-bullet';
    return `<div class="${cls}">${isImmediateActionsSection(lastSection) ? applyActionMarkdown(bulletMatch[1]) : applyInlineMarkdown(bulletMatch[1])}</div>`;
  }

  if (isImmediateActionsSection(lastSection)) {
    return renderImmediateActionItems(block);
  }

  return `<p class="ceo-para">${applyInlineMarkdown(block)}</p>`;
}

function renderLine(line: string, lastSection: string, resolveDealId?: DealResolver) {
  if (new RegExp(`^(\\d+)\\.\\s+\\*\\*(.+?)\\*\\*${DEAL_ID_SUFFIX}$`, 'i').test(line)) {
    return `<p class="ceo-para">${applyInlineMarkdown(line)}</p>`;
  }

  const numMatch = line.match(/^(\d+)\.\s+(.+)$/);
  if (numMatch) {
    const parsed = parseDashParts(numMatch[2]);
    if (parsed) return renderDealCard(numMatch[1], parsed.company, parsed.meta, parsed.action, resolveDealId);
    return (
      `<div class="ceo-card">` +
      `<span class="ceo-card-num">${escapeHtml(numMatch[1])}</span>` +
      `<div class="ceo-card-body"><div class="ceo-card-action">${applyActionMarkdown(numMatch[2])}</div></div></div>`
    );
  }

  if (isImmediateActionsSection(lastSection)) {
    if (/^•\s+/.test(line)) {
      const item = line.replace(/^•\s+/, '');
      return `<div class="ceo-bullet ceo-bullet--immediate">${applyActionMarkdown(item)}</div>`;
    }
    return renderImmediateActionItems(line);
  }

  if (/^•\s+/.test(line)) {
    const item = line.replace(/^•\s+/, '');
    const parsed = parseDashParts(item);
    if (parsed) return renderDealCard(null, parsed.company, parsed.meta, parsed.action, resolveDealId);
    return `<div class="ceo-bullet">${applyInlineMarkdown(item)}</div>`;
  }

  if (/^→\s+/.test(line)) {
    return `<div class="ceo-inline-action">${applyActionMarkdown(line.replace(/^→\s+/, ''))}</div>`;
  }

  return `<p class="ceo-para">${applyInlineMarkdown(line)}</p>`;
}

function uid() { return Math.random().toString(36).slice(2); }

// ── Health Ring ────────────────────────────────────────────────────────────────

function HealthRing({ score, color }: { score: number; color: string }) {
  const r = 9, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="ceo-cb-health-ring">
      <svg width="26" height="26" viewBox="0 0 26 26">
        <circle cx="13" cy="13" r={r} fill="none" stroke="var(--border2)" strokeWidth="3" />
        <circle
          cx="13" cy="13" r={r} fill="none"
          stroke={color} strokeWidth="3"
          strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="ceo-cb-health-ring-val" style={{ color }}>{score}</div>
    </div>
  );
}

// ── Command Bar ────────────────────────────────────────────────────────────────

function CommandBar({
  pageData,
  aiUsed,
  aiLimit,
  quotaExceeded,
  onBriefing,
  onChallenge,
  loading,
  challengeLoading,
  aiProvider,
  onAiProviderChange,
}: {
  pageData: CeoPageData;
  aiUsed: number;
  aiLimit: number;
  quotaExceeded: boolean;
  onBriefing: () => void;
  onChallenge: () => void;
  loading: boolean;
  challengeLoading: boolean;
  aiProvider: AiProvider;
  onAiProviderChange: (provider: AiProvider) => void;
}) {
  const { context, classif, health } = pageData;
  const { resumo } = context;
  const conv = parseFloat(resumo.taxaConversao);

  const kpis = [
    { label: 'Deals',      value: resumo.total,                                                    cls: 'neutral' },
    { label: 'Receita',    value: fmtBRL(resumo.receitaConfirmada),                                cls: 'green' },
    { label: 'Potencial',  value: resumo.receitaRealAberta > 0 ? fmtBRL(resumo.receitaRealAberta) : '—', cls: 'neutral' },
    { label: 'Conversão',  value: resumo.taxaConversao,                                            cls: conv >= 30 ? 'green' : 'red' },
    ...(resumo.semValorDefinido > 0 ? [{ label: 'Sem valor', value: resumo.semValorDefinido, cls: 'amber' }] : []),
    ...(resumo.valorPosFechamento > 0
      ? [{ label: 'Pós-fech.', value: resumo.valorPosFechamento, cls: 'neutral' }]
      : []),
  ];

  const healthCls = health.score >= 80 ? 'saudavel' : health.score >= 50 ? 'atencao' : 'critico';

  return (
    <div className="ceo-command-bar">
      {/* Health ring */}
      <div className="ceo-cb-health">
        <HealthRing score={health.score} color={health.color} />
        <span className={`ceo-cb-health-label ${healthCls}`}>{health.label}</span>
      </div>

      <div className="ceo-cb-sep" />

      {/* KPI pills */}
      <div className="ceo-cb-kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`ceo-cb-kpi ${k.cls}`}>
            <span className="ceo-cb-kpi-val">{String(k.value)}</span>
            <span>{k.label}</span>
          </div>
        ))}
      </div>

      <div className="ceo-cb-sep" />

      {/* Classification badges */}
      <div className="ceo-cb-classif">
        <div className="ceo-cb-badge fechar"   title="Fechar agora">🔥 {classif.fechar.length}</div>
        <div className="ceo-cb-badge risco"    title="Em risco">⚠️ {classif.risco.length}</div>
        <div className="ceo-cb-badge cultivar" title="Cultivar">🌱 {classif.cultivar.length}</div>
        <div className="ceo-cb-badge descartar"title="Descartar">🗑️ {classif.descartar.length}</div>
      </div>

      <div className="ceo-cb-sep" />

      {/* Quota + IA provider + briefing */}
      <span className={`ceo-quota${quotaExceeded ? ' exceeded' : ''}`}>
        {aiUsed}/{aiLimit} req/mês
      </span>

      <label className="ceo-provider-select" title="Provedor de IA (teste)">
        <span className="ceo-provider-select-label">IA</span>
        <select
          value={aiProvider}
          onChange={(e) => onAiProviderChange(e.target.value as AiProvider)}
          disabled={loading || challengeLoading}
          aria-label="Provedor de IA"
        >
          <option value="groq">Groq</option>
          <option value="deepseek">DeepSeek</option>
        </select>
      </label>

      <button
        className="ceo-challenge-btn"
        onClick={onChallenge}
        disabled={loading || challengeLoading || quotaExceeded}
        title="Desafio de vendas da semana"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
        </svg>
        {challengeLoading ? 'Gerando…' : 'Desafio'}
      </button>

      <button className="ceo-refresh-btn" onClick={onBriefing} disabled={loading || challengeLoading || quotaExceeded}>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
        </svg>
        {loading ? 'Analisando…' : 'Novo Briefing'}
      </button>
    </div>
  );
}

// ── Active Challenge Card ──────────────────────────────────────────────────────

function ChallengeCard({
  challenge,
  onComplete,
  onDismiss,
  onToggleCollapse,
}: {
  challenge: StoredChallenge;
  onComplete: () => void;
  onDismiss: () => void;
  onToggleCollapse: () => void;
}) {
  if (challenge.completed) return null;

  const isCollapsed = challenge.collapsed === true;

  if (isCollapsed) {
    return (
      <div className="ceo-challenge-card ceo-challenge-card--collapsed">
        <button
          type="button"
          className="ceo-challenge-collapsed-main"
          onClick={onToggleCollapse}
          title="Expandir desafio"
        >
          <span className="ceo-challenge-collapsed-icon" aria-hidden="true">🏆</span>
          <span className="ceo-challenge-collapsed-label">DESAFIO DA SEMANA</span>
          <span className="ceo-challenge-collapsed-sep" aria-hidden="true">—</span>
          <span className="ceo-challenge-collapsed-summary">{getChallengeBarSummary(challenge)}</span>
          <span className="ceo-challenge-collapsed-deadline">{challenge.deadline}</span>
        </button>
        <div className="ceo-challenge-collapsed-actions">
          <button
            type="button"
            className="ceo-challenge-icon-btn"
            onClick={onToggleCollapse}
            title="Expandir"
            aria-label="Expandir desafio"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}>
              <path d="M7 10l5 5 5-5H7z" />
            </svg>
          </button>
          <button
            type="button"
            className="ceo-challenge-icon-btn ceo-challenge-icon-btn--done"
            onClick={onComplete}
            title="Marcar concluído"
            aria-label="Marcar desafio concluído"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}>
              <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ceo-challenge-card">
      <div className="ceo-challenge-card-head">
        <span className="ceo-challenge-card-badge">🏆 Desafio da semana</span>
        <div className="ceo-challenge-card-head-right">
          <span className="ceo-challenge-card-deadline">{challenge.deadline}</span>
          <button
            type="button"
            className="ceo-challenge-collapse-btn"
            onClick={onToggleCollapse}
            title="Recolher"
          >
            Recolher
            <svg viewBox="0 0 24 24" fill="currentColor" width={12} height={12}>
              <path d="M7 14l5-5 5 5H7z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="ceo-challenge-metric">{challenge.metric}</div>
      <p className="ceo-challenge-action">{challenge.action}</p>
      <div className="ceo-challenge-card-actions">
        <button type="button" className="ceo-challenge-done-btn" onClick={onComplete}>
          Concluído
        </button>
        <button type="button" className="ceo-challenge-dismiss-btn" onClick={onDismiss}>
          Gerar novo
        </button>
      </div>
    </div>
  );
}

// ── Message Bubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  innerRef,
  resolveDealId,
  onOpenDeal,
}: {
  msg: Message;
  innerRef?: React.Ref<HTMLDivElement>;
  resolveDealId: DealResolver;
  onOpenDeal: (id: string) => void;
}) {
  const isUser = msg.role === 'user';
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bubbleRef.current;
    if (!el || isUser) return;

    const handler = (event: MouseEvent) => {
      const card = (event.target as HTMLElement).closest('.ceo-card--link[data-deal-id]');
      if (!card) return;
      event.preventDefault();
      const id = card.getAttribute('data-deal-id');
      if (id) onOpenDeal(id);
    };

    el.addEventListener('click', handler);
    return () => el.removeEventListener('click', handler);
  }, [isUser, msg.content, onOpenDeal]);

  return (
    <div ref={innerRef} className={`ceo-msg${isUser ? ' user' : ''}`}>
      <div className={`ceo-msg-avatar ${isUser ? 'user' : 'ai'}`}>
        {isUser ? 'Você' : APP_AI_AVATAR_LABEL}
      </div>
      <div className="ceo-msg-bubble" ref={bubbleRef}>
        {isUser
          ? msg.content
          : <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content, resolveDealId) }} />
        }
      </div>
    </div>
  );
}

// ── Typing Indicator ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="ceo-msg">
      <div className="ceo-msg-avatar ai">{APP_AI_AVATAR_LABEL}</div>
      <div className="ceo-msg-bubble">
        <div className="ceo-typing">
          <div className="ceo-typing-dot" />
          <div className="ceo-typing-dot" />
          <div className="ceo-typing-dot" />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function CeoChat({ pageData }: Props) {
  const router = useRouter();
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [aiUsed, setAiUsed]       = useState(pageData.aiUsed);
  const [aiLimit]                 = useState(pageData.aiLimit);
  const [quotaExceeded, setQuotaExceeded] = useState(pageData.quotaExceeded);
  const [activeChallenge, setActiveChallenge] = useState<StoredChallenge | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider>('groq');
  const [isPending, startTransition] = useTransition();
  // useRef prevents double-fire in React StrictMode (dev) unlike useState
  const briefingDone    = useRef(false);
  const messagesRef     = useRef<HTMLDivElement>(null);
  const bottomRef       = useRef<HTMLDivElement>(null);
  const lastUserMsgRef  = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLTextAreaElement>(null);
  const aiProviderRef   = useRef<AiProvider>('groq');

  useEffect(() => {
    const saved = loadAiProvider();
    setAiProvider(saved);
    aiProviderRef.current = saved;
  }, []);

  function changeAiProvider(next: AiProvider) {
    setAiProvider(next);
    aiProviderRef.current = next;
    try {
      localStorage.setItem(AI_PROVIDER_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const resolveDealId = useCallback(
    (company: string) => matchDealId(company, pageData.deals),
    [pageData.deals],
  );

  const openDeal = useCallback((id: string) => {
    router.push(`/funil?deal=${id}`);
  }, [router]);

  useEffect(() => {
    const stored = loadStoredChallenge(pageData.orgId);
    if (stored && !stored.completed) {
      setActiveChallenge({
        ...stored,
        collapsed: stored.collapsed ?? true,
      });
    }
  }, [pageData.orgId]);

  useEffect(() => {
    if (!briefingDone.current && !pageData.quotaExceeded) {
      briefingDone.current = true;
      runBriefing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // useLayoutEffect fires before the browser paints — prevents browser scroll anchoring from
  // keeping the view at the bottom when the briefing content replaces the TypingIndicator
  useLayoutEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    const isBriefing = messages.length === 1 && lastMsg.role === 'assistant';
    if (isBriefing && messagesRef.current) {
      // Briefing: always show from the very top
      messagesRef.current.scrollTop = 0;
    }
  }, [messages]);

  // When AI replies to a user question: scroll so the user's question is at the top,
  // making the AI answer start immediately below it (exactly like the reference image)
  useEffect(() => {
    if (messages.length < 2) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'assistant') {
      // Small delay to let React commit the full DOM before measuring
      const t = setTimeout(() => {
        lastUserMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
      return () => clearTimeout(t);
    }
  }, [messages]);

  function getHistory(): ChatMessage[] {
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  function addMessage(role: 'user' | 'assistant', content: string) {
    setMessages((prev) => [...prev, { id: uid(), role, content }]);
  }

  function applyQuotaFromResult(result: { aiUsed: number; aiLimit: number }) {
    setAiUsed(result.aiUsed);
    setQuotaExceeded(result.aiUsed >= result.aiLimit);
  }

  function runBriefing() {
    setMessages([]);
    startTransition(async () => {
      const result = await askCeo([], 'briefing', null, aiProviderRef.current);
      if ('error' in result) {
        addMessage('assistant', result.error);
      } else {
        addMessage('assistant', result.content);
        applyQuotaFromResult(result);
      }
    });
  }

  function runChallenge(force = false) {
    if (isPending || challengeLoading || quotaExceeded) return;
    if (activeChallenge && !force) {
      const ok = window.confirm('Já existe um desafio ativo. Gerar um novo substitui o atual. Continuar?');
      if (!ok) return;
    }

    setChallengeLoading(true);
    startTransition(async () => {
      try {
        const result = await askCeo([], 'challenge', null, aiProviderRef.current);
        if ('error' in result) {
          addMessage('assistant', result.error);
          return;
        }

        const stored = buildStoredChallenge(result.content);
        if (stored) {
          saveStoredChallenge(pageData.orgId, stored);
          setActiveChallenge(stored);
        }
        addMessage('assistant', result.content);
        applyQuotaFromResult(result);
      } finally {
        setChallengeLoading(false);
      }
    });
  }

  function toggleChallengeCollapsed() {
    if (!activeChallenge) return;
    const next = {
      ...activeChallenge,
      collapsed: !(activeChallenge.collapsed === true),
    };
    saveStoredChallenge(pageData.orgId, next);
    setActiveChallenge(next);
  }

  function completeChallenge() {
    if (!activeChallenge) return;
    const done = { ...activeChallenge, completed: true };
    saveStoredChallenge(pageData.orgId, done);
    setActiveChallenge(null);
  }

  function dismissChallenge() {
    setActiveChallenge(null);
    runChallenge(true);
  }

  function sendMessage(text: string, focus: ChipFocus = null) {
    if (!text.trim() || isPending || quotaExceeded) return;
    const userMsg = text.trim();
    setInput('');
    addMessage('user', userMsg);
    const history = getHistory();
    startTransition(async () => {
      const result = await askCeo(
        [...history, { role: 'user', content: userMsg }],
        'chat',
        focus,
        aiProviderRef.current,
      );
      if ('error' in result) addMessage('assistant', result.error);
      else {
        addMessage('assistant', result.content);
        applyQuotaFromResult(result);
      }
    });
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  }

  const isEmpty = messages.length === 0 && !isPending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <CommandBar
        pageData={pageData}
        aiUsed={aiUsed}
        aiLimit={aiLimit}
        quotaExceeded={quotaExceeded}
        onBriefing={runBriefing}
        onChallenge={() => runChallenge()}
        loading={isPending}
        challengeLoading={challengeLoading}
        aiProvider={aiProvider}
        onAiProviderChange={changeAiProvider}
      />

      {activeChallenge && (
        <ChallengeCard
          challenge={activeChallenge}
          onComplete={completeChallenge}
          onDismiss={dismissChallenge}
          onToggleCollapse={toggleChallengeCollapsed}
        />
      )}

      <div className="ceo-body">
        {/* Messages */}
        <div className="ceo-messages" ref={messagesRef}>
          {isEmpty && (
            <div className="ceo-empty">
              <div className="ceo-empty-icon">🧠</div>
              <div className="ceo-empty-text">RainMaker está analisando seu pipeline…</div>
            </div>
          )}
          {messages.map((msg, i) => {
            // Attach ref to the last user message so we can scroll to it when AI responds
            const isLastUser =
              msg.role === 'user' &&
              messages.slice(i + 1).every((m) => m.role !== 'user');
            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                innerRef={isLastUser ? lastUserMsgRef : undefined}
                resolveDealId={resolveDealId}
                onOpenDeal={openDeal}
              />
            );
          })}
          {isPending && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Action bar */}
        <div className="ceo-action-bar">
          {ACTION_GROUPS.map((group, gi) => (
            <div key={group.label} className="ceo-action-group">
              <span className="ceo-action-group-label">{group.label}</span>
              <div className="ceo-action-group-chips">
                {group.chips.map((chip) => {
                  const count = chip.countKey ? pageData.classif[chip.countKey].length : null;
                  return (
                    <button
                      key={chip.id}
                      className={`ceo-action-chip ceo-action-chip--${chip.variant}`}
                      onClick={() => sendMessage(chip.prompt, chip.focus)}
                      disabled={isPending || challengeLoading || quotaExceeded}
                    >
                      <ChipIcon id={chip.id} />
                      <span>{chip.label}</span>
                      {count !== null && count > 0 && (
                        <span className="ceo-action-chip-count">{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {gi < ACTION_GROUPS.length - 1 && <div className="ceo-action-sep" />}
            </div>
          ))}
        </div>

        {/* Input area */}
        <div className="ceo-input-area">
          {quotaExceeded ? (
            <div className="ceo-quota-banner">
              Você atingiu o limite de {aiLimit} consultas de IA deste mês. Faça upgrade do plano para continuar.
            </div>
          ) : (
            <>
              <textarea
                ref={inputRef}
                className="ceo-input"
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte qualquer coisa sobre seu pipeline…"
                rows={1}
                disabled={isPending}
              />
              <button
                className="ceo-send-btn"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isPending}
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
                Enviar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
