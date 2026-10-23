/**
 * Layer 3 UI — the React Native tags, mirroring the web components:
 *
 *   web:  <apple-pay-jupico>   .sessions  .transactionComplete  'submit-error'
 *   RN:   <ApplePayJupico     sessions   transactionComplete   onSubmitError />
 *
 * The UI itself lives in the native views (ApplePayJupicoView.swift /
 * GooglePayJupicoView.kt), which are the single source of truth; these tags
 * only forward props and unwrap events.
 */
import React from 'react';
import {
  Platform,
  requireNativeComponent,
  type HostComponent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { WalletErrorCode } from './errors';

/** One wallet entry of the decoded authorize-session response. */
export interface JupicoWalletSession {
  provider?: {
    type?: 'vgs-applepay' | 'vgs-googlepay' | 'simulator' | string;
    settings?: Record<string, unknown>;
  };
  tokenSessionId?: string;
  subMerchantPublicKey?: string;
  environment?: 'local' | 'development' | 'stage' | 'sandbox' | 'production' | string;
  amount?: string | number;
  description?: string;
  countryCode?: string;
  currencyCode?: string;
  error?: { httpCode?: number; code?: string; message?: string; explanation?: string };
}

/**
 * `data.sessions` from `POST /v1/sessions/browser/authorize`, passed through
 * untouched: `{ data: "<base64 JSON>" }`, or already decoded.
 */
export interface JupicoSessions {
  data?: string;
  applePay?: JupicoWalletSession;
  googlePay?: JupicoWalletSession;
  [key: string]: unknown;
}

/** Success payload — same shape the web component passes to transactionComplete. */
export interface TransactionCompleteEvent {
  oneTimeToken: { paymentToken: { data: string } };
  wallet: {
    platform: 'apple-pay' | 'google-pay';
    simulated: boolean;
    cardNetwork?: string;
    cardDetails?: string;
    tokenSessionId?: string;
  };
}

/** Failure payload — same shape as the web `submit-error` detail, plus a stable code. */
export interface SubmitErrorEvent {
  error: {
    code: WalletErrorCode;
    message: string;
    [key: string]: unknown;
  };
}

export type WalletStatus =
  | 'ready'
  | 'unavailable'
  | 'disabled'
  | 'processing'
  | 'success'
  | 'failed'
  | 'cancelled';

/** Fired for every scenario; the same text is rendered inside the component. */
export interface StatusChangeEvent {
  status: WalletStatus;
  message?: string;
}

interface CommonProps {
  sessions: JupicoSessions | null | undefined;
  transactionComplete: (event: TransactionCompleteEvent) => void;
  onSubmitError?: (event: SubmitErrorEvent) => void;
  onStatusChange?: (event: StatusChangeEvent) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export interface ApplePayJupicoProps extends CommonProps {
  /** Must match the app's Apple Pay entitlement (e.g. "merchant.com.jupico.prod"). */
  merchantIdentifier: string;
  buttonStyle?: 'black' | 'white' | 'whiteOutline' | 'automatic';
}

export interface GooglePayJupicoProps extends CommonProps {
  /** Overrides the session amount, like the web component's `amount` attribute. */
  amount?: string | number;
  buttonTheme?: 'dark' | 'light';
}

type NativeEvents = {
  onTransactionComplete: (e: NativeSyntheticEvent<TransactionCompleteEvent>) => void;
  onSubmitError: (e: NativeSyntheticEvent<SubmitErrorEvent>) => void;
  onStatusChange: (e: NativeSyntheticEvent<StatusChangeEvent>) => void;
};

// Resolved lazily: each native view only exists on its own platform.
let NativeApplePay: HostComponent<any> | undefined;
let NativeGooglePay: HostComponent<any> | undefined;

const DEFAULT_STYLE: ViewStyle = { width: '100%', height: 80 };

function nativeEvents(props: CommonProps): NativeEvents {
  return {
    onTransactionComplete: e => props.transactionComplete(e.nativeEvent),
    onSubmitError: e => props.onSubmitError?.(e.nativeEvent),
    onStatusChange: e => props.onStatusChange?.(e.nativeEvent),
  };
}

export function ApplePayJupico(props: ApplePayJupicoProps) {
  const events = nativeEvents(props);
  if (Platform.OS !== 'ios') return null;
  NativeApplePay ??= requireNativeComponent('ApplePayJupicoView');
  return (
    <NativeApplePay
      style={[DEFAULT_STYLE, props.style]}
      sessions={props.sessions ?? undefined}
      merchantIdentifier={props.merchantIdentifier}
      disabled={!!props.disabled}
      buttonStyle={props.buttonStyle ?? 'black'}
      {...events}
    />
  );
}

export function GooglePayJupico(props: GooglePayJupicoProps) {
  const events = nativeEvents(props);
  if (Platform.OS !== 'android') return null;
  NativeGooglePay ??= requireNativeComponent('GooglePayJupicoView');
  return (
    <NativeGooglePay
      style={[DEFAULT_STYLE, props.style]}
      sessions={props.sessions ?? undefined}
      amount={props.amount != null ? String(props.amount) : undefined}
      disabled={!!props.disabled}
      buttonTheme={props.buttonTheme ?? 'dark'}
      {...events}
    />
  );
}
