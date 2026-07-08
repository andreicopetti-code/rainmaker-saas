import {
  PRECOS_DIFFERENTIATORS,
  PRECOS_PLANS,
  PRECOS_ROI,
  PRECOS_TRUST_BAND,
  type PrecosPlanCopy,
} from './precos/precos-copy';

export const HOME_HERO = {
  eyebrow: 'Trial 14 dias · sem cartão · cancele quando quiser',
  title: 'Encontre clientes, organize o funil e venda mais com IA',
  subtitle:
    'CEO Brain reúne base de empresas por CNPJ, CRM visual, agenda comercial e assistente de IA — tudo em uma plataforma pensada para equipes de vendas no Brasil.',
  primaryCta: 'Começar trial gratuito',
  primaryHref: '/register',
  secondaryCta: 'Ver planos e preços',
  secondaryHref: '/precos',
};

export const HOME_STATS = [
  { value: '14 dias', label: 'de trial completo' },
  { value: '1 UF+', label: 'prospecção regional' },
  { value: 'IA', label: 'prioriza o que fechar' },
];

export const HOME_STEPS = [
  {
    step: '1',
    title: 'Crie sua conta',
    description: 'Trial de 14 dias com acesso ao plano Professional — sem cartão na entrada.',
  },
  {
    step: '2',
    title: 'Escolha sua UF e prospecte',
    description: 'Busque CNPJs, abra fichas completas e leve oportunidades para o funil.',
  },
  {
    step: '3',
    title: 'Feche com CEO Brain',
    description: 'Briefing diário, agenda integrada e equipe na mesma pipeline.',
  },
];

/** Planos em destaque na home (Starter + pagos principais). */
export const HOME_FEATURED_PLANS: PrecosPlanCopy[] = PRECOS_PLANS.filter((p) =>
  ['free', 'regional_1', 'regional_3'].includes(p.slug),
);

export const HOME_FINAL_CTA = {
  title: 'Pronto para acelerar suas vendas?',
  subtitle: 'Comece grátis hoje ou compare os planos pagos em detalhe.',
  trialCta: 'Iniciar trial de 14 dias',
  trialHref: '/register',
  pricingCta: 'Comparar planos',
  pricingHref: '/precos',
};

export { PRECOS_TRUST_BAND, PRECOS_ROI, PRECOS_DIFFERENTIATORS };
