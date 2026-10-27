import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import {
  JupicoWalletError,
  requestOneTimeToken,
  resolveReCaptchaToken,
  validateSession,
} from '../api';
import { buildVgsWalletUrl, PROVIDERS } from '../config';
import { getGooglePayButton, NativeWallets, traceNative } from '../native';
import {
  buildGooglePayOttBody,
  buildGooglePayRequest,
  googlePayEnvironment,
} from '../payloads';
import { decodeWalletSession } from '../session';
import type { JupicoWalletSession, WalletComponentProps } from '../types';
import { isInteractive, useWalletController } from './useWalletController';
import { WalletFrame } from './WalletFrame';

export interface GooglePayJupicoProps extends WalletComponentProps {
  /** Overrides the session amount, like the web component's `amount` attribute. */
  amount?: string | number;
  buttonTheme?: 'dark' | 'light';
  buttonType?: 'pay' | 'buy' | 'checkout' | 'order' | 'subscribe' | 'donate' | 'book' | 'plain';
  style?: StyleProp<ViewStyle>;
}

/**
 * `<google-pay-jupico>` for React Native.
 *
 * Validates the session, shows the Google Pay button, opens the Google Pay
 * sheet, exchanges the token for a Jupico one-time token through VGS and calls
 * `transactionComplete({ oneTimeToken })` — the same steps and payloads as the
 * web component. Simulator sessions use Google's TEST environment, as on the web.
 */
export function GooglePayJupico(props: GooglePayJupicoProps) {
  const { state, setStatus, unavailable, fail, complete, propsRef, log } = useWalletController(
    props,
    'google-pay',
  );
  const [session, setSession] = useState<JupicoWalletSession>();
  const busy = useRef(false);

  const decoded = useMemo(() => decodeWalletSession(props.sessions, 'googlePay'), [props.sessions]);
  const requestJson = useMemo(
    () => (decoded ? JSON.stringify(buildGooglePayRequest(decoded, props.amount)) : undefined),
    [decoded, props.amount],
  );
  const allowedPaymentMethods = useMemo(
    () => (decoded ? JSON.stringify(buildGooglePayRequest(decoded).allowedPaymentMethods) : '[]'),
    [decoded],
  );

  useEffect(() => {
    let stale = false;
    const run = async () => {
      setSession(undefined);
      if (Platform.OS !== 'android') return;
      const { sessions, disabled, amount } = propsRef.current;
      log('input', 'props', { sessions, amount, disabled: !!disabled });
      if (!sessions) return unavailable('Waiting for session');
      const s = decoded;
      log('input', s ? 'decoded sessions.googlePay' : 'sessions has no googlePay entry', s);
      if (!s) return unavailable('No Google Pay session', invalid('sessions has no googlePay entry.'));
      if (s.error) {
        return unavailable(
          'Google Pay unavailable for this merchant',
          invalid(s.error.message ?? 'Session error.', { ...s.error }),
        );
      }
      const type = s.provider?.type;
      if (type !== PROVIDERS.VGS_GPAY && type !== PROVIDERS.SIMULATOR) {
        return unavailable('Unsupported provider', invalid(`Unsupported Google Pay provider: ${type ?? 'none'}.`));
      }
      const environment = googlePayEnvironment(s);
      log('step', `${type} session: Google Pay ${environment} environment`);
      const ready = await traceNative(
        log,
        'isGooglePayReady',
        { request: JSON.parse(requestJson!), environment },
        () => NativeWallets.isGooglePayReady(requestJson!, environment),
      );
      if (stale) return;
      if (!ready) return unavailable("Google Pay isn't available on this device");
      setStatus('loading', 'Validating session…');
      try {
        await validateSession(s, log);
      } catch (e) {
        if (!stale) unavailable('Session could not be validated', e);
        return;
      }
      if (stale) return;
      setSession(s);
      setStatus(disabled ? 'disabled' : 'ready');
    };
    run().catch(e => {
      if (!stale) unavailable('Google Pay unavailable', e);
    });
    return () => {
      stale = true;
    };
  }, [decoded, requestJson, props.disabled, propsRef, setStatus, unavailable, log]);

  const onPress = async () => {
    if (!session || !requestJson || busy.current || !isInteractive(state.status)) return;
    log('step', 'button tapped');
    busy.current = true;
    setStatus('processing', 'Processing payment…');
    try {
      const vault = session.provider?.settings?.vault;
      if (!vault) throw new JupicoWalletError('INVALID_SESSION', 'VGS vault configuration is missing');

      const environment = googlePayEnvironment(session);
      const paymentData = JSON.parse(
        await traceNative(
          log,
          'loadGooglePayPaymentData',
          { request: JSON.parse(requestJson), environment },
          () => NativeWallets.loadGooglePayPaymentData(requestJson, environment),
        ),
      );
      log('step', 'authorized by the user; Google Pay paymentData', paymentData);
      const reCaptchaToken = await resolveReCaptchaToken(propsRef.current.getReCaptchaToken);
      let ott;
      try {
        ott = buildGooglePayOttBody(session, paymentData, reCaptchaToken);
      } catch {
        throw new JupicoWalletError('TOKENIZATION_FAILED', 'Invalid payment token format');
      }
      if (!ott.cardHolderName) {
        throw new JupicoWalletError(
          'PAYMENT_FAILED',
          'Cardholder name is required for payment. Please update your Google Pay profile or use a different payment method.',
        );
      }
      const token = await requestOneTimeToken(
        buildVgsWalletUrl(vault, session.provider?.settings?.inboundId, session.environment),
        ott.body,
        log,
      );
      complete(token);
    } catch (e) {
      fail(e);
    } finally {
      busy.current = false;
    }
  };

  // Like the web component, nothing renders where Google Pay can't run.
  if (Platform.OS !== 'android') return null;

  const NativeButton = getGooglePayButton()!;
  return (
    <WalletFrame state={state} style={props.style} showButton={!!session}>
      <NativeButton
        style={StyleSheet.absoluteFill}
        allowedPaymentMethods={allowedPaymentMethods}
        buttonTheme={props.buttonTheme ?? 'dark'}
        buttonType={props.buttonType ?? 'pay'}
        onWalletPress={onPress}
      />
    </WalletFrame>
  );
}

function invalid(message: string, details?: Record<string, unknown>) {
  return new JupicoWalletError('INVALID_SESSION', message, details);
}
