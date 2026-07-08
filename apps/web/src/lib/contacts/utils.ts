import type { ContactData } from '@/components/board/types';

export function parseContactCustomFields(raw: unknown): ContactData['custom_fields'] {
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as ContactData['custom_fields'];
}

export function isContactPJ(
  cnpj: string | null | undefined,
  custom?: ContactData['custom_fields'],
): boolean {
  if (custom?.tipo_pessoa === 'pf') return false;
  if (custom?.tipo_pessoa === 'pj') return true;
  return Boolean(cnpj?.replace(/\D/g, '').length);
}

export function getDisplayName(
  name: string,
  company: string | null | undefined,
  isPJ: boolean,
): string {
  if (isPJ) return (company?.trim() || name?.trim() || '—');
  return name?.trim() || '—';
}

export function getInitials(displayName: string): string {
  const parts = displayName.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function formatCnpj(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length !== 14) return digits;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function formatCpf(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length !== 11) return digits;
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

export function formatDocument(
  cnpj: string | null | undefined,
  cpf: string | null | undefined,
  isPJ: boolean,
): string {
  if (isPJ) {
    const raw = cnpj?.replace(/\D/g, '') ?? '';
    return raw ? formatCnpj(raw) : '—';
  }
  const raw = cpf?.replace(/\D/g, '') ?? '';
  return raw ? formatCpf(raw) : '—';
}

export function porteMatchesFilter(filter: string, porte: string | null | undefined): boolean {
  if (!filter) return true;
  if (!porte) return false;
  const u = porte.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const f = filter.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return u.includes(f);
}

export function buildSearchHaystack(fields: (string | null | undefined)[]): string {
  return fields
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
