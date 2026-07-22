import Image from 'next/image';
import { APP_LOGO_VERTICAL_PATH, APP_NAME } from '@/lib/brand';

/** Logo vertical centralizada para cards de autenticação. */
export function AuthBrandMark() {
  return (
    <Image
      src={APP_LOGO_VERTICAL_PATH}
      alt={APP_NAME}
      width={168}
      height={115}
      priority
      className="mx-auto h-auto w-[140px] sm:w-[156px]"
    />
  );
}
