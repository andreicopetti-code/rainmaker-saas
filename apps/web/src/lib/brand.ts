/** Marca do produto — única fonte para nomes exibidos ao usuário. */
export const APP_NAME = 'RainMaker';
export const APP_NAME_SHORT = 'RainMaker';
/** Feature de IA (antiga “CEO Brain”). */
export const APP_AI_NAME = 'RainMaker IA';
export const APP_AI_NAV_LABEL = 'IA';
export const APP_TAGLINE = 'Copiloto comercial com IA';
export const APP_EMAIL_FROM_NAME = 'RainMaker';
/** Remetente transacional enquanto o domínio novo não está no ar. */
export const APP_EMAIL_FROM =
  process.env.TEAM_INVITE_FROM?.trim() ||
  'RainMaker <noreply@ceobrain.com.br>';
export const APP_LOGO_PATH = '/logo.png';
export const APP_LOGO_WORDMARK_PATH = '/logo-wordmark.png';
