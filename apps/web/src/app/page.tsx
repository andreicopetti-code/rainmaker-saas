import Image from 'next/image';
import Link from 'next/link';
import {
  HOME_FEATURED_PLANS,
  HOME_FINAL_CTA,
  HOME_HERO,
  HOME_STATS,
  HOME_STEPS,
  PRECOS_DIFFERENTIATORS,
  PRECOS_ROI,
  PRECOS_TRUST_BAND,
} from './home-copy';
import type { PrecosPlanCopy } from './precos/precos-copy';
import { APP_LOGO_PATH, APP_NAME, APP_TAGLINE } from '@/lib/brand';
import './home.css';

function PlanCard({ plan }: { plan: PrecosPlanCopy }) {
  const isFeatured = plan.featured || plan.slug === 'regional_1';
  const ctaLabel =
    plan.slug === 'free' ? 'Criar conta grátis' : 'Começar trial de 14 dias';

  return (
    <article className={`home-plan${isFeatured ? ' home-plan--featured' : ''}`}>
      {plan.badge ? <div className="home-plan-badge">{plan.badge}</div> : null}
      {plan.slug === 'regional_1' && !plan.badge ? (
        <div className="home-plan-badge">Trial 14 dias</div>
      ) : null}

      <h3 className="home-plan-name">{plan.name}</h3>
      {plan.scope ? <p className="home-plan-scope">{plan.scope}</p> : null}
      <p className="home-plan-desc">{plan.description}</p>

      <div className="home-plan-price">
        {plan.priceAmount}
        {plan.priceSuffix ? <small>{plan.priceSuffix}</small> : null}
      </div>

      <ul className="home-plan-list">
        {plan.checklist.slice(0, 5).map((item) => (
          <li key={item}>
            <span className="home-plan-check" aria-hidden="true">✔</span>
            {item}
          </li>
        ))}
      </ul>

      <Link
        href="/register"
        className={`home-btn${isFeatured ? ' home-btn--primary' : ' home-btn--ghost'}`}
        style={{ width: '100%' }}
      >
        {ctaLabel}
      </Link>
    </article>
  );
}

export default function Home() {
  return (
    <div className="home-page">
      <header className="home-header">
        <Link href="/" className="home-logo">
          <div className="home-logo-icon">
            <Image src={APP_LOGO_PATH} alt={APP_NAME} width={36} height={36} priority />
          </div>
          <span className="home-logo-text">
            Rain<span>Maker</span>
          </span>
        </Link>
        <nav className="home-nav" aria-label="Navegação principal">
          <Link href="/precos" className="home-link">
            Planos
          </Link>
          <Link href="/login" className="home-link">
            Entrar
          </Link>
          <Link href="/register" className="home-btn home-btn--primary">
            Começar grátis
          </Link>
        </nav>
      </header>

      <main className="home-main">
        <section className="home-hero">
          <span className="home-eyebrow">{HOME_HERO.eyebrow}</span>
          <h1>{HOME_HERO.title}</h1>
          <p className="home-lead">{HOME_HERO.subtitle}</p>
          <div className="home-hero-actions">
            <Link href={HOME_HERO.primaryHref} className="home-btn home-btn--primary home-btn--lg">
              {HOME_HERO.primaryCta}
            </Link>
            <Link href={HOME_HERO.secondaryHref} className="home-btn home-btn--ghost home-btn--lg">
              {HOME_HERO.secondaryCta}
            </Link>
          </div>
          <div className="home-stats">
            {HOME_STATS.map((stat) => (
              <div key={stat.label} className="home-stat">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="home-steps-title">
          <h2 id="home-steps-title" className="home-section-title">
            Como funciona
          </h2>
          <p className="home-section-sub">
            Em poucos minutos você sai do cadastro para prospectar e gerenciar oportunidades.
          </p>
          <div className="home-steps">
            {HOME_STEPS.map((step) => (
              <article key={step.step} className="home-step">
                <span className="home-step-num">{step.step}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="home-plans-title">
          <h2 id="home-plans-title" className="home-section-title">
            Planos para cada fase do seu time
          </h2>
          <p className="home-section-sub">
            Comece no Starter ou teste 14 dias o Professional. Compare todos os detalhes na página de preços.
          </p>
          <div className="home-plans">
            {HOME_FEATURED_PLANS.map((plan) => (
              <PlanCard key={plan.slug} plan={plan} />
            ))}
          </div>
          <p style={{ textAlign: 'center', marginBottom: 8 }}>
            <Link href="/precos" className="home-link" style={{ fontSize: 14 }}>
              Ver matriz completa de planos e add-ons →
            </Link>
          </p>
        </section>

        <div className="home-trust">
          {PRECOS_TRUST_BAND.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>

        <section className="home-diff" aria-labelledby="home-diff-title">
          <h2 id="home-diff-title" className="home-section-title">
            {PRECOS_DIFFERENTIATORS.title}
          </h2>
          <div className="home-diff-grid">
            {PRECOS_DIFFERENTIATORS.items.map((item) => (
              <article key={item.title} className="home-diff-card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-roi" aria-labelledby="home-roi-title">
          <div className="home-roi-icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M14 7h7v7" />
            </svg>
          </div>
          <div>
            <h2 id="home-roi-title">{PRECOS_ROI.title}</h2>
            <p>{PRECOS_ROI.text}</p>
          </div>
        </section>

        <section className="home-final" aria-labelledby="home-final-title">
          <h2 id="home-final-title">{HOME_FINAL_CTA.title}</h2>
          <p>{HOME_FINAL_CTA.subtitle}</p>
          <div className="home-final-actions">
            <Link href={HOME_FINAL_CTA.trialHref} className="home-btn home-btn--primary home-btn--lg">
              {HOME_FINAL_CTA.trialCta}
            </Link>
            <Link href={HOME_FINAL_CTA.pricingHref} className="home-btn home-btn--ghost home-btn--lg">
              {HOME_FINAL_CTA.pricingCta}
            </Link>
          </div>
        </section>

        <footer className="home-footer">
          © {new Date().getFullYear()} {APP_NAME} · {APP_TAGLINE}
        </footer>
      </main>
    </div>
  );
}
