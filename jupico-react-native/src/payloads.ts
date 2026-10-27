/**
 * Request and one-time-token bodies, built exactly like the web components
 * (apple-pay.ce.vue / google-pay.ce.vue) so Jupico and VGS see the same data.
 */
import {
  GOOGLE_PAY_GATEWAY,
  GOOGLE_PAY_GATEWAY_MERCHANT_ID,
  PROVIDERS,
} from './config';
import { amountString } from './session';
import type { JupicoWalletSession } from './types';

// ---------------------------------------------------------------- Apple Pay

/** What the native module turns into a PKPaymentRequest. */
export interface ApplePayRequest {
  merchantIdentifier: string;
  countryCode: string;
  currencyCode: string;
  supportedNetworks: string[];
  merchantCapabilities: string[];
  total: { label: string; amount: string };
  requiredBillingContactFields: string[];
}

/** Mirrors `ApplePayPaymentContact` from Apple Pay JS. */
export interface ApplePayContact {
  givenName?: string;
  familyName?: string;
  addressLines?: string[];
  locality?: string;
  subLocality?: string;
  administrativeArea?: string;
  subAdministrativeArea?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;
  emailAddress?: string;
  phoneNumber?: string;
}

/** What the native module returns: Apple Pay JS's `event.payment` shape. */
export interface ApplePayPayment {
  token: {
    paymentData: Record<string, unknown>;
    paymentMethod: { displayName?: string; network?: string; type?: string };
    transactionIdentifier: string;
  };
  billingContact?: ApplePayContact;
}

export function buildApplePayRequest(
  session: JupicoWalletSession,
  merchantIdentifier: string,
): ApplePayRequest {
  return {
    merchantIdentifier,
    countryCode: session.countryCode || 'US',
    currencyCode: session.currencyCode || 'USD',
    supportedNetworks: ['visa', 'masterCard', 'amex', 'discover'],
    merchantCapabilities: ['supports3DS'],
    total: {
      label: session.description || 'Payment Total',
      amount: amountString(session.amount) ?? '0.00',
    },
    requiredBillingContactFields: ['postalAddress', 'name', 'email', 'phone'],
  };
}

/** Body for the VGS one-time-token route (apple-pay.ce.vue `ottPayload`). */
export function buildApplePayOttBody(
  session: JupicoWalletSession,
  payment: ApplePayPayment,
  reCaptchaToken: string,
) {
  const contact = payment.billingContact ?? {};
  return {
    tokenSessionId: session.tokenSessionId,
    publicKey: session.subMerchantPublicKey,
    token: payment.token,
    cardHolderName: `${contact.givenName ?? ''} ${contact.familyName ?? ''}`.trim(),
    billingContact: contact,
    reCaptchaToken,
  };
}

// ---------------------------------------------------------------- Simulator

export interface SimulatorCard {
  displayName: string;
  network: string;
  type: 'credit' | 'debit';
  last4: string;
  pan: string;
}

export const SIMULATOR_CARDS: SimulatorCard[] = [
  { displayName: 'Test Card: Visa', network: 'visa', type: 'credit', last4: '1111', pan: '4111111111111111' },
  { displayName: 'Test Card: Mastercard', network: 'mastercard', type: 'credit', last4: '4444', pan: '5555555555554444' },
  { displayName: 'Test Card: Discover', network: 'discover', type: 'credit', last4: '1117', pan: '6011111111111117' },
  { displayName: 'Test Card: Amex', network: 'amex', type: 'credit', last4: '0005', pan: '378282246310005' },
  { displayName: 'Test Debit: Visa', network: 'visa', type: 'debit', last4: '1112', pan: '4111111111111112' },
  { displayName: 'Test Debit: Mastercard', network: 'mastercard', type: 'debit', last4: '4445', pan: '5555555555554445' },
  { displayName: 'Test Debit: Discover', network: 'discover', type: 'debit', last4: '1118', pan: '6011111111111118' },
];

const SIMULATOR_BILLING_CONTACT = {
  givenName: 'Simulator',
  familyName: 'User',
  addressLines: ['1 Market St'],
  locality: 'San Francisco',
  administrativeArea: 'CA',
  postalCode: '94102',
  countryCode: 'US',
};

/** Body for hosted-api's non-production OTT route (apple-pay.ce.vue `confirmSimulator`). */
export function buildSimulatorOttBody(
  session: JupicoWalletSession,
  card: SimulatorCard,
  reCaptchaToken: string,
) {
  return {
    publicKey: session.subMerchantPublicKey,
    tokenSessionId: session.tokenSessionId,
    cardHolderName: `${SIMULATOR_BILLING_CONTACT.givenName} ${SIMULATOR_BILLING_CONTACT.familyName}`,
    cardNumberAlias: card.pan,
    expirationMonth: '12',
    expirationYear: '2030',
    reCaptchaToken,
    provider: PROVIDERS.VGS_APPLEPAY,
    apple_pay_token: {
      token: {
        paymentData: {
          data: {
            paymentData: {
              onlinePaymentCryptogram: 'AAABBJg0VhI0VniQEjRWAAAAAAA=',
              eciIndicator: '02',
            },
          },
        },
      },
    },
    billingContact: SIMULATOR_BILLING_CONTACT,
  };
}

// --------------------------------------------------------------- Google Pay

/** google-pay.ce.vue `paymentRequest`. */
export function buildGooglePayRequest(session: JupicoWalletSession, amountOverride?: string | number) {
  const settings = session.provider?.settings;
  const merchantInfo: Record<string, string> = {};
  if (settings?.merchantId) merchantInfo.merchantId = settings.merchantId;
  if (settings?.merchantName) merchantInfo.merchantName = settings.merchantName;
  return {
    apiVersion: 2,
    apiVersionMinor: 0,
    allowedPaymentMethods: [
      {
        type: 'CARD',
        parameters: {
          allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
          allowedCardNetworks: ['AMEX', 'VISA', 'MASTERCARD', 'DISCOVER'],
          billingAddressRequired: true,
          billingAddressParameters: { format: 'FULL', phoneNumberRequired: false },
        },
        tokenizationSpecification: {
          type: 'PAYMENT_GATEWAY',
          parameters: {
            gateway: GOOGLE_PAY_GATEWAY,
            gatewayMerchantId: GOOGLE_PAY_GATEWAY_MERCHANT_ID,
          },
        },
      },
    ],
    ...(Object.keys(merchantInfo).length ? { merchantInfo } : {}),
    transactionInfo: {
      totalPriceStatus: 'FINAL',
      totalPriceLabel: 'Total',
      // The web reads provider.settings.amount here (a bug: it is never set);
      // the session's own amount is what the backend actually returns.
      totalPrice: amountString(amountOverride) ?? amountString(session.amount) ?? '0.00',
      currencyCode: session.currencyCode || 'USD',
      countryCode: session.countryCode || 'US',
    },
  };
}

export function googlePayEnvironment(session: JupicoWalletSession): 'PRODUCTION' | 'TEST' {
  return session.environment === 'production' ? 'PRODUCTION' : 'TEST';
}

/** Body for the VGS one-time-token route (google-pay.ce.vue `vgsPayload`). */
export function buildGooglePayOttBody(
  session: JupicoWalletSession,
  paymentData: any,
  reCaptchaToken: string,
) {
  const billingAddress = paymentData?.paymentMethodData?.info?.billingAddress;
  const cardHolderName: string | undefined = billingAddress?.name;
  return {
    cardHolderName,
    body: {
      publicKey: session.subMerchantPublicKey,
      tokenSessionId: session.tokenSessionId,
      cardHolderName,
      billing: {
        name: cardHolderName,
        address: billingAddress?.address1 || '',
        city: billingAddress?.locality || '',
        state: billingAddress?.administrativeArea || '',
        zipCode: billingAddress?.postalCode || '',
        country: billingAddress?.countryCode || 'US',
        phone: billingAddress?.phoneNumber || '',
        email: paymentData?.email || '',
      },
      google_pay_payload: {
        token: JSON.parse(paymentData.paymentMethodData.tokenizationData.token),
      },
      reCaptchaToken,
    },
  };
}
