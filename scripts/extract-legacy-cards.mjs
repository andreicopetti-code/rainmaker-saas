import fs from 'fs';
import path from 'path';

const htmlPath = process.argv[2] || 'C:/Users/Andrei Copetti/Desktop/ceo_brain.html';
const outPath = process.argv[3] || path.join(process.cwd(), 'scripts/import-data/negociacoes-legacy.json');

const html = fs.readFileSync(htmlPath, 'utf8');

const STAGE_MAP = {
  leads: 'LEADS',
  qualificado: 'QUALIFICADO',
  reunião: 'REUNIÃO',
  reuniao: 'REUNIÃO',
  proposta: 'PROPOSTA_ENVIADA',
  negociação: 'NEGOCIAÇÃO',
  negociacao: 'NEGOCIAÇÃO',
  ganho: 'GANHO',
  perdido: 'PERDIDO',
};

const TIER_MAP = {
  pequeno: 'P',
  médio: 'M',
  medio: 'M',
  grande: 'G',
  estratégico: 'E',
  estrategico: 'E',
};

function decodeHtml(s) {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function cleanCell(s) {
  const v = decodeHtml(s);
  return v === '—' || v === '-' ? '' : v;
}

function parseCityUf(raw) {
  const parts = raw.split('/').map((p) => p.trim());
  if (parts.length >= 2) {
    return { municipio: parts[0], uf: parts[parts.length - 1].slice(0, 2) };
  }
  return { municipio: raw.trim(), uf: '' };
}

/** Board cards: id -> { column, tier } */
function parseBoardCards(source) {
  const map = new Map();
  const colRegex = /id="col-([^"]+)"[\s\S]*?<div class="col-cards">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="column"/g;
  let colMatch;
  while ((colMatch = colRegex.exec(source)) !== null) {
    const column = colMatch[1];
    const cardsHtml = colMatch[2];
    const cardRegex = /id="card-(\d+)"[\s\S]*?(?:tier-label-badge[^>]*>([^<]+)<|card-value-inline[^>]*>([^<]+)<)/g;
    let m;
    while ((m = cardRegex.exec(cardsHtml)) !== null) {
      const id = Number(m[1]);
      const tierText = (m[2] || '').trim().toLowerCase();
      const valueText = (m[3] || '').trim();
      let tier;
      if (tierText) tier = TIER_MAP[tierText];
      let value = 0;
      if (valueText) {
        const digits = valueText.replace(/[^\d,]/g, '').replace(',', '.');
        value = parseFloat(digits) || 0;
      }
      map.set(id, { column, tier, value });
    }
  }

  // Last columns (GANHO, PERDIDO) — no following column
  const tailRegex = /id="col-(GANHO|PERDIDO)"[\s\S]*?<div class="col-cards">([\s\S]*?)<\/div>\s*<\/div><\/div>/g;
  while ((colMatch = tailRegex.exec(source)) !== null) {
    const column = colMatch[1];
    const cardsHtml = colMatch[2];
    const cardRegex = /id="card-(\d+)"[\s\S]*?(?:tier-label-badge[^>]*>([^<]+)<|card-value-inline[^>]*>([^<]+)<)/g;
    let m;
    while ((m = cardRegex.exec(cardsHtml)) !== null) {
      const id = Number(m[1]);
      const tierText = (m[2] || '').trim().toLowerCase();
      const valueText = (m[3] || '').trim();
      map.set(id, {
        column,
        tier: tierText ? TIER_MAP[tierText] : undefined,
        value: valueText ? parseFloat(valueText.replace(/[^\d,]/g, '').replace(',', '.')) || 0 : 0,
      });
    }
  }

  return map;
}

function parseContactRows(source) {
  const rows = [];
  const rowRegex = /<div class="contact-row" onclick="openEditCard\((\d+)\);[\s\S]*?<\/div>\s*(?=<\/div><div class="alpha-group">|<\/div>\s*<\/div><div class="contacts-panel"|$)/g;
  const chunks = [...source.matchAll(/<div class="contact-row" onclick="openEditCard\((\d+)\);[\s\S]*?<span class="contact-stage"[^>]*>([^<]*)<\/span>\s*<\/div>/g)];

  for (const m of chunks) {
    const block = m[0];
    const id = Number(m[1]);
    const stageLabel = decodeHtml(m[2]).toLowerCase();
    const column = STAGE_MAP[stageLabel] || 'LEADS';

    const nameMatch = block.match(/class="contact-name">([\s\S]*?)<\/div>/);
    const subMatch = block.match(/class="contact-sub">([\s\S]*?)<\/div>/);
    const cells = [...block.matchAll(/class="contact-cell(?: contact-mono)?">([\s\S]*?)<\/div>/g)].map((c) => cleanCell(c[1]));

    const nameBlock = nameMatch ? decodeHtml(nameMatch[1].replace(/<span[\s\S]*?<\/span>/g, '')) : '';
    const fantasia = nameBlock;
    const razao = subMatch ? decodeHtml(subMatch[1]) : nameBlock;
    const cnpj = cells[0]?.replace(/\D/g, '') || '';
    const contact = cells[1] || '';
    const phone = cells[2] || '';
    const email = cells[3] || '';
    const cityRaw = cells[4] || '';
    const { municipio, uf } = parseCityUf(cityRaw);

    const isPJ = block.includes('PJ') || !!cnpj;

    rows.push({
      id,
      type: isPJ ? 'empresa' : 'cliente',
      name: razao || fantasia,
      fantasia: fantasia !== razao ? fantasia : razao,
      cnpj: cnpj || undefined,
      contact: contact !== 'Ver Decisor' && contact !== 'Ver decisor' ? contact : undefined,
      phone: phone || undefined,
      email: email || undefined,
      municipio: municipio || undefined,
      uf: uf || undefined,
      column,
      value: 0,
      note: '',
      appointments: [],
    });
  }

  return rows;
}

const boardMap = parseBoardCards(html);
const contacts = parseContactRows(html);

const cards = contacts.map((c) => {
  const board = boardMap.get(c.id);
  return {
    ...c,
    column: board?.column || c.column,
    tier: board?.tier,
    value: board?.column === 'GANHO' ? (board?.value ?? 0) : 0,
  };
});

const payload = {
  version: 1,
  exported: new Date().toISOString(),
  source: htmlPath,
  cards,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

console.log(`Extracted ${cards.length} cards -> ${outPath}`);
console.log('By stage:', Object.fromEntries(
  [...cards.reduce((m, c) => m.set(c.column, (m.get(c.column) || 0) + 1), new Map())],
));
