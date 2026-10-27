/**
 * The thin native layer. Native code only does what JS cannot: draw the
 * official wallet buttons and present the Apple Pay / Google Pay sheets.
 * Everything else (sessions, Jupico calls, payloads, status) lives in JS.
 */
import {
  NativeModules,
  Platform,
  requireNativeComponent,
  type HostComponent,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';
import type { WalletLog } from './logger';
import type { ApplePayPayment, ApplePayRequest } from './payloads';

interface JupicoRNWalletsModule {
  // iOS
  canMakeApplePayments(networks: string[]): Promise<boolean>;
  /** Resolves when the user authorizes; the sheet stays open until completeApplePay. */
  presentApplePay(request: ApplePayRequest): Promise<ApplePayPayment>;
  completeApplePay(success: boolean): Promise<void>;
  // Android
  isGooglePayReady(requestJson: string, environment: string): Promise<boolean>;
  /** Resolves with the PaymentData JSON string. */
  loadGooglePayPaymentData(requestJson: string, environment: string): Promise<string>;
}

const LINKING_ERROR =
  "@jupico/react-native-wallets: native module not found. Run 'pod install' (iOS) or rebuild the app (Android).";

export const NativeWallets: JupicoRNWalletsModule =
  NativeModules.JupicoRNWallets ??
  new Proxy({} as JupicoRNWalletsModule, {
    get() {
      throw new Error(LINKING_ERROR);
    },
  });

export interface ApplePayButtonNativeProps extends ViewProps {
  buttonType?: string;
  buttonStyle?: string;
  cornerRadius?: number;
  onWalletPress?: (e: NativeSyntheticEvent<{}>) => void;
}

export interface GooglePayButtonNativeProps extends ViewProps {
  allowedPaymentMethods: string;
  buttonTheme?: string;
  buttonType?: string;
  onWalletPress?: (e: NativeSyntheticEvent<{}>) => void;
}

// Resolved lazily: each view only exists on its own platform.
let applePayButton: HostComponent<ApplePayButtonNativeProps> | undefined;
let googlePayButton: HostComponent<GooglePayButtonNativeProps> | undefined;

export function getApplePayButton(): HostComponent<ApplePayButtonNativeProps> | undefined {
  if (Platform.OS !== 'ios') return undefined;
  applePayButton ??= requireNativeComponent<ApplePayButtonNativeProps>('JupicoApplePayButton');
  return applePayButton;
}

export function getGooglePayButton(): HostComponent<GooglePayButtonNativeProps> | undefined {
  if (Platform.OS !== 'android') return undefined;
  googlePayButton ??= requireNativeComponent<GooglePayButtonNativeProps>('JupicoGooglePayButton');
  return googlePayButton;
}

/** Calls a native method and logs the call, its result or its rejection. */
export async function traceNative<T>(
  log: WalletLog,
  name: string,
  args: unknown,
  call: () => Promise<T>,
): Promise<T> {
  log('native', `→ ${name}`, args);
  try {
    const result = await call();
    log('native', `← ${name}`, result);
    return result;
  } catch (e: any) {
    log('native', `✕ ${name}`, { code: e?.code, message: e?.message });
    throw e;
  }
}
