import type { WalletLogEntry } from './logger';

/**
 * Public types. Names and shapes follow the web components
 * (`<apple-pay-jupico>` / `<google-pay-jupico>`) so a merchant's backend and
 * handlers work unchanged on web and in React Native.
 */

export type JupicoEnvironment =
  | 'local'
  | 'development'
  | 'stage'
  | 'sandbox'
  | 'production';

/** One wallet entry of the decoded authorize-session response. */
export interface JupicoWalletSession {
  provider?: {
    /** `vgs-applepay` | `vgs-googlepay` | `simulator` */
    type?: string;
    settings?: {
      vault?: string;
      inboundId?: string;
      merchantId?: string;
      merchantName?: string;
      [key: string]: unknown;
    };
  };
  tokenSessionId?: string;
  subMerchantPublicKey?: string;
  environment?: JupicoEnvironment | string;
  amount?: string | number;
  description?: string;
  countryCode?: string;
  currencyCode?: string;
  /** Present when the backend refused this wallet (e.g. feature disabled). */
  error?: {
    httpCode?: number;
    code?: string;
    message?: string;
    explanation?: string;
  };
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

/** Same shape the web components hand to `transactionComplete`. */
export interface OneTimeToken {
  paymentToken: { data: string };
}

export interface TransactionCompleteEvent {
  oneTimeToken: OneTimeToken;
}

export type WalletErrorCode =
  /** The user closed the sheet. */
  | 'CANCELLED'
  /** `sessions` is missing, malformed, expired, or refused by Jupico. */
  | 'INVALID_SESSION'
  /** A prop is missing or wrong (e.g. no merchantIdentifier on iOS). */
  | 'INVALID_CONFIGURATION'
  /** Jupico / VGS could not turn the wallet token into a one-time token. */
  | 'TOKENIZATION_FAILED'
  /** The wallet sheet itself failed. */
  | 'PAYMENT_FAILED'
  /** Request never got a response. */
  | 'NETWORK_ERROR';

/** Same shape as the web `submit-error` detail, plus a stable `code`. */
export interface SubmitErrorEvent {
  error: {
    code: WalletErrorCode;
    message: string;
    [key: string]: unknown;
  };
}

export type WalletStatus =
  | 'loading'
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

/** Props shared by both components. */
export interface WalletComponentProps {
  sessions: JupicoSessions | null | undefined;
  /** Success: receives the Jupico one-time token for your backend's sale call. */
  transactionComplete: (event: TransactionCompleteEvent) => void;
  /** Failure: the RN equivalent of the web `submit-error` event. */
  onSubmitError?: (event: SubmitErrorEvent) => void;
  onStatusChange?: (event: StatusChangeEvent) => void;
  disabled?: boolean;
  /**
   * Supplies the `reCaptchaToken` Jupico expects on tokenization. Browsers get
   * it from reCAPTCHA Enterprise; native apps have no equivalent yet, so when
   * this is omitted a fixed marker is sent (see README, "Known gaps").
   */
  getReCaptchaToken?: () => Promise<string>;
  /**
   * Step-by-step trace: inputs, requests/responses, native calls, statuses
   * and outputs. For integration and demos (see logger.ts).
   */
  onLog?: (entry: WalletLogEntry) => void;
  /** Also print the trace with console.log. */
  debug?: boolean;
}
