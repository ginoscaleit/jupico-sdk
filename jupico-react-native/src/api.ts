import { buildValidateUrl, NATIVE_RECAPTCHA_MARKER } from './config';
import type { WalletLog } from './logger';
import type { JupicoWalletSession, WalletErrorCode } from './types';

export class JupicoWalletError extends Error {
  readonly code: WalletErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: WalletErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'JupicoWalletError';
    this.code = code;
    this.details = details;
  }
}

const noLog: WalletLog = () => {};

async function postJson(
  url: string,
  body: unknown,
  log: WalletLog,
): Promise<{ ok: boolean; status: number; json: any }> {
  log('request', `POST ${url}`, body);
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    log('response', `network error after ${Date.now() - started}ms`, { message: e?.message });
    throw new JupicoWalletError('NETWORK_ERROR', e?.message ?? 'Network request failed.');
  }
  const text = await response.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = { message: text };
  }
  log('response', `HTTP ${response.status} in ${Date.now() - started}ms`, json);
  return { ok: response.ok, status: response.status, json };
}

/**
 * `POST /api/v1/tokenization/session/browser/validate` — the check the web
 * components run on mount to decide whether to show the button.
 */
export async function validateSession(session: JupicoWalletSession, log: WalletLog = noLog): Promise<void> {
  const { ok, status, json } = await postJson(
    buildValidateUrl(session.environment),
    { tokenSessionId: session.tokenSessionId, publicKey: session.subMerchantPublicKey },
    log,
  );
  if (!ok || !json?.success) {
    throw new JupicoWalletError(
      'INVALID_SESSION',
      json?.message ?? `Session validation failed (HTTP ${status}).`,
      { httpStatus: status, code: json?.code },
    );
  }
}

/** Posts a one-time-token request (VGS or hosted-api) and returns the OTT. */
export async function requestOneTimeToken(url: string, body: unknown, log: WalletLog = noLog): Promise<string> {
  const { ok, status, json } = await postJson(url, body, log);
  const token = json?.data?.oneTimeToken?.data;
  if (!ok || json?.success === false || typeof token !== 'string') {
    throw new JupicoWalletError(
      'TOKENIZATION_FAILED',
      json?.message ?? `Payment tokenization failed (HTTP ${status}).`,
      { httpStatus: status, code: json?.code, errors: json?.errors },
    );
  }
  return token;
}

export async function resolveReCaptchaToken(
  getReCaptchaToken: (() => Promise<string>) | undefined,
): Promise<string> {
  if (!getReCaptchaToken) return NATIVE_RECAPTCHA_MARKER;
  try {
    return (await getReCaptchaToken()) || NATIVE_RECAPTCHA_MARKER;
  } catch {
    return NATIVE_RECAPTCHA_MARKER;
  }
}
