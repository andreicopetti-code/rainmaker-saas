import { REGIMES_TRIBUTARIOS, SETORES } from '@/components/board/types';
import type { EmpresaDetail } from '@/app/empresas/actions';

type RegimeEntry = { year: string; val: string };

export function parseSocios(socios: string | null): string[] {
  if (!socios?.trim()) return [];
  if (socios.includes(';') || socios.includes('|')) {
    return socios.split(/[;|]+/).map((s) => s.trim()).filter((s) => s.length > 1);
  }
  return socios
    .split(/-(?=[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÇ])/)
    .map((s) => s.replace(/-$/, '').trim())
    .filter((s) => s.length > 1);
}

const PJ_NAME_PATTERNS = [
  /\bLTDA\.?\b/,
  /\bS\.?\/?A\.?\b/,
  /\bEIRELI\b/,
  /\bE\.?\/?P\.?\b/,
  /\bHOLDING\b/,
  /\bPARTICIPACOES\b/,
  /\bPARTICIPAÇÕES\b/,
  /\bINVESTIMENTOS\b/,
  /\bCIA\b/,
  /\bCOOPERATIVA\b/,
  /\bASSOCIACAO\b/,
  /\bASSOCIAÇÃO\b/,
  /\bFUNDACAO\b/,
  /\bFUNDAÇÃO\b/,
  /\bINSTITUTO\b/,
  /\bCONSORCIO\b/,
  /\bCONSÓRCIO\b/,
];

export function isSocioPessoaJuridica(name: string): boolean {
  const u = name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return PJ_NAME_PATTERNS.some((p) => p.test(u));
}

/** Primeiro sócio pessoa física; se não houver, usa o primeiro da lista. */
export function pickSocioPessoaFisica(socios: string[]): string {
  return socios.find((s) => !isSocioPessoaJuridica(s)) ?? socios[0] ?? '';
}

function normalizeRegimeVal(txt: string): string {
  const t = txt.trim().replace(/;$/, '').trim();
  const u = t.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (u.includes('MEI')) return 'MEI';
  if (u.includes('SIMPLES') || u.includes(' SN ')) return 'Simples Nacional';
  if (u.includes('PRESUMIDO')) return 'Lucro Presumido';
  if (u.includes('REAL') && !u.includes('PRESUMIDO')) return 'Lucro Real';
  if (u.includes('ARBITRADO')) return 'Lucro Arbitrado';
  if (u.includes('IMUNE') || u.includes('ISENTO')) return 'Imune / Isento';
  return t;
}

export function parseRegimeHistorico(raw: string | null): RegimeEntry[] | string | null {
  if (!raw?.trim()) return null;

  const anoMatches = raw.match(/ANO\s+(\d{4})\s+[^;]+/gi);
  if (anoMatches?.length) {
    const parsed = anoMatches
      .map((m) => {
        const p = m.match(/ANO\s+(\d{4})\s+(.+)/i);
        return p ? { year: p[1], val: normalizeRegimeVal(p[2]) } : null;
      })
      .filter(Boolean) as RegimeEntry[];
    if (parsed.length) return parsed.sort((a, b) => Number(b.year) - Number(a.year));
  }

  const parts = raw.split(/[;|/\n]+/).map((s) => s.trim()).filter(Boolean);
  const parsed = parts
    .map((p) => {
      const m = p.match(/(\d{4})\s*[-–:]\s*(.+)/);
      return m ? { year: m[1], val: normalizeRegimeVal(m[2]) } : null;
    })
    .filter(Boolean) as RegimeEntry[];
  if (parsed.length) return parsed.sort((a, b) => Number(b.year) - Number(a.year));

  return raw.trim();
}

/** Regime do ano mais recente, mapeado para opções do cadastro. */
export function getRegimeTributarioAtual(
  regimeTributario: string | null,
  regimeHistorico: string | null,
): string {
  const parsed = parseRegimeHistorico(regimeHistorico || regimeTributario);
  let raw = '';

  if (Array.isArray(parsed) && parsed.length) {
    raw = parsed[0].val;
  } else if (typeof parsed === 'string') {
    raw = normalizeRegimeVal(parsed);
  } else if (regimeTributario?.trim()) {
    raw = normalizeRegimeVal(regimeTributario);
  }

  if (!raw) return '';

  const allowed = REGIMES_TRIBUTARIOS as readonly string[];
  const exact = allowed.find((r) => r.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;

  const u = raw.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (u.includes('MEI')) return 'MEI';
  if (u.includes('SIMPLES')) return 'Simples Nacional';
  if (u.includes('PRESUMIDO')) return 'Lucro Presumido';
  if (u.includes('REAL')) return 'Lucro Real';
  if (u.includes('ARBITRADO')) return 'Lucro Arbitrado';
  if (u.includes('IMUNE') || u.includes('ISENTO')) return 'Imune / Isento';

  return raw;
}

export function buildEndereco(empresa: Pick<EmpresaDetail, 'endereco' | 'bairro'>): string {
  const parts: string[] = [];
  if (empresa.endereco?.trim()) parts.push(empresa.endereco.trim());
  if (empresa.bairro?.trim()) parts.push(empresa.bairro.trim());
  return parts.join(', ');
}

export function mapPorteEmpresa(porte: string | null): string {
  if (!porte?.trim()) return '';
  const u = porte.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (u.includes('MEI')) return 'MEI (até R$ 81 mil/ano)';
  if (u.includes('MICRO') || u === 'ME' || u.includes('EPP')) return 'Micro Empresa (até R$ 360 mil/ano)';
  if (u.includes('PEQUEN')) return 'Pequena Empresa (até R$ 4,8 mi/ano)';
  if (u.includes('MEDIO') || u.includes('MEDIA')) return 'Média Empresa (até R$ 300 mi/ano)';
  if (u.includes('GRANDE') || u.includes('DEMAIS')) return 'Grande Empresa (acima de R$ 300 mi/ano)';

  return porte.trim();
}

export function mapSetorEmpresa(segmento: string | null, cnaeDescricao: string | null): string {
  const candidates = [segmento, cnaeDescricao].filter(Boolean) as string[];
  const setores = SETORES as readonly string[];

  for (const c of candidates) {
    const lower = c.toLowerCase();
    const exact = setores.find((s) => s.toLowerCase() === lower);
    if (exact) return exact;
    const partial = setores.find(
      (s) => lower.includes(s.toLowerCase()) || s.toLowerCase().includes(lower),
    );
    if (partial) return partial;
  }

  const desc = (cnaeDescricao || segmento || '').toLowerCase();
  if (/transport|logist|frete|cargo/.test(desc)) return 'Logística e Transporte';
  if (/comercio varej|varejist|loja|supermerc/.test(desc)) return 'Comércio Varejista';
  if (/comercio atac|atacad|distribui/.test(desc)) return 'Comércio Atacadista';
  if (/industr|fabric|manufat/.test(desc)) return 'Indústria';
  if (/construc|engenharia civil|obras/.test(desc)) return 'Construção Civil';
  if (/saude|hospital|clinic|medic/.test(desc)) return 'Saúde';
  if (/educac|ensino|escola/.test(desc)) return 'Educação';
  if (/tech|software|informatica|digital/.test(desc)) return 'Tecnologia';
  if (/hotel|turismo|hosped/.test(desc)) return 'Hotelaria e Turismo';
  if (/agroneg|agricult|pecuaria/.test(desc)) return 'Agronegócio';
  if (/aliment|bebida|restaur/.test(desc)) return 'Alimentação e Bebidas';
  if (/financ|banco|credito/.test(desc)) return 'Financeiro';
  if (/energia|eletric|gas/.test(desc)) return 'Energia e Utilities';

  return segmento?.trim() ?? '';
}

export function buildDealDescription(empresa: EmpresaDetail): string | null {
  const lines: string[] = [];

  if (empresa.cnae_codigo || empresa.cnae_descricao) {
    lines.push(
      `CNAE: ${empresa.cnae_codigo ?? '—'}${empresa.cnae_descricao ? ` — ${empresa.cnae_descricao}` : ''}`,
    );
  }
  if (empresa.faturamento_est?.trim()) lines.push(`Faturamento est.: ${empresa.faturamento_est.trim()}`);
  if (empresa.funcionarios?.trim()) lines.push(`Funcionários: ${empresa.funcionarios.trim()}`);
  if (empresa.data_inicio?.trim()) lines.push(`Início das atividades: ${empresa.data_inicio.trim()}`);

  return lines.length ? lines.join('\n') : null;
}

export type EmpresaContactPayload = {
  name: string;
  company: string;
  cnpj: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  custom_fields: {
    tipo_pessoa: 'pj';
    situacao: string | null;
    endereco: string | null;
    municipio: string | null;
    uf: string | null;
    cep: string | null;
    setor: string | null;
    regime_tributario: string | null;
    porte: string | null;
    contact_person: string | null;
  };
};

export function buildContactFromEmpresa(empresa: EmpresaDetail): EmpresaContactPayload {
  const raw = empresa.cnpj.replace(/\D/g, '');
  const razao = empresa.razao_social?.trim() || '';
  const fantasia = empresa.nome_fantasia?.trim() || '';
  const title = fantasia || razao || raw;

  const socios = parseSocios(empresa.socios);
  const socioPf = pickSocioPessoaFisica(socios);

  return {
    name: razao || title,
    company: fantasia || razao || title,
    cnpj: raw,
    email: empresa.email?.trim() || null,
    phone: empresa.telefone?.trim() || null,
    position: socioPf ? 'Sócio' : null,
    custom_fields: {
      tipo_pessoa: 'pj',
      situacao: empresa.situacao?.trim() || null,
      endereco: buildEndereco(empresa) || null,
      municipio: empresa.cidade?.trim() || null,
      uf: empresa.estado?.trim().toUpperCase() || null,
      cep: empresa.cep?.replace(/\D/g, '') || null,
      setor: mapSetorEmpresa(empresa.segmento ?? null, empresa.cnae_descricao) || null,
      regime_tributario: getRegimeTributarioAtual(empresa.regime_tributario, empresa.regime_historico) || null,
      porte: mapPorteEmpresa(empresa.porte) || null,
      contact_person: socioPf || null,
    },
  };
}
