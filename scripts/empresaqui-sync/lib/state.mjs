import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { STATE_DIR } from './env.mjs';

const STATE_FILE = resolve(STATE_DIR, 'sync-state.json');

/** @typedef {{ key: string, uf: string, municipio?: string, ibge?: number, status: 'pending'|'downloading'|'downloaded'|'upserted'|'failed', count?: number, file?: string, error?: string, updatedAt: string }} PartitionEntry */

/** @typedef {{ runId: string, uf: string, startedAt: string, partitions: PartitionEntry[] }} SyncState */

export function ensureStateDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

/** @returns {SyncState | null} */
export function loadState() {
  ensureStateDir();
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

/** @param {SyncState} state */
export function saveState(state) {
  ensureStateDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

/** @param {string} uf @param {string} municipio @param {number} [ibge] */
export function partitionKey(uf, municipio, ibge) {
  if (municipio) return `${uf}:${ibge ?? municipio}`;
  return `${uf}:__all__`;
}

/**
 * @param {SyncState} state
 * @param {string} key
 * @param {Partial<PartitionEntry>} patch
 */
export function updatePartition(state, key, patch) {
  const idx = state.partitions.findIndex((p) => p.key === key);
  const base = {
    key,
    uf: state.uf,
    status: 'pending',
    updatedAt: new Date().toISOString(),
    ...patch,
  };
  if (idx === -1) state.partitions.push(/** @type {PartitionEntry} */ (base));
  else state.partitions[idx] = { ...state.partitions[idx], ...patch, updatedAt: new Date().toISOString() };
  saveState(state);
}

/** @param {SyncState} state @param {string} key */
export function getPartition(state, key) {
  return state.partitions.find((p) => p.key === key);
}

/** @param {SyncState} state */
export function pendingPartitions(state) {
  return state.partitions.filter((p) => p.status !== 'upserted' && p.status !== 'failed');
}
