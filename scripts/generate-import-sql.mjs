import fs from 'fs';
import path from 'path';

const jsonPath = process.argv[2] || path.join(process.cwd(), 'scripts/import-data/negociacoes-legacy.json');
const outSql = process.argv[3] || path.join(process.cwd(), 'scripts/import-data/import-legacy.sql');

const ORG_ID = '19a2d40b-36ea-4668-8941-6496ecf7df67';
const FUNNEL_ID = 'f6ff0447-3d5d-4d66-88d4-ac434a01b578';
const USER_ID = '78524d79-66ad-413e-ad69-9f09bf23d45c';

const STAGE_PROB = {
  LEADS: 10,
  QUALIFICADO: 25,
  'REUNIÃO': 45,
  PROPOSTA_ENVIADA: 65,
  'NEGOCIAÇÃO': 80,
  GANHO: 100,
  PERDIDO: 0,
};

function sqlStr(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlJson(obj) {
  return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}

const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const cards = payload.cards;

const lines = [
  '-- Import legacy CEO Brain deals',
  'BEGIN;',
  '',
  `-- Soft-delete existing deals in funnel`,
  `UPDATE opportunities SET deleted_at = now(), updated_at = now()`,
  `WHERE organization_id = '${ORG_ID}' AND funnel_id = '${FUNNEL_ID}' AND deleted_at IS NULL;`,
  '',
  `UPDATE contacts SET deleted_at = now(), updated_at = now()`,
  `WHERE organization_id = '${ORG_ID}' AND deleted_at IS NULL`,
  `AND id IN (`,
  `  SELECT contact_id FROM opportunities`,
  `  WHERE organization_id = '${ORG_ID}' AND funnel_id = '${FUNNEL_ID}'`,
  `);`,
  '',
];

for (const card of cards) {
  const title = card.fantasia?.trim() || card.name?.trim();
  const stage = card.column || 'LEADS';
  const prob = STAGE_PROB[stage] ?? 50;
  const value = card.value && card.value > 0 ? card.value : null;
  const isPJ = card.type === 'empresa';
  const contactCf = {
    tipo_pessoa: isPJ ? 'pj' : 'pf',
    cpf: card.cpf || null,
    contact_person: card.contact || null,
    municipio: card.municipio || null,
    uf: card.uf || null,
  };
  const oppCf = { tier: card.tier || null, lead_source: null };

  lines.push(`DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN`);
  lines.push(`  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)`);
  lines.push(`  VALUES (`);
  lines.push(`    cid, '${ORG_ID}', ${sqlStr(card.name?.trim() || title)}, ${sqlStr(card.fantasia?.trim() || null)},`);
  lines.push(`    ${sqlStr(card.cnpj || null)}, ${sqlStr(card.email || null)}, ${sqlStr(card.phone || null)},`);
  lines.push(`    ${sqlStr(card.contact || null)}, '${USER_ID}', ${sqlJson(contactCf)}`);
  lines.push(`  );`);
  lines.push(`  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)`);
  lines.push(`  VALUES (`);
  lines.push(`    '${FUNNEL_ID}', '${ORG_ID}', ${sqlStr(title)}, ${sqlStr(stage)},`);
  lines.push(`    ${value === null ? 'NULL' : value}, ${prob}, ${sqlStr(card.note || null)},`);
  lines.push(`    '${USER_ID}', cid, ${sqlJson(oppCf)}`);
  lines.push(`  );`);
  lines.push(`END $$;`);
  lines.push('');
}

lines.push('COMMIT;');

fs.writeFileSync(outSql, lines.join('\n'));
console.log(`Generated SQL for ${cards.length} cards -> ${outSql}`);
