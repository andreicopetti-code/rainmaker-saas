/** @param {string | null | undefined} v */
export function digitsOnly(v) {
  if (v == null || v === '') return null;
  const d = String(v).replace(/\D/g, '');
  return d || null;
}

/** @param {string | null | undefined} v */
export function normalizeCnpj(v) {
  const d = digitsOnly(v);
  if (!d) return null;
  return d.padStart(14, '0').slice(-14);
}

/** @param {string | null | undefined} v */
export function normalizeCep(v) {
  const d = digitsOnly(v);
  if (!d) return null;
  return d.padStart(8, '0').slice(-8);
}

/** @param {string | null | undefined} v */
export function trimOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/** @param {string | null | undefined} v */
export function parseDate(v) {
  const s = trimOrNull(v);
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

/** @param {string} s */
export function slugify(s) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
