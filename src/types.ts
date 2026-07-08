/**
 * Public, platform-neutral types for the Jupico Wallets SDK.
 *
 * The design goal: a client writes ONE payment flow. The `PaymentRequest`
 * carries an `apple` block and a `google` block; the SDK routes to whichever
 * native path the current device uses.
 */

/** Card networks the merchant is willing to accept. */
export type CardNetwork =
  | 'visa'
  | 'mastercard'
  | 'amex'
  | 'discover'
  | 'jcb'
  | 'maestro'
  | 'interac';

/**
 * How the payment token is protected end-to-end.
 *
 * - `gateway`: token is encrypted for your PSP (Stripe, Adyen, Braintree, ...).
 *   Your backend forwards it; the PSP charges the card. You stay out of PCI
 *   scope. This is what almost everyone should use.
 * - `direct`: you receive keys/cryptograms you decrypt yourself. This pulls you
 *   into serious PCI DSS obligations. Only choose this if you know why.
 *
 * This choice must match the Apple Pay Payment Processing Certificate you
 * generated and the Google Pay tokenization spec you configured in Phase 0.
 */
export type TokenizationSpec =
  | {
      type: 'gateway';
      /** e.g. "stripe", "adyen", "braintree" — as expected by Google Pay. */
      gateway: string;
      /** Gateway-specific key/value pairs (e.g. { gatewayMerchantId, stripe:version }). */
      parameters: Record<string, string>;
    }
  | {
      type: 'direct';
      /** Base64 elliptic-curve public key used by Google Pay DIRECT tokenization. */
      protocolVersion: string;
      publicKey: string;
    };

/** A single line in the payment sheet summary. The last item is the total. */
export interface LineItem {
  label: string;
  /** Decimal string in major units, e.g. "12.50". Avoids float rounding bugs. */
  amount: string;
  /** iOS only: pending items (e.g. shipping "to be calculated"). */
  status?: 'final' | 'pending';
}

/** iOS / Apple Pay (PassKit) specific configuration. */
export interface ApplePayConfig {
  /** Merchant ID from your Apple Developer account (e.g. "merchant.team.jupico"). */
  merchantIdentifier: string;
  /** Two-letter country code of the merchant, e.g. "US". */
  countryCode: string;
  /**
   * Merchant capabilities. `3ds` is required; `debit`/`credit` restrict types.
   * Defaults to ['3ds'].
   */
  merchantCapabilities?: Array<'3ds' | 'emv' | 'credit' | 'debit'>;
  /** Optional: require billing/shipping contact fields from the user. */
  requiredBillingContactFields?: Array<'name' | 'email' | 'phone' | 'postalAddress'>;
  requiredShippingContactFields?: Array<'name' | 'email' | 'phone' | 'postalAddress'>;
}

/** Android / Google Pay specific configuration. */
export interface GooglePayConfig {
  /**
   * `TEST` returns dummy tokens and needs no approval. `PRODUCTION` requires
   * Google's integration review (see Phase 0). Default: 'TEST'.
   */
  environment?: 'TEST' | 'PRODUCTION';
  /** Your Google Pay merchant ID (required only in PRODUCTION). */
  merchantId?: string;
  /** Display name shown in the Google Pay sheet. */
  merchantName: string;
  /** Google Pay API major.minor version. Defaults to a sane current value. */
  apiVersion?: { major: number; minor: number };
  /** Whether to require billing address / existing payment method, etc. */
  billingAddressRequired?: boolean;
}

/** The single request a client builds; the SDK routes it per platform. */
export interface PaymentRequest {
  /** ISO 4217 currency, e.g. "USD". */
  currencyCode: string;
  /** Order summary lines. Total is derived from the final line item. */
  lineItems: LineItem[];
  /** Total charge, decimal string in major units, e.g. "42.00". */
  totalLabel: string;
  totalAmount: string;
  /** Accepted networks (mapped to each platform's identifiers). */
  supportedNetworks: CardNetwork[];
  /** How the resulting token is protected. Shared by both platforms. */
  tokenization: TokenizationSpec;
  apple: ApplePayConfig;
  google: GooglePayConfig;
}

/** Result returned to JS after a successful authorization. */
export interface PaymentResult {
  /** Which native path produced the token. */
  platform: 'apple-pay' | 'google-pay';
  /**
   * The opaque payment token to forward to your backend → PSP.
   * On Apple Pay this is the base64 PKPaymentToken paymentData;
   * on Google Pay this is the raw JSON string from PaymentData.
   */
  token: string;
  /** Best-effort card metadata for display ("Visa •••• 4242"). Never sensitive. */
  cardNetwork?: string;
  cardDetails?: string;
  /** Contact fields, present only if you requested them. */
  billingContact?: Record<string, unknown>;
  shippingContact?: Record<string, unknown>;
}
