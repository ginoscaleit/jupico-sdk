/**
 * Step-by-step trace of what a component receives, sends and emits, delivered
 * through the `onLog` prop (and the console with `debug`). Meant for
 * integration and demos: it contains request bodies, so long values are
 * truncated and contact details masked, but it should not be shipped to
 * analytics in production.
 */

export type WalletLogKind =
  /** Props the component received, and what it decoded from them. */
  | 'input'
  /** HTTP request to Jupico / VGS. */
  | 'request'
  /** HTTP response from Jupico / VGS. */
  | 'response'
  /** Call into the native module, or its result. */
  | 'native'
  /** Status transition (same as onStatusChange). */
  | 'status'
  /** transactionComplete / onSubmitError being called. */
  | 'output'
  /** A decision the component took (why it shows / hides the button, etc.). */
  | 'step';

export interface WalletLogEntry {
  /** ISO timestamp. */
  time: string;
  wallet: 'apple-pay' | 'google-pay';
  kind: WalletLogKind;
  message: string;
  data?: unknown;
}

export type WalletLog = (kind: WalletLogKind, message: string, data?: unknown) => void;

export function createWalletLog(
  wallet: WalletLogEntry['wallet'],
  getOptions: () => { onLog?: (entry: WalletLogEntry) => void; debug?: boolean },
): WalletLog {
  return (kind, message, data) => {
    const { onLog, debug } = getOptions();
    if (!onLog && !debug) return;
    const entry: WalletLogEntry = {
      time: new Date().toISOString(),
      wallet,
      kind,
      message,
      ...(data === undefined ? {} : { data: redact(data) }),
    };
    if (debug) console.log(`[jupico:${wallet}] ${kind} · ${message}`, entry.data ?? '');
    try {
      onLog?.(entry);
    } catch {
      // A broken logger must never break a payment.
    }
  };
}

const MAX_STRING = 80;
const MASKED_KEYS = new Set(['emailAddress', 'email', 'phoneNumber', 'phone', 'password', 'Authorization']);

/** Truncates long strings (tokens, cryptograms) and masks contact details. */
export function redact(value: unknown, key?: string, depth = 0): unknown {
  if (key && MASKED_KEYS.has(key) && typeof value === 'string' && value) {
    return value.length <= 4 ? '••••' : `${value.slice(0, 2)}••••${value.slice(-2)}`;
  }
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, 40)}…(${value.length} chars)` : value;
  }
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => redact(v, undefined, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = redact(v, k, depth + 1);
  return out;
}
