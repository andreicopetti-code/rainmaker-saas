import type { AddonSlug, PlanSlug } from '@ceo-brain/shared';

export type PrecosPlanCopy = {
  slug: PlanSlug;
  featured?: boolean;
  badge?: string;
  name: string;
  scope?: string;
  description: string;
  priceAmount?: string;
  priceSuffix?: string;
  priceDaily?: string;
  annualPrice?: string;
  annualSavings?: string;
  checklist: string[];
  cta: string;
  ctaHref: string;
  ctaVariant: 'primary' | 'ghost';
};

export const PRECOS_HEADER = {
  title: 'Encontre seus próximos clientes com Inteligência Artificial',
  subtitle:
    'O RainMaker reúne prospecção inteligente, CRM, gestão comercial e Inteligência Artificial em uma única plataforma para acelerar suas vendas.',
  benefits: [
    'Base nacional de empresas',
    'CRM inteligente',
    'IA especializada em vendas',
    'Teste gratuito por 14 dias',
  ],
};

export const PRECOS_PLANS: PrecosPlanCopy[] = [
  {
    slug: 'free',
    name: 'Starter',
    description: 'Ideal para conhecer a plataforma e iniciar sua prospecção.',
    priceAmount: 'Grátis',
    checklist: [
      'Explore a base nacional de empresas',
      'Acesse até 3 empresas qualificadas por mês',
      'Até 5 empresas no funil',
      'CRM inteligente integrado',
      'Dashboard comercial para acompanhar resultados',
      'Agenda comercial inteligente',
      'Use a plataforma com 1 usuário',
      'Até 30 análises comerciais com IA por mês',
    ],
    cta: 'Criar conta grátis',
    ctaHref: '/register',
    ctaVariant: 'ghost',
  },
  {
    slug: 'regional_1',
    name: 'Professional',
    scope: 'Atuação em 1 estado',
    description: 'Ideal para consultores, representantes comerciais e pequenas equipes.',
    priceAmount: 'R$99',
    priceSuffix: '/mês',
    priceDaily: 'Menos de R$ 3 por dia.',
    annualPrice: 'ou R$ 990/ano',
    annualSavings: '198',
    checklist: [
      'Escolha qualquer estado do Brasil para prospectar',
      'Acesse até 20 empresas qualificadas por dia',
      'Gerencie até 500 oportunidades no funil',
      'CRM inteligente integrado',
      'Dashboard comercial para acompanhar resultados',
      'Agenda comercial inteligente',
      'Sincronização automática com seu e-mail',
      'Compartilhe a plataforma com até 3 usuários',
      'Até 200 análises comerciais com IA por mês',
    ],
    cta: 'Começar teste gratuito',
    ctaHref: '/billing?plan=regional_1',
    ctaVariant: 'primary',
  },
  {
    slug: 'regional_3',
    featured: true,
    badge: '⭐⭐ Mais escolhido pelos clientes',
    name: 'Growth',
    scope: 'Atuação em até 3 estados',
    description: 'Perfeito para empresas que estão expandindo sua atuação comercial.',
    priceAmount: 'R$249',
    priceSuffix: '/mês',
    priceDaily: 'Menos de R$ 8 por dia.',
    annualPrice: 'ou R$ 2.490/ano',
    annualSavings: '498',
    checklist: [
      'Escolha até 3 estados do Brasil para prospectar',
      'Acesse até 50 empresas qualificadas por dia',
      'Gerencie até 2.000 oportunidades no funil',
      'CRM inteligente integrado',
      'Dashboard comercial para acompanhar resultados',
      'Agenda comercial inteligente',
      'Sincronização automática com seu e-mail',
      'Compartilhe a plataforma com até 8 usuários',
      'Até 500 análises comerciais com IA por mês',
      'Importe sua carteira de clientes',
    ],
    cta: 'Começar teste gratuito',
    ctaHref: '/billing?plan=regional_3',
    ctaVariant: 'primary',
  },
  {
    slug: 'nacional',
    name: 'Enterprise',
    scope: 'Cobertura nacional',
    description: 'Cobertura completa do Brasil para equipes comerciais de alta performance.',
    priceAmount: 'R$399',
    priceSuffix: '/mês',
    priceDaily: 'Menos de R$ 13 por dia.',
    annualPrice: 'ou R$ 3.990/ano',
    annualSavings: '798',
    checklist: [
      'Prospecte em todo o Brasil',
      'Acesse até 80 empresas qualificadas por dia',
      'Gerencie oportunidades praticamente ilimitadas no funil',
      'CRM inteligente integrado',
      'Dashboard comercial para acompanhar resultados',
      'Agenda comercial inteligente',
      'Sincronização automática com seu e-mail',
      'Compartilhe a plataforma com até 15 usuários',
      'Até 1.000 análises comerciais com IA por mês',
      'Suporte prioritário para escalar vendas',
    ],
    cta: 'Começar teste gratuito',
    ctaHref: '/billing?plan=nacional',
    ctaVariant: 'primary',
  },
];

export const PRECOS_TRUST_BAND = [
  '🔒 Pagamento 100% seguro',
  '🚀 Ativação imediata',
  '📅 Teste gratuito por 14 dias',
  '❌ Cancele quando quiser',
];

export const PRECOS_ROI = {
  title: 'Um único cliente pode pagar seu investimento.',
  text: 'Se um novo contrato gerar mais receita do que sua mensalidade, o RainMaker já se pagou. Nossa missão é ajudar você a conquistar esse próximo cliente mais rapidamente.',
};

export const PRECOS_DIFFERENTIATORS = {
  title: 'Por que o RainMaker é diferente?',
  items: [
    {
      title: 'Base nacional integrada',
      description: 'Nunca mais compre listas de empresas de terceiros.',
    },
    {
      title: 'IA Comercial',
      description: 'Receba análises inteligentes para priorizar oportunidades.',
    },
    {
      title: 'CRM completo',
      description: 'Gerencie todo o relacionamento comercial em um único lugar.',
    },
    {
      title: 'Escalabilidade',
      description: 'Comece em um estado e expanda para todo o Brasil quando quiser.',
    },
  ],
};

export const PRECOS_VALUE_PROPS = {
  title: 'Tudo o que você precisa para vender mais',
  items: [
    'Base nacional de empresas atualizada',
    'CRM completo e intuitivo',
    'Pipeline de vendas visual',
    'Agenda integrada',
    'Inteligência Artificial especializada em vendas',
    'Integração com e-mail',
    'Equipe colaborativa',
    'Segurança e armazenamento em nuvem',
  ],
};

export const PRECOS_ADDONS = {
  title: 'Expanda sua capacidade quando precisar',
  description: 'Amplie sua atuação comercial sem trocar de plano.',
};

export const PRECOS_ADDON_NAMES: Record<AddonSlug, string> = {
  uf_extra: 'Adicionar mais um estado',
  pack_50: 'Crédito adicional para 50 empresas',
  pack_200: 'Crédito adicional para 200 empresas',
};

export const PRECOS_FAQ = [
  {
    question: 'Posso cancelar quando quiser?',
    answer: 'Sim. Não existe fidelidade.',
  },
  {
    question: 'Como funciona o teste gratuito?',
    answer: 'Você terá acesso completo durante o período de avaliação.',
  },
  {
    question: 'Posso trocar de plano depois?',
    answer: 'Sim. O upgrade ou downgrade pode ser feito a qualquer momento.',
  },
  {
    question: 'Meus dados ficam seguros?',
    answer: 'Sim. Todos os dados são armazenados em infraestrutura segura.',
  },
  {
    question: 'Posso importar meus clientes?',
    answer: 'Sim. Os planos pagos permitem importar sua carteira atual.',
  },
];

export const PRECOS_MATRIX_HEADERS: Record<PlanSlug, string> = {
  free: 'Starter',
  regional_1: 'Professional',
  regional_3: 'Growth',
  nacional: 'Enterprise',
};

export const PRECOS_FEATURED_PLAN: PlanSlug = 'regional_3';
