/** Slugs estáveis — usados em DB (features.slug), Stripe metadata e checkout. */
export type PlanSlug = 'free' | 'regional_1' | 'regional_3' | 'nacional';

export type AddonSlug = 'uf_extra' | 'pack_50' | 'pack_200';

export type PricingPlanLimits = {
  max_deals: number;
  max_members: number;
  ai_monthly: number;
  /** Fichas completas por mês (Free). */
  ficha_monthly: number | null;
  /** Fichas completas por dia (planos pagos). */
  ficha_daily: number | null;
  /** Quantidade de UFs incluídas (0 = só preview; 27 = nacional). */
  allowed_ufs: number;
  emails_enabled: boolean;
  ceo_brain_enabled: boolean;
  import_enabled: boolean;
};

export type PlanDefinition = {
  slug: PlanSlug;
  name: string;
  tagline: string;
  price_monthly: number;
  price_annual: number;
  limits: PricingPlanLimits;
  highlights: string[];
  /** Destaque na página de preços. */
  featured?: boolean;
  /** Disponível no checkout Stripe. */
  purchasable: boolean;
};

export type AddonDefinition = {
  slug: AddonSlug;
  name: string;
  description: string;
  price: number;
  /** recurring = assinatura mensal; one_time = pacote consumível. */
  billing: 'recurring' | 'one_time';
  unit_label: string;
};

export const PRICING_PLANS: PlanDefinition[] = [
  {
    slug: 'free',
    name: 'Free',
    tagline: 'CRM essencial para começar',
    price_monthly: 0,
    price_annual: 0,
    purchasable: false,
    limits: {
      max_deals: 30,
      max_members: 1,
      ai_monthly: 30,
      ficha_monthly: 3,
      ficha_daily: null,
      allowed_ufs: 0,
      emails_enabled: false,
      ceo_brain_enabled: true,
      import_enabled: true,
    },
    highlights: [
      'Funil + agenda + contatos',
      'Preview de CNPJ (dados básicos)',
      '3 fichas completas de empresa/mês',
      '30 mensagens RainMaker IA/mês',
      '1 usuário · até 30 deals',
    ],
  },
  {
    slug: 'regional_1',
    name: 'Regional 1',
    tagline: 'Prospecção focada em 1 estado',
    price_monthly: 99,
    price_annual: 990,
    purchasable: true,
    limits: {
      max_deals: 500,
      max_members: 3,
      ai_monthly: 200,
      ficha_monthly: null,
      ficha_daily: 20,
      allowed_ufs: 1,
      emails_enabled: true,
      ceo_brain_enabled: true,
      import_enabled: true,
    },
    highlights: [
      '1 UF à escolha na base Empresas',
      '20 fichas completas/dia nessa UF',
      'E-mails integrados',
      '3 usuários · 200 msgs IA/mês',
    ],
  },
  {
    slug: 'regional_3',
    name: 'Regional 3',
    tagline: 'Três estados para expandir a carteira',
    price_monthly: 249,
    price_annual: 2490,
    purchasable: true,
    featured: true,
    limits: {
      max_deals: 2000,
      max_members: 8,
      ai_monthly: 500,
      ficha_monthly: null,
      ficha_daily: 50,
      allowed_ufs: 3,
      emails_enabled: true,
      ceo_brain_enabled: true,
      import_enabled: true,
    },
    highlights: [
      '3 UFs à escolha',
      '50 fichas completas/dia (total)',
      '8 usuários · 500 msgs IA/mês',
      'Importação legado + lixeira',
    ],
  },
  {
    slug: 'nacional',
    name: 'Nacional',
    tagline: 'Brasil inteiro + Distrito Federal',
    price_monthly: 399,
    price_annual: 3990,
    purchasable: true,
    limits: {
      max_deals: 99999,
      max_members: 15,
      ai_monthly: 1000,
      ficha_monthly: null,
      ficha_daily: 80,
      allowed_ufs: 27,
      emails_enabled: true,
      ceo_brain_enabled: true,
      import_enabled: true,
    },
    highlights: [
      'Todas as UFs + DF',
      '80 fichas completas/dia',
      '15 usuários · 1.000 msgs IA/mês',
      'Suporte prioritário',
    ],
  },
];

export const PRICING_ADDONS: AddonDefinition[] = [
  {
    slug: 'uf_extra',
    name: '+1 UF',
    description: 'Inclui mais um estado na base Empresas (requer plano pago).',
    price: 49,
    billing: 'recurring',
    unit_label: '/mês por UF',
  },
  {
    slug: 'pack_50',
    name: 'Pacote 50 fichas',
    description: 'Créditos extras para desbloquear fichas completas nas UFs do seu plano.',
    price: 29,
    billing: 'one_time',
    unit_label: 'pagamento único',
  },
  {
    slug: 'pack_200',
    name: 'Pacote 200 fichas',
    description: 'Volume extra para campanhas de prospecção intensa.',
    price: 89,
    billing: 'one_time',
    unit_label: 'pagamento único',
  },
];

export function getPlanBySlug(slug: PlanSlug): PlanDefinition | undefined {
  return PRICING_PLANS.find((p) => p.slug === slug);
}

export function getPurchasablePlans(): PlanDefinition[] {
  return PRICING_PLANS.filter((p) => p.purchasable);
}

/** Mapa legado free/pro/team → slugs novos (CEO actions). */
export const LEGACY_PLAN_LIMITS: Record<
  'free' | 'pro' | 'team',
  PricingPlanLimits
> = {
  free: getPlanBySlug('free')!.limits,
  pro: getPlanBySlug('regional_1')!.limits,
  team: getPlanBySlug('nacional')!.limits,
};
