import { useCallback, useEffect, useRef, useState } from 'react';
import { JupicoWalletError } from '../api';
import { createWalletLog, type WalletLogEntry } from '../logger';
import type {
  WalletComponentProps,
  WalletErrorCode,
  WalletStatus,
} from '../types';

export interface WalletState {
  status: WalletStatus;
  message?: string;
}

const NATIVE_CODES: WalletErrorCode[] = [
  'CANCELLED',
  'INVALID_SESSION',
  'INVALID_CONFIGURATION',
  'TOKENIZATION_FAILED',
  'PAYMENT_FAILED',
  'NETWORK_ERROR',
];

/** Normalizes JS errors and native promise rejections ({ code, message }). */
export function toWalletError(e: unknown): JupicoWalletError {
  if (e instanceof JupicoWalletError) return e;
  const any = e as { code?: string; message?: string };
  const code = NATIVE_CODES.includes(any?.code as WalletErrorCode)
    ? (any.code as WalletErrorCode)
    : 'PAYMENT_FAILED';
  return new JupicoWalletError(code, any?.message ?? 'Unknown error');
}

/**
 * The state machine both components share: what status to render, and the
 * three outputs (transactionComplete / onSubmitError / onStatusChange).
 * Handlers are read through a ref so callers can pass inline functions.
 */
export function useWalletController<P extends WalletComponentProps>(
  props: P,
  wallet: WalletLogEntry['wallet'],
) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const [log] = useState(() => createWalletLog(wallet, () => propsRef.current));
  const [state, setState] = useState<WalletState>({ status: 'loading' });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setStatus = useCallback((status: WalletStatus, message?: string) => {
    if (!mounted.current) return;
    setState({ status, message });
    log('status', `→ ${status}`, message ? { message } : undefined);
    propsRef.current.onStatusChange?.(message ? { status, message } : { status });
  }, [log]);

  const emitError = useCallback(
    (code: WalletErrorCode, message: string, details?: Record<string, unknown>) => {
      const event = { error: { ...details, code, message } };
      log('output', `onSubmitError(${code})`, event);
      propsRef.current.onSubmitError?.(event);
    },
    [log],
  );

  /** Session problems: hide the button, report once. */
  const unavailable = useCallback(
    (message: string, error?: unknown) => {
      setStatus('unavailable', message);
      if (error !== undefined) {
        const err = toWalletError(error);
        emitError(err.code, err.message, err.details);
      }
    },
    [setStatus, emitError],
  );

  /** Payment attempt failed or was cancelled; the button stays usable. */
  const fail = useCallback(
    (error: unknown) => {
      const err = toWalletError(error);
      if (err.code === 'CANCELLED') setStatus('cancelled', 'Payment cancelled');
      else setStatus('failed', `✕ ${err.message}`);
      emitError(err.code, err.message, err.details);
    },
    [setStatus, emitError],
  );

  const complete = useCallback(
    (oneTimeToken: string) => {
      setStatus('success', '✓ Payment authorized');
      const event = { oneTimeToken: { paymentToken: { data: oneTimeToken } } };
      log('output', 'transactionComplete', event);
      propsRef.current.transactionComplete(event);
    },
    [setStatus, log],
  );

  return { state, setStatus, unavailable, fail, complete, propsRef, log };
}

/** States in which a tap starts a payment. */
export function isInteractive(status: WalletStatus): boolean {
  return status === 'ready' || status === 'success' || status === 'failed' || status === 'cancelled';
}
