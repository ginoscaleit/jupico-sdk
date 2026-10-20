/**
 * Layer 3 — the public TypeScript API for RN clients.
 *
 * Clients import this. It provides a unified facade over the native Apple Pay
 * and Google Pay cores, delegating to the Turbo Module and translating native
 * rejections into a typed {@link WalletError}.
 */
import { Platform, TurboModuleRegistry, NativeModules } from 'react-native';
import type { Spec } from './NativeJupicoWallets';
import { fromNativeRejection, WalletError } from './errors';
import type { PaymentRequest, PaymentResult } from './types';

// Resolve the native module in a way that works under BOTH the New Architecture
// (TurboModule) and the legacy bridge (NativeModules). We import only the *type*
// from NativeJupicoWallets so Codegen still sees that file's getEnforcing spec,
// while runtime resolution stays defensive.
const Native: Spec =
  TurboModuleRegistry.get<Spec>('JupicoWallets') ??
  (NativeModules.JupicoWallets as Spec);

export * from './types';
export { WalletError } from './errors';
export type { WalletErrorCode } from './errors';

/** Which wallet the current platform will use. */
export function activeWallet(): 'apple-pay' | 'google-pay' | 'unsupported' {
  if (Platform.OS === 'ios') return 'apple-pay';
  if (Platform.OS === 'android') return 'google-pay';
  return 'unsupported';
}

/**
 * Coarse check — is the wallet available on this device/OS at all?
 * Cheap; safe to call on mount to decide whether to render the pay button.
 */
export async function isSupported(): Promise<boolean> {
  if (activeWallet() === 'unsupported') return false;
  try {
    return await Native.isSupported();
  } catch {
    return false;
  }
}

/**
 * Fine-grained check for a concrete request: on iOS this maps to
 * `PKPaymentAuthorizationController.canMakePayments(usingNetworks:)`, on Android
 * to Google Pay's `IsReadyToPay`. Use this to gate the button for a given cart.
 */
export async function canMakePayments(request: PaymentRequest): Promise<boolean> {
  if (activeWallet() === 'unsupported') return false;
  validate(request);
  try {
    return await Native.canMakePayments(request as unknown as object);
  } catch {
    return false;
  }
}

/**
 * Presents the native payment sheet and resolves with an opaque payment token
 * to forward to your backend → PSP. Rejects with a {@link WalletError} whose
 * `code` is stable across platforms (e.g. 'CANCELLED', 'NO_ELIGIBLE_CARDS').
 */
export async function requestPayment(request: PaymentRequest): Promise<PaymentResult> {
  if (activeWallet() === 'unsupported') {
    throw new WalletError('UNSUPPORTED_DEVICE', 'Wallets are only available on iOS and Android.');
  }
  validate(request);
  try {
    const raw = await Native.requestPayment(request as unknown as object);
    return raw as PaymentResult;
  } catch (e) {
    throw fromNativeRejection(e);
  }
}

/** Lightweight JS-side validation so we fail fast before crossing the bridge. */
function validate(request: PaymentRequest): void {
  if (!request?.lineItems?.length) {
    throw new WalletError('INVALID_CONFIGURATION', 'lineItems must not be empty.');
  }
  if (!request.currencyCode) {
    throw new WalletError('INVALID_CONFIGURATION', 'currencyCode is required.');
  }
  if (!request.supportedNetworks?.length) {
    throw new WalletError('INVALID_CONFIGURATION', 'supportedNetworks must not be empty.');
  }
  if (Platform.OS === 'ios' && !request.apple?.merchantIdentifier) {
    throw new WalletError('INVALID_CONFIGURATION', 'apple.merchantIdentifier is required on iOS.');
  }
  if (Platform.OS === 'android' && !request.google?.merchantName) {
    throw new WalletError('INVALID_CONFIGURATION', 'google.merchantName is required on Android.');
  }
}
