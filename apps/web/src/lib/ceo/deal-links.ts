export type DealLink = {
  id: string;
  name: string;
  title: string;
};

const UUID_SRC =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

function idMarkerRe(flags = 'i'): RegExp {
  return new RegExp(`\\[id:\\s*(${UUID_SRC})\\]`, flags);
}

/** Remove [id:uuid] markers from user-visible text (keep raw content for resolveDealId). */
export function stripDealIdMarkers(text: string): string {
  return text.replace(idMarkerRe('gi'), '').replace(/[^\S\n]{2,}/g, ' ').trim();
}

const GENERIC_PHRASE_RE =
  /\b(acompanhar de perto|verificar andamento|entrar em contato)\b/gi;

export function buildDealLinks(
  opps: Array<{
    id: string;
    title: string;
    contact_name?: string | null;
    contact_company?: string | null;
  }>,
): DealLink[] {
  return opps.map((o) => ({
    id: o.id,
    title: o.title,
    name: o.contact_company?.trim() || o.contact_name?.trim() || o.title,
  }));
}

function normalizeDealName(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(idMarkerRe('gi'), '')
    .replace(new RegExp(`id=\\s*${UUID_SRC}`, 'gi'), '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractIdMarker(text: string): string | null {
  const m = text.match(idMarkerRe('i'));
  return m?.[1]?.toLowerCase() ?? null;
}

function dealsById(deals: DealLink[]): Map<string, DealLink> {
  return new Map(deals.map((d) => [d.id.toLowerCase(), d]));
}

function resolveByName(company: string, deals: DealLink[]): string | null {
  const target = normalizeDealName(company);
  if (!target) return null;

  for (const deal of deals) {
    const name = normalizeDealName(deal.name);
    const title = normalizeDealName(deal.title);
    if (target === name || target === title) return deal.id;
  }

  for (const deal of deals) {
    const name = normalizeDealName(deal.name);
    const title = normalizeDealName(deal.title);
    if (name && (name.includes(target) || target.includes(name))) return deal.id;
    if (title && (title.includes(target) || target.includes(title))) return deal.id;
  }

  return null;
}

/** Resolve funnel deal id from company name (and optional [id:uuid] marker) shown in CEO cards. */
export function resolveDealId(company: string, deals: DealLink[]): string | null {
  if (!company || deals.length === 0) return null;

  const markerId = extractIdMarker(company);
  if (markerId) {
    const byId = dealsById(deals).get(markerId);
    if (byId) return byId.id;
  }

  return resolveByName(company, deals);
}

/**
 * Validate [id:…] markers against loaded deals; rewrite invalid ones via nearby
 * company name when possible, otherwise strip. Soft-flags a few generic phrases.
 */
export function groundAiResponse(content: string, deals: DealLink[]): string {
  if (!content) return content;

  const known = dealsById(deals);

  let out = content.replace(idMarkerRe('gi'), (full, id: string, offset: number, src: string) => {
    const key = String(id).toLowerCase();
    if (known.has(key)) return `[id:${known.get(key)!.id}]`;

    const before = src.slice(Math.max(0, offset - 140), offset);
    const bold = before.match(/\*\*([^*]+)\*\*\s*$/);
    const loose = before
      .split(/\n/)
      .pop()
      ?.replace(/^[\s•\-–—\d.]+/, '')
      .replace(/\s*[—–].*$/, '')
      .trim();
    const candidate = (bold?.[1] ?? loose ?? '').trim();
    const recovered = candidate ? resolveByName(candidate, deals) : null;
    return recovered ? `[id:${recovered}]` : '';
  });

  out = out.replace(/[^\S\n]{2,}/g, ' ');
  out = out.replace(GENERIC_PHRASE_RE, (phrase) => `⚠ genérico: ${phrase}`);

  return out;
}
