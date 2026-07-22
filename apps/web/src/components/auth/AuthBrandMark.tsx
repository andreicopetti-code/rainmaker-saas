import Image from 'next/image';
import { APP_LOGO_VERTICAL_PATH, APP_NAME } from '@/lib/brand';

/** Logo vertical centralizada para cards de autenticação. */
export function AuthBrandMark() {
  return (
    <Image
      src={APP_LOGO_VERTICAL_PATH}
      alt={APP_NAME}
      width={800}
      height={508}
      priority
      sizes="(max-width: 640px) 180px, 210px"
      className="mx-auto h-auto w-[180px] sm:w-[210px]"
      quality={100}
    />
  );
}
