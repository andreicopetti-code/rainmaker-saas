export const BRAZILIAN_UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

/** Opções de origem do lead (filtro da agenda). */
export const CONTACT_ORIGINS = [
  'Indicação',
  'Site / Blog',
  'Cold Call',
  'LinkedIn',
  'WhatsApp',
  'Instagram',
  'Evento / Feira',
  'Google Ads',
  'Parceiro',
  'Consulta CNPJ',
  'Outros',
] as const;

export const PORTE_FILTER_OPTIONS = [
  { value: 'MEI', label: 'MEI' },
  { value: 'Micro', label: 'Micro Empresa' },
  { value: 'Pequena', label: 'Pequena Empresa' },
  { value: 'Média', label: 'Média Empresa' },
  { value: 'Grande', label: 'Grande Empresa' },
] as const;

export type ContactSort = 'az' | 'za' | 'value-desc' | 'value-asc';
export type ContactTypeFilter = '' | 'pj' | 'pf';
