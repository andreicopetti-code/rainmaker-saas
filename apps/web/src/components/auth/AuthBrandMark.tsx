import Image from 'next/image';
import { APP_LOGO_PATH, APP_NAME } from '@/lib/brand';

/**
 * Marca vertical para auth: ícone RM + wordmark em texto.
 * Evita artefatos de JPEG/fundo preto (pontos e frisos) das exports bitmap.
 */
export function AuthBrandMark() {
  return (
    <div className="auth-brand" aria-label={APP_NAME}>
      <div className="auth-brand-icon">
        <Image
          src={APP_LOGO_PATH}
          alt=""
          width={256}
          height={256}
          priority
          className="auth-brand-icon-img"
        />
      </div>
      <p className="auth-brand-wordmark">
        <span className="auth-brand-rain">Rain</span>
        <span className="auth-brand-maker">Maker</span>
      </p>
    </div>
  );
}
