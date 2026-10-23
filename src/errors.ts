/**
 * A single, stable error model so RN clients handle failures uniformly
 * regardless of which native platform raised them.
 */

export type WalletErrorCode =
  /** User dismissed / cancelled the payment sheet. */
  | 'CANCELLED'
  /** Device/OS cannot make payments (no hardware, restricted, old OS). */
  | 'UNSUPPORTED_DEVICE'
  /** Wallet is available but the user has no eligible cards enrolled. */
  | 'NO_ELIGIBLE_CARDS'
  /** Config passed from JS was invalid (bad merchant id, empty items, ...). */
  | 'INVALID_CONFIGURATION'
  /** The Jupico `sessions` object is missing, malformed, or refused by the backend. */
  | 'INVALID_SESSION'
  /** Network / gateway error mid-flow. */
  | 'NETWORK_ERROR'
  /** Native sheet failed for a reason we could not map. */
  | 'PAYMENT_FAILED'
  /** Anything else. */
  | 'UNKNOWN';

export class WalletError extends Error {
  readonly code: WalletErrorCode;
  readonly nativeCode?: string;

  constructor(code: WalletErrorCode, message: string, nativeCode?: string) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
    this.nativeCode = nativeCode;
  }
}

/**
 * Native modules reject Promises with an { code, message } shape. Map that to
 * our typed error. Codes emitted by the native bridges match WalletErrorCode.
 */
export function fromNativeRejection(e: unknown): WalletError {
  if (e instanceof WalletError) return e;
  const anyErr = e as { code?: string; message?: string; nativeCode?: string };
  const code = (anyErr?.code ?? 'UNKNOWN') as WalletErrorCode;
  const known: WalletErrorCode[] = [
    'CANCELLED',
    'UNSUPPORTED_DEVICE',
    'NO_ELIGIBLE_CARDS',
    'INVALID_CONFIGURATION',
    'INVALID_SESSION',
    'NETWORK_ERROR',
    'PAYMENT_FAILED',
    'UNKNOWN',
  ];
  return new WalletError(
    known.includes(code) ? code : 'UNKNOWN',
    anyErr?.message ?? 'Unknown wallet error',
    anyErr?.nativeCode
  );
}
