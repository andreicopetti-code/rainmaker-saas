/** Marca do produto — única fonte para nomes exibidos ao usuário. */
export const APP_NAME = 'RainMaker';
export const APP_NAME_SHORT = 'RainMaker';
/** Feature de IA (antiga “CEO Brain”). */
export const APP_AI_NAME = 'RainMaker IA';
export const APP_AI_NAV_LABEL = 'RM IA';
/** Label curto no avatar do chat (ex.: balão da IA). */
export const APP_AI_AVATAR_LABEL = 'RM';
export const APP_TAGLINE = 'Copiloto comercial com IA';
export const APP_EMAIL_FROM_NAME = 'RainMaker';
/** Domínio canônico de produção. */
export const APP_PRODUCTION_HOST = 'www.rainmaker.ia.br';
export const APP_PRODUCTION_URL = `https://${APP_PRODUCTION_HOST}`;
/** Remetente transacional (Resend precisa ter o domínio verificado). */
export const APP_EMAIL_FROM =
  process.env.TEAM_INVITE_FROM?.trim() ||
  process.env.EMAIL_FROM?.trim() ||
  'RainMaker <noreply@rainmaker.ia.br>';
export const APP_LOGO_PATH = '/logo.png';
export const APP_LOGO_WORDMARK_PATH = '/logo-wordmark.png';
export const APP_LOGO_VERTICAL_PATH = '/logo-vertical.png';
