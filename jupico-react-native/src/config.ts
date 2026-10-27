/**
 * Endpoints and constants, copied from web-components `src/config.ts` and
 * `src/data/enums.ts` so both clients talk to Jupico the same way.
 */

const API_URLS: Record<string, string> = {
  production: 'https://payments-hosted-api.jupico.com',
  sandbox: 'https://sandbox-payments-hosted-api.jupico.com',
  stage: 'https://stage-payments-hosted-api.jupico.com',
  development: 'https://dev-payments-hosted-api.jupico.com',
  local: 'http://local-payments-hosted-api.jupico.com',
};

export const PROVIDERS = {
  VGS_APPLEPAY: 'vgs-applepay',
  VGS_GPAY: 'vgs-googlepay',
  SIMULATOR: 'simulator',
} as const;

export const GOOGLE_PAY_GATEWAY = 'verygoodsecurity';
export const GOOGLE_PAY_GATEWAY_MERCHANT_ID = 'ACgtnCohNkFmTpkULj2jaRvX';

/** Sent when the host app provides no getReCaptchaToken (see README). */
export const NATIVE_RECAPTCHA_MARKER = 'react-native-sdk';

/** hosted-api base URL. Unknown environments fall back to `local`, like the web. */
export function getDomain(environment?: string): string {
  return API_URLS[environment ?? ''] ?? API_URLS.local!;
}

export function buildValidateUrl(environment?: string): string {
  return `${getDomain(environment)}/api/v1/tokenization/session/browser/validate`;
}

/** VGS proxy route that turns a wallet token into a Jupico one-time token. */
export function buildVgsWalletUrl(
  vaultId: string,
  inboundId: string | undefined,
  environment?: string,
): string {
  const vgsDomain = environment === 'production' ? 'live' : 'sandbox';
  const inboundSuffix = inboundId ? `-${inboundId}` : '';
  return `https://${vaultId}${inboundSuffix}.${vgsDomain}.verygoodproxy.com/v1/tokenization/creditcard/onetimetoken`;
}

/** hosted-api one-time-token route, used by the simulator (no VGS). */
export function buildPlatformOttUrl(environment?: string): string {
  return `${getDomain(environment)}/api/v1/tokenization/creditcard/onetimetoken`;
}
