import Link from 'next/link';

type Props = {
  feature: string;
  planName: string;
};

export function PlanUpgradeGate({ feature, planName }: Props) {
  return (
    <div className="board-page">
      <div
        style={{
          maxWidth: 520,
          margin: '48px auto',
          padding: 28,
          borderRadius: 14,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-md)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' }}>
          {feature} não incluído no seu plano
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, margin: '0 0 20px' }}>
          Seu plano atual é <strong>{planName}</strong>. Faça upgrade para desbloquear esta funcionalidade.
        </p>
        <Link
          href="/billing"
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            borderRadius: 8,
            background: 'var(--blue)',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Ver planos e fazer upgrade
        </Link>
      </div>
    </div>
  );
}
