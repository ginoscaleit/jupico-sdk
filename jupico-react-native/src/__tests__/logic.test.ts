import { buildPlatformOttUrl, buildValidateUrl, buildVgsWalletUrl } from '../config';
import {
  buildApplePayOttBody,
  buildApplePayRequest,
  buildGooglePayOttBody,
  buildGooglePayRequest,
  buildSimulatorOttBody,
  googlePayEnvironment,
  SIMULATOR_CARDS,
} from '../payloads';
import { base64ToUtf8, decodeWalletSession } from '../session';
import type { JupicoWalletSession } from '../types';

const applePay: JupicoWalletSession = {
  provider: { type: 'vgs-applepay', settings: { vault: 'tntkkrpdnva', inboundId: 'rt123' } },
  tokenSessionId: 'ses-1',
  subMerchantPublicKey: 'pk1',
  environment: 'sandbox',
  amount: 2.2,
  description: 'Test Apple Pay',
  countryCode: 'US',
  currencyCode: 'USD',
};

const encode = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');

describe('decodeWalletSession', () => {
  it('decodes the base64 data envelope returned by authorize', () => {
    expect(decodeWalletSession({ data: encode({ applePay }) }, 'applePay')).toEqual(applePay);
  });

  it('accepts URL-safe base64 and UTF-8 content', () => {
    const urlSafe = encode({ googlePay: { description: 'Café ☕' } }).replace(/\+/g, '-').replace(/\//g, '_');
    expect(decodeWalletSession({ data: urlSafe }, 'googlePay')?.description).toBe('Café ☕');
  });

  it('accepts already-decoded sessions', () => {
    expect(decodeWalletSession({ applePay }, 'applePay')).toBe(applePay);
  });

  it('returns undefined for missing or garbage input', () => {
    expect(decodeWalletSession(undefined, 'applePay')).toBeUndefined();
    expect(decodeWalletSession({ data: '!!!' }, 'applePay')).toBeUndefined();
    expect(decodeWalletSession({ applePay }, 'googlePay')).toBeUndefined();
  });

  it('base64ToUtf8 round-trips', () => {
    expect(base64ToUtf8(Buffer.from('héllo').toString('base64'))).toBe('héllo');
  });
});

describe('URLs (same as web-components config.ts)', () => {
  it('builds the VGS wallet URL per environment', () => {
    expect(buildVgsWalletUrl('tntkkrpdnva', 'rt123', 'sandbox')).toBe(
      'https://tntkkrpdnva-rt123.sandbox.verygoodproxy.com/v1/tokenization/creditcard/onetimetoken',
    );
    expect(buildVgsWalletUrl('v', undefined, 'production')).toBe(
      'https://v.live.verygoodproxy.com/v1/tokenization/creditcard/onetimetoken',
    );
  });

  it('builds hosted-api URLs and falls back to local', () => {
    expect(buildValidateUrl('sandbox')).toBe(
      'https://sandbox-payments-hosted-api.jupico.com/api/v1/tokenization/session/browser/validate',
    );
    expect(buildPlatformOttUrl('nope')).toBe(
      'http://local-payments-hosted-api.jupico.com/api/v1/tokenization/creditcard/onetimetoken',
    );
  });
});

describe('Apple Pay payloads', () => {
  it('builds the request like ApplePaySession(3, …)', () => {
    expect(buildApplePayRequest(applePay, 'merchant.x')).toEqual({
      merchantIdentifier: 'merchant.x',
      countryCode: 'US',
      currencyCode: 'USD',
      supportedNetworks: ['visa', 'masterCard', 'amex', 'discover'],
      merchantCapabilities: ['supports3DS'],
      total: { label: 'Test Apple Pay', amount: '2.2' },
      requiredBillingContactFields: ['postalAddress', 'name', 'email', 'phone'],
    });
  });

  it('builds the VGS body like onpaymentauthorized', () => {
    const payment = {
      token: { paymentData: { version: 'EC_v1' }, paymentMethod: { network: 'Visa' }, transactionIdentifier: 'tx' },
      billingContact: { givenName: 'Ada', familyName: 'Lovelace' },
    };
    expect(buildApplePayOttBody(applePay, payment, 'rc')).toEqual({
      tokenSessionId: 'ses-1',
      publicKey: 'pk1',
      token: payment.token,
      cardHolderName: 'Ada Lovelace',
      billingContact: payment.billingContact,
      reCaptchaToken: 'rc',
    });
  });

  it('builds the simulator body like confirmSimulator', () => {
    const body = buildSimulatorOttBody(applePay, SIMULATOR_CARDS[1]!, 'rc');
    expect(body).toMatchObject({
      publicKey: 'pk1',
      tokenSessionId: 'ses-1',
      cardHolderName: 'Simulator User',
      cardNumberAlias: '5555555555554444',
      expirationMonth: '12',
      expirationYear: '2030',
      provider: 'vgs-applepay',
    });
    expect(body.apple_pay_token.token.paymentData.data.paymentData.onlinePaymentCryptogram).toBeTruthy();
  });
});

describe('Google Pay payloads', () => {
  const googlePay: JupicoWalletSession = {
    ...applePay,
    provider: { type: 'vgs-googlepay', settings: { vault: 'v', merchantId: 'm1', merchantName: 'Demo' } },
  };

  it('builds the paymentRequest with the VGS gateway and session amount', () => {
    const r = buildGooglePayRequest(googlePay);
    expect(r.allowedPaymentMethods[0]!.tokenizationSpecification.parameters).toEqual({
      gateway: 'verygoodsecurity',
      gatewayMerchantId: 'ACgtnCohNkFmTpkULj2jaRvX',
    });
    expect(r.merchantInfo).toEqual({ merchantId: 'm1', merchantName: 'Demo' });
    expect(r.transactionInfo.totalPrice).toBe('2.2');
    expect(buildGooglePayRequest(googlePay, '9.99').transactionInfo.totalPrice).toBe('9.99');
  });

  it('maps the environment', () => {
    expect(googlePayEnvironment(googlePay)).toBe('TEST');
    expect(googlePayEnvironment({ ...googlePay, environment: 'production' })).toBe('PRODUCTION');
  });

  it('builds the VGS body like onLoadPaymentData', () => {
    const paymentData = {
      email: 'a@b.c',
      paymentMethodData: {
        info: { billingAddress: { name: 'Ada L', address1: '1 St', locality: 'SF', administrativeArea: 'CA', postalCode: '94102', countryCode: 'US' } },
        tokenizationData: { token: '{"signature":"s"}' },
      },
    };
    const { cardHolderName, body } = buildGooglePayOttBody(googlePay, paymentData, 'rc');
    expect(cardHolderName).toBe('Ada L');
    expect(body.billing).toEqual({
      name: 'Ada L', address: '1 St', city: 'SF', state: 'CA', zipCode: '94102', country: 'US', phone: '', email: 'a@b.c',
    });
    expect(body.google_pay_payload).toEqual({ token: { signature: 's' } });
  });
});

describe('logger', () => {
  const { createWalletLog, redact } = require('../logger');

  it('truncates long values and masks contact details', () => {
    const out = redact({
      token: 'x'.repeat(200),
      billingContact: { givenName: 'Ada', emailAddress: 'ada@example.com', phoneNumber: '+14155550100' },
    });
    expect(out.token).toBe(`${'x'.repeat(40)}…(200 chars)`);
    expect(out.billingContact).toEqual({ givenName: 'Ada', emailAddress: 'ad••••om', phoneNumber: '+1••••00' });
  });

  it('delivers entries to onLog and never throws from a broken logger', () => {
    const entries: any[] = [];
    createWalletLog('apple-pay', () => ({ onLog: (e: any) => entries.push(e) }))('status', '→ ready');
    expect(entries[0]).toMatchObject({ wallet: 'apple-pay', kind: 'status', message: '→ ready' });
    const broken = createWalletLog('apple-pay', () => ({ onLog: () => { throw new Error('boom'); } }));
    expect(() => broken('step', 'x')).not.toThrow();
  });
});
