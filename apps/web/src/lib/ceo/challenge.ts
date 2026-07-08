export type ParsedChallenge = {
  deadline: string;
  metric: string;
  /** Frase curta com verbo no infinitivo — exibida na barra laranja recolhida. */
  summary?: string;
  action: string;
  raw: string;
};

export type StoredChallenge = ParsedChallenge & {
  savedAt: string;
  completed: boolean;
  /** Barra compacta quando true (persiste no navegador). */
  collapsed?: boolean;
};

export function challengeStorageKey(orgId: string) {
  return `ceo-brain-challenge-${orgId}`;
}

export function loadStoredChallenge(orgId: string): StoredChallenge | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(challengeStorageKey(orgId));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredChallenge;
    if (!stored.summary?.trim()) {
      stored.summary = inferChallengeSummary(stored);
    }
    return stored;
  } catch {
    return null;
  }
}

export function saveStoredChallenge(orgId: string, challenge: StoredChallenge) {
  localStorage.setItem(challengeStorageKey(orgId), JSON.stringify(challenge));
}

export function parseChallengeContent(content: string): ParsedChallenge | null {
  const deadline =
    content.match(/⏰\s*PRAZO\s*\n+([\s\S]+?)(?:\n\n|$)/)?.[1]?.trim() ??
    content.match(/⏰\s*PRAZO[:\s]+(.+?)(?:\n|$)/)?.[1]?.trim() ??
    '';
  const metric =
    content.match(/📊\s*MÉTRICA\s*\n+([\s\S]+?)(?:\n\n|$)/)?.[1]?.trim() ??
    content.match(/📊\s*MÉTRICA[:\s]+(.+?)(?:\n|$)/)?.[1]?.trim() ??
    '';
  const action =
    content.match(/🎯\s*DESAFIO\s*\n+([\s\S]+?)(?:\n\n|$)/)?.[1]?.trim() ??
    content.match(/🎯\s*DESAFIO[:\s]+(.+?)(?:\n|$)/)?.[1]?.trim() ??
    '';
  const summary =
    content.match(/📌\s*RESUMO\s*\n+([\s\S]+?)(?:\n\n|$)/)?.[1]?.trim() ??
    content.match(/📌\s*RESUMO[:\s]+(.+?)(?:\n|$)/)?.[1]?.trim() ??
    '';

  if (!metric || !action) return null;

  return {
    deadline: deadline || 'Até sexta-feira',
    metric,
    summary: summary || inferChallengeSummary({ metric, summary: '', action }),
    action,
    raw: content,
  };
}

const IMPERATIVE_INFINITIVE: Record<string, string> = {
  agende: 'Agendar',
  envie: 'Enviar',
  marque: 'Marcar',
  feche: 'Fechar',
  reative: 'Reativar',
  confirme: 'Confirmar',
  proponha: 'Propor',
  realize: 'Realizar',
  ligue: 'Ligar',
  contate: 'Contatar',
  negocie: 'Negociar',
  apresente: 'Apresentar',
  follow: 'Fazer follow-up com',
  prospecte: 'Prospectar',
  qualifique: 'Qualificar',
  avance: 'Avançar',
  converta: 'Converter',
  recupere: 'Recuperar',
};

/** Fallback para desafios salvos antes do campo RESUMO existir. */
export function inferChallengeSummary(ch: Pick<ParsedChallenge, 'metric' | 'action' | 'summary'>): string {
  if (ch.summary?.trim()) return ch.summary.trim();

  const action = ch.action.trim();
  if (action) {
    const first = action.split(/[.;!?\n]/)[0]?.trim() ?? '';
    const word = first.split(/\s+/)[0]?.toLowerCase().replace(/[,:]/g, '') ?? '';
    const mapped = IMPERATIVE_INFINITIVE[word];
    if (mapped) {
      const rest = first.slice(first.indexOf(' ') + 1).trim();
      return rest ? `${mapped} ${rest}` : mapped;
    }
    if (/^[a-záàâãéêíóôõúç]+e$/i.test(word)) {
      const stem = word.slice(0, -1);
      const rest = first.slice(first.indexOf(' ') + 1).trim();
      const inf = stem.charAt(0).toUpperCase() + stem.slice(1) + 'ar';
      return rest ? `${inf} ${rest}` : inf;
    }
  }

  const metric = ch.metric.trim();
  if (/^\d+\s+reuni/i.test(metric)) {
    return `Agendar ${metric.replace(/\s+agendadas?$/i, '').trim()}`;
  }
  if (/^\d+\s+propostas?\s+enviadas?$/i.test(metric)) {
    return `Enviar ${metric.replace(/\s+enviadas?$/i, '').trim()}`;
  }
  if (metric) return `Alcançar ${metric.charAt(0).toLowerCase()}${metric.slice(1)}`;

  return 'Concluir o desafio da semana';
}

export function getChallengeBarSummary(ch: StoredChallenge): string {
  return inferChallengeSummary(ch);
}

export function buildStoredChallenge(content: string): StoredChallenge | null {
  const parsed = parseChallengeContent(content);
  if (!parsed) return null;
  return {
    ...parsed,
    savedAt: new Date().toISOString(),
    completed: false,
    collapsed: false,
  };
}

/** Prazo sugerido (próxima sexta) para o prompt. */
export function suggestChallengeDeadlineLabel(): string {
  const now = new Date();
  const weekdayFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  });
  const labelFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });

  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    if (weekdayFmt.format(d) === 'Fri') {
      return `até ${labelFmt.format(d)}, 18h`;
    }
  }
  return 'até sexta-feira, 18h';
}
