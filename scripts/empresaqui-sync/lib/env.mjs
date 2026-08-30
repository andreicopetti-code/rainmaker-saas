import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const WEB_ENV = resolve(ROOT, 'apps/web/.env.local');
const LOCAL_ENV = resolve(__dirname, '../.env');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const vars = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

const fileEnv = { ...loadEnvFile(WEB_ENV), ...loadEnvFile(LOCAL_ENV) };

export function env(name, fallback = '') {
  return process.env[name] || fileEnv[name] || fallback;
}

export function requireEnv(name) {
  const val = env(name);
  if (!val) {
    throw new Error(`Variável obrigatória ausente: ${name} (apps/web/.env.local ou scripts/empresaqui-sync/.env)`);
  }
  return val;
}

export function getSupabaseConfig({ preferProd = false } = {}) {
  if (preferProd || env('SUPABASE_TARGET') === 'prod') {
    return {
      url: requireEnv('PROD_SUPABASE_URL'),
      serviceRoleKey: requireEnv('PROD_SUPABASE_SERVICE_ROLE_KEY'),
    };
  }
  return {
    url: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function getEmpresaquiCredentials() {
  return {
    email: requireEnv('EMPRESAQUI_EMAIL'),
    password: requireEnv('EMPRESAQUI_PASSWORD'),
  };
}

export const SYNC_ROOT = resolve(__dirname, '..');
export const DOWNLOADS_DIR = resolve(SYNC_ROOT, 'downloads');
export const STATE_DIR = resolve(SYNC_ROOT, 'state');
export const AUTH_STATE_PATH = resolve(SYNC_ROOT, '.auth', 'empresaqui.json');
