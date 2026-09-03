import Image from 'next/image';
import { APP_LOGO_VERTICAL_PATH, APP_NAME } from '@/lib/brand';

/** Logo vertical original (ícone RM + RainMaker na tipografia da marca). */
export function AuthBrandMark() {
  return (
    <Image
      src={APP_LOGO_VERTICAL_PATH}
      alt={APP_NAME}
      width={800}
      height={508}
      priority
      sizes="(max-width: 640px) 168px, 196px"
      className="auth-brand-logo"
      quality={100}
    />
  );
}
