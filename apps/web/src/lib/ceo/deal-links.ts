export type DealLink = {
  id: string;
  name: string;
  title: string;
};

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
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve funnel deal id from company name shown in CEO cards. */
export function resolveDealId(company: string, deals: DealLink[]): string | null {
  const target = normalizeDealName(company);
  if (!target || deals.length === 0) return null;

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
