import type { FunnelStageConfig } from '@/lib/funnel/stage-config';
import type { LegacyCard } from './legacy-card';
import { legacyStageLabel } from './legacy-card';

const CSV_HEADERS = [
  'id', 'tipo', 'razao_social', 'nome_fantasia', 'cnpj', 'cpf', 'contato',
  'telefone', 'email', 'municipio', 'uf', 'valor', 'etapa', 'observacao',
] as const;

function escapeCsv(value: unknown): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function cardsToCsv(cards: LegacyCard[], stageConfig: FunnelStageConfig[]): string {
  const rows = cards.map((c) => [
    c.id,
    c.type === 'empresa' ? 'PJ' : 'PF',
    c.name ?? '',
    c.fantasia ?? '',
    c.cnpj ?? '',
    c.cpf ?? '',
    c.contact ?? '',
    c.phone ?? '',
    c.email ?? '',
    c.municipio ?? '',
    c.uf ?? '',
    c.value ?? 0,
    legacyStageLabel(c, stageConfig),
    c.note ?? '',
  ].map(escapeCsv).join(','));

  return [CSV_HEADERS.join(','), ...rows].join('\n');
}

/** Parser de linha CSV com aspas — igual ao HTML original. */
export function parseCsvRow(row: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQ && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === ',' && !inQ) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

export function parseCardsFromCsv(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const hdr = parseCsvRow(lines[0]).map((h) => h.replace(/"/g, '').trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvRow(lines[i]);
    const obj: Record<string, string> = {};
    hdr.forEach((h, idx) => {
      obj[h] = vals[idx]?.trim() ?? '';
    });
    rows.push(obj);
  }

  return rows;
}

export function csvRowToLegacyCard(row: Record<string, string>, index: number): import('./legacy-card').LegacyCard {
  const tipo = (row.tipo ?? row.type ?? 'PJ').toUpperCase();
  const valueRaw = (row.valor ?? row.value ?? '0').replace(',', '.');
  return {
    id: row.id || `import-${Date.now()}-${index}`,
    type: tipo === 'PJ' || tipo === 'EMPRESA' ? 'empresa' : 'cliente',
    name: row.razao_social || row.name || row.nome || '',
    fantasia: row.nome_fantasia || row.fantasia || '',
    cnpj: (row.cnpj ?? '').replace(/\D/g, ''),
    cpf: (row.cpf ?? '').replace(/\D/g, ''),
    contact: row.contato || row.contact || '',
    phone: row.telefone || row.phone || '',
    email: row.email || '',
    municipio: row.municipio || '',
    uf: (row.uf ?? '').toUpperCase(),
    value: parseFloat(valueRaw) || 0,
    column: row.etapa || row.column || row.stage || '',
    note: row.observacao || row.note || row.descricao || '',
  };
}

export function withBom(csv: string): string {
  return `\uFEFF${csv}`;
}

export function dateTag(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
