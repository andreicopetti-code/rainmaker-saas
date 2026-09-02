import { createReadStream, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { parse } from 'csv-parse';
import { parse as parseSync } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

/**
 * @param {string} filePath
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseEmpresaquiFile(filePath) {
  const ext = extname(filePath).toLowerCase();

  if (ext === '.xlsx' || ext === '.xls') {
    return parseXlsx(filePath);
  }

  return parseCsv(filePath);
}

/**
 * @param {string} filePath
 */
function parseCsv(filePath) {
  const raw = readFileSync(filePath);
  const text = decodeCsvBuffer(raw);

  const records = parseSync(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
    delimiter: detectDelimiter(text),
  });

  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  return { headers, rows: records };
}

/**
 * @param {Buffer} buf
 */
function decodeCsvBuffer(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString('utf8');
  }
  const asUtf8 = buf.toString('utf8');
  if (!asUtf8.includes('\ufffd')) return asUtf8;
  return buf.toString('latin1');
}

/** @param {string} filePath */
function detectDelimiterFromFile(filePath) {
  const sample = readFileSync(filePath).subarray(0, 8192);
  const text = decodeCsvBuffer(sample);
  return detectDelimiter(text);
}

/**
 * Processa CSV em lotes sem carregar o arquivo inteiro na memória.
 * @param {string} filePath
 * @param {number} batchSize
 * @param {(headers: string[], rows: Record<string, string>[]) => Promise<void>} onBatch
 */
export async function forEachCsvBatch(filePath, batchSize, onBatch) {
  const delimiter = detectDelimiterFromFile(filePath);
  /** @type {string[] | null} */
  let headers = null;
  /** @type {Record<string, string>[]} */
  let batch = [];

  const parser = createReadStream(filePath).pipe(parse({
    bom: true,
    columns: true,
    delimiter,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    max_record_size: 0,
  }));

  for await (const row of parser) {
    if (!headers) headers = Object.keys(row);
    batch.push(row);
    if (batch.length >= batchSize) {
      await onBatch(headers ?? [], batch);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await onBatch(headers ?? [], batch);
  }
}

/** @param {string} sample */
function detectDelimiter(sample) {
  const firstLine = sample.split(/\r?\n/)[0] ?? '';
  const scores = [
    [';', (firstLine.match(/;/g) ?? []).length],
    [',', (firstLine.match(/,/g) ?? []).length],
    ['\t', (firstLine.match(/\t/g) ?? []).length],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : ';';
}

/**
 * @param {string} filePath
 */
function parseXlsx(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  /** @type {Record<string, string>[]} */
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const normalized = rows.map((row) => {
    /** @type {Record<string, string>} */
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').trim();
    }
    return out;
  });
  return { headers, rows: normalized };
}
