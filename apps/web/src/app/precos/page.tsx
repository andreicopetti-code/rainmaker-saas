import Image from 'next/image';
import Link from 'next/link';
import { PRICING_ADDONS } from '@ceo-brain/shared';
import {
  PRECOS_ADDON_NAMES,
  PRECOS_ADDONS,
  PRECOS_DIFFERENTIATORS,
  PRECOS_FAQ,
  PRECOS_FEATURED_PLAN,
  PRECOS_HEADER,
  PRECOS_MATRIX_HEADERS,
  PRECOS_PLANS,
  PRECOS_ROI,
  PRECOS_TRUST_BAND,
  PRECOS_VALUE_PROPS,
  type PrecosPlanCopy,
} from './precos-copy';
import { APP_LOGO_PATH, APP_NAME } from '@/lib/brand';
import './precos.css';

function PlanCard({ plan }: { plan: PrecosPlanCopy }) {
  const isFree = plan.slug === 'free';

  return (
    <article className={`precos-card${plan.featured ? ' precos-card--featured' : ''}`}>
      {plan.badge ? <div className="precos-badge">{plan.badge}</div> : null}

      <h2 className="precos-card-name">{plan.name}</h2>
      {plan.scope ? <p className="precos-card-scope">{plan.scope}</p> : null}
      <p className="precos-card-tagline">{plan.description}</p>

      <div className="precos-price-block">
        <div className="precos-price">
          <span className={`precos-price-value${isFree ? ' precos-price-value--free' : ''}`}>
            {plan.priceAmount}
          </span>
          {plan.priceSuffix ? (
            <span className="precos-price-suffix">{plan.priceSuffix}</span>
          ) : null}
        </div>
        {plan.priceDaily ? <p className="precos-price-daily">{plan.priceDaily}</p> : null}
        {plan.annualPrice ? (
          <div className="precos-annual-block">
            <p className="precos-annual">{plan.annualPrice}</p>
            {plan.annualSavings ? (
              <p className="precos-savings">
                Economize <strong>R$ {plan.annualSavings}</strong>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <ul className="precos-checklist">
        {plan.checklist.map((item) => (
          <li key={item}>
            <span className="precos-check" aria-hidden="true">✔</span>
            {item}
          </li>
        ))}
      </ul>

      <div className="precos-card-action">
        <Link
          href={plan.ctaHref}
          className={`precos-btn precos-btn--full${plan.ctaVariant === 'primary' ? ' precos-btn--primary' : ' precos-btn--ghost'}`}
        >
          {plan.cta}
        </Link>
      </div>
    </article>
  );
}

function MatrixCell({
  slug,
  children,
  isHeader = false,
}: {
  slug: string;
  children: React.ReactNode;
  isHeader?: boolean;
}) {
  const featured = slug === PRECOS_FEATURED_PLAN;
  const Tag = isHeader ? 'th' : 'td';
  return (
    <Tag className={featured ? 'precos-table-col--featured' : undefined}>
      {children}
    </Tag>
  );
}

export default function PrecosPage() {
  return (
    <div className="precos-page">
      <header className="precos-header">
        <Link href="/" className="precos-logo">
          <div className="precos-logo-icon">
            <Image src={APP_LOGO_PATH} alt={APP_NAME} width={34} height={34} priority />
          </div>
          <span className="precos-logo-text">
            Rain<span>Maker</span>
          </span>
        </Link>
        <div className="precos-header-actions">
          <Link href="/login" className="precos-link">Entrar</Link>
          <Link href="/register" className="precos-btn precos-btn--primary precos-btn--sm">
            Criar conta
          </Link>
        </div>
      </header>

      <main className="precos-main">
        <section className="precos-hero">
          <h1>{PRECOS_HEADER.title}</h1>
          <p className="precos-lead">{PRECOS_HEADER.subtitle}</p>
          <div className="precos-hero-benefits">
            {PRECOS_HEADER.benefits.map((item) => (
              <span key={item} className="precos-hero-benefit">
                <span className="precos-check" aria-hidden="true">✅</span>
                {item}
              </span>
            ))}
          </div>
        </section>

        <div className="precos-grid">
          {PRECOS_PLANS.map((plan) => (
            <PlanCard key={plan.slug} plan={plan} />
          ))}
        </div>

        <div className="precos-trust-band">
          {PRECOS_TRUST_BAND.map((item) => (
            <span key={item} className="precos-trust-item">{item}</span>
          ))}
        </div>

        <section className="precos-roi">
          <div className="precos-roi-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M14 7h7v7" />
            </svg>
          </div>
          <div>
            <h2>{PRECOS_ROI.title}</h2>
            <p>{PRECOS_ROI.text}</p>
          </div>
        </section>

        <section className="precos-differentiators">
          <h2>{PRECOS_DIFFERENTIATORS.title}</h2>
          <div className="precos-diff-grid">
            {PRECOS_DIFFERENTIATORS.items.map((item) => (
              <article key={item.title} className="precos-diff-card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="precos-value-props">
          <h2>{PRECOS_VALUE_PROPS.title}</h2>
          <ul className="precos-value-list">
            {PRECOS_VALUE_PROPS.items.map((item) => (
              <li key={item}>
                <span className="precos-check" aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="precos-addons">
          <h2>{PRECOS_ADDONS.title}</h2>
          <p className="precos-addons-lead">{PRECOS_ADDONS.description}</p>
          <div className="precos-addon-grid">
            {PRICING_ADDONS.map((addon) => (
              <div key={addon.slug} className="precos-addon-card">
                <div className="precos-addon-name">{PRECOS_ADDON_NAMES[addon.slug]}</div>
                <div className="precos-addon-price">
                  R$ {addon.price}
                  <span>{addon.unit_label}</span>
                </div>
                <p>{addon.description.replace(/fichas completas/gi, 'empresas qualificadas')}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="precos-matrix">
          <h2>Compare os planos</h2>
          <div className="precos-table-wrap">
            <table className="precos-table">
              <thead>
                <tr>
                  <th className="precos-table-sticky">Recurso</th>
                  {PRECOS_PLANS.map((p) => (
                    <MatrixCell key={p.slug} slug={p.slug} isHeader>
                      <span className="precos-table-plan-name">
                        {PRECOS_MATRIX_HEADERS[p.slug]}
                      </span>
                      {p.slug === PRECOS_FEATURED_PLAN ? (
                        <span className="precos-table-badge">Plano recomendado</span>
                      ) : null}
                    </MatrixCell>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="precos-table-sticky">Preço mensal</td>
                  {PRECOS_PLANS.map((p) => (
                    <MatrixCell key={p.slug} slug={p.slug}>
                      {p.priceAmount}
                      {p.priceSuffix ?? ''}
                    </MatrixCell>
                  ))}
                </tr>
                <tr>
                  <td className="precos-table-sticky">Cobertura geográfica</td>
                  <MatrixCell slug="free">Exploração inicial</MatrixCell>
                  <MatrixCell slug="regional_1">1 estado</MatrixCell>
                  <MatrixCell slug="regional_3">Até 3 estados</MatrixCell>
                  <MatrixCell slug="nacional">Brasil inteiro</MatrixCell>
                </tr>
                <tr>
                  <td className="precos-table-sticky">Empresas qualificadas</td>
                  <MatrixCell slug="free">3 por mês</MatrixCell>
                  <MatrixCell slug="regional_1">20 por dia</MatrixCell>
                  <MatrixCell slug="regional_3">50 por dia</MatrixCell>
                  <MatrixCell slug="nacional">80 por dia</MatrixCell>
                </tr>
                <tr>
                  <td className="precos-table-sticky">Oportunidades comerciais</td>
                  <MatrixCell slug="free">Até 30</MatrixCell>
                  <MatrixCell slug="regional_1">Até 500</MatrixCell>
                  <MatrixCell slug="regional_3">Até 2.000</MatrixCell>
                  <MatrixCell slug="nacional">Praticamente ilimitadas</MatrixCell>
                </tr>
                <tr>
                  <td className="precos-table-sticky">Usuários</td>
                  <MatrixCell slug="free">1</MatrixCell>
                  <MatrixCell slug="regional_1">3</MatrixCell>
                  <MatrixCell slug="regional_3">8</MatrixCell>
                  <MatrixCell slug="nacional">15</MatrixCell>
                </tr>
                <tr>
                  <td className="precos-table-sticky">Análises com IA</td>
                  <MatrixCell slug="free">30 por mês</MatrixCell>
                  <MatrixCell slug="regional_1">200 por mês</MatrixCell>
                  <MatrixCell slug="regional_3">500 por mês</MatrixCell>
                  <MatrixCell slug="nacional">1.000 por mês</MatrixCell>
                </tr>
                <tr>
                  <td className="precos-table-sticky">Sincronização com e-mail</td>
                  <MatrixCell slug="free">—</MatrixCell>
                  <MatrixCell slug="regional_1">Sim</MatrixCell>
                  <MatrixCell slug="regional_3">Sim</MatrixCell>
                  <MatrixCell slug="nacional">Sim</MatrixCell>
                </tr>
                <tr>
                  <td className="precos-table-sticky">Importação de carteira</td>
                  <MatrixCell slug="free">Sim</MatrixCell>
                  <MatrixCell slug="regional_1">Sim</MatrixCell>
                  <MatrixCell slug="regional_3">Sim</MatrixCell>
                  <MatrixCell slug="nacional">Sim</MatrixCell>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="precos-faq">
          <h2>Perguntas frequentes</h2>
          <div className="precos-faq-list">
            {PRECOS_FAQ.map((item) => (
              <details key={item.question} className="precos-faq-item">
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
