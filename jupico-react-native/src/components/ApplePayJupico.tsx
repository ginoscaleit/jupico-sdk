import React, { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  JupicoWalletError,
  requestOneTimeToken,
  resolveReCaptchaToken,
  validateSession,
} from '../api';
import { buildPlatformOttUrl, buildVgsWalletUrl, PROVIDERS } from '../config';
import { getApplePayButton, NativeWallets, traceNative } from '../native';
import {
  buildApplePayOttBody,
  buildApplePayRequest,
  buildSimulatorOttBody,
  type ApplePayPayment,
  type SimulatorCard,
} from '../payloads';
import { amountString, decodeWalletSession } from '../session';
import type { JupicoWalletSession, WalletComponentProps } from '../types';
import { SimulatorSheet } from './SimulatorSheet';
import { isInteractive, useWalletController } from './useWalletController';
import { WalletFrame } from './WalletFrame';

export interface ApplePayJupicoProps extends WalletComponentProps {
  /**
   * Apple Pay merchant ID from the app's `com.apple.developer.in-app-payments`
   * entitlement. The web flow gets this server-side; PassKit needs it in-app.
   */
  merchantIdentifier: string;
  buttonType?: 'plain' | 'buy' | 'checkout' | 'continue' | 'book' | 'donate' | 'subscribe' | 'order';
  buttonStyle?: 'black' | 'white' | 'whiteOutline' | 'automatic';
  cornerRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * `<apple-pay-jupico>` for React Native.
 *
 * Validates the session, shows the Apple Pay button, presents the sheet,
 * exchanges the Apple Pay token for a Jupico one-time token through VGS and
 * calls `transactionComplete({ oneTimeToken })` — the same steps and payloads
 * as the web component. `provider.type: "simulator"` opens a test sheet instead.
 */
export function ApplePayJupico(props: ApplePayJupicoProps) {
  const { state, setStatus, unavailable, fail, complete, propsRef, log } = useWalletController(
    props,
    'apple-pay',
  );
  const [session, setSession] = useState<JupicoWalletSession>();
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const busy = useRef(false);

  const isSimulator = session?.provider?.type === PROVIDERS.SIMULATOR;

  // Session → status. Re-runs when the merchant passes new sessions.
  useEffect(() => {
    let stale = false;
    const run = async () => {
      setSession(undefined);
      const { sessions, disabled, merchantIdentifier } = propsRef.current;
      log('input', 'props', { sessions, merchantIdentifier, disabled: !!disabled });
      if (!sessions) return unavailable('Waiting for session');
      const s = decodeWalletSession(sessions, 'applePay');
      log('input', s ? 'decoded sessions.applePay' : 'sessions has no applePay entry', s);
      if (!s) return unavailable('No Apple Pay session', invalid('sessions has no applePay entry.'));
      if (s.error) {
        return unavailable(
          'Apple Pay unavailable for this merchant',
          invalid(s.error.message ?? 'Session error.', { ...s.error }),
        );
      }
      const type = s.provider?.type;
      if (type !== PROVIDERS.VGS_APPLEPAY && type !== PROVIDERS.SIMULATOR) {
        return unavailable('Unsupported provider', invalid(`Unsupported Apple Pay provider: ${type ?? 'none'}.`));
      }
      log('step', type === PROVIDERS.SIMULATOR ? 'simulator session: test sheet, no device check' : 'live session: checking the device');
      if (type === PROVIDERS.VGS_APPLEPAY) {
        if (Platform.OS !== 'ios') return unavailable('Apple Pay is only available on iOS');
        const networks = ['visa', 'masterCard', 'amex', 'discover'];
        const canPay = await traceNative(log, 'canMakeApplePayments', networks, () =>
          NativeWallets.canMakeApplePayments(networks),
        );
        if (stale) return;
        if (!canPay) return unavailable("Apple Pay isn't available on this device");
      }
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
      if (!stale) unavailable('Apple Pay unavailable', e);
    });
    return () => {
      stale = true;
    };
  }, [props.sessions, props.disabled, propsRef, setStatus, unavailable, log]);

  const onPress = async () => {
    if (!session || busy.current || !isInteractive(state.status)) return;
    log('step', 'button tapped');
    if (isSimulator) {
      log('step', 'opening simulator sheet');
      setSimulatorOpen(true);
      return;
    }
    busy.current = true;
    setStatus('processing', 'Processing…');
    let payment: ApplePayPayment | undefined;
    try {
      if (!propsRef.current.merchantIdentifier) {
        throw new JupicoWalletError('INVALID_CONFIGURATION', 'merchantIdentifier is required for Apple Pay.');
      }
      const vault = session.provider?.settings?.vault;
      if (!vault) throw new JupicoWalletError('INVALID_SESSION', 'VGS vault configuration is missing');

      const request = buildApplePayRequest(session, propsRef.current.merchantIdentifier);
      payment = await traceNative(log, 'presentApplePay', request, () =>
        NativeWallets.presentApplePay(request),
      );
      log('step', 'authorized by the user; sheet stays open while Jupico tokenizes');
      const reCaptchaToken = await resolveReCaptchaToken(propsRef.current.getReCaptchaToken);
      const ott = await requestOneTimeToken(
        buildVgsWalletUrl(vault, session.provider?.settings?.inboundId, session.environment),
        buildApplePayOttBody(session, payment, reCaptchaToken),
        log,
      );
      // Only now tell Apple it succeeded, like session.completePayment on the web.
      await traceNative(log, 'completeApplePay', true, () => NativeWallets.completeApplePay(true));
      complete(ott);
    } catch (e) {
      if (payment) {
        await traceNative(log, 'completeApplePay', false, () => NativeWallets.completeApplePay(false)).catch(
          () => {},
        );
      }
      fail(e);
    } finally {
      busy.current = false;
    }
  };

  const onSimulatorPay = async (card: SimulatorCard) => {
    if (!session || busy.current) return;
    busy.current = true;
    log('step', `simulator: paying with ${card.displayName} ••${card.last4}`);
    setStatus('processing', 'Processing…');
    try {
      const reCaptchaToken = await resolveReCaptchaToken(propsRef.current.getReCaptchaToken);
      const ott = await requestOneTimeToken(
        buildPlatformOttUrl(session.environment),
        buildSimulatorOttBody(session, card, reCaptchaToken),
        log,
      );
      setSimulatorOpen(false);
      complete(ott);
    } catch (e) {
      setSimulatorOpen(false);
      fail(e);
    } finally {
      busy.current = false;
    }
  };

  const onSimulatorCancel = () => {
    if (busy.current) return;
    log('step', 'simulator sheet cancelled');
    setSimulatorOpen(false);
    fail(new JupicoWalletError('CANCELLED', 'The user cancelled the payment.'));
  };

  // Like the web component, nothing renders where Apple Pay can't run.
  if (Platform.OS !== 'ios' && !isSimulator) return null;

  const NativeButton = getApplePayButton();
  return (
    <>
      <WalletFrame state={state} style={props.style} showButton={!!session}>
        {NativeButton ? (
          <NativeButton
            style={StyleSheet.absoluteFill}
            buttonType={props.buttonType ?? 'buy'}
            buttonStyle={props.buttonStyle ?? 'black'}
            cornerRadius={props.cornerRadius ?? 6}
            onWalletPress={onPress}
          />
        ) : (
          <Pressable style={styles.fallback} onPress={onPress}>
            <Text style={styles.fallbackText}>Pay with Apple Pay · Simulator</Text>
          </Pressable>
        )}
      </WalletFrame>
      {isSimulator && session && (
        <SimulatorSheet
          visible={simulatorOpen}
          description={session.description}
          amount={amountString(session.amount) ?? '0.00'}
          currencyCode={session.currencyCode || 'USD'}
          processing={state.status === 'processing'}
          onPay={onSimulatorPay}
          onCancel={onSimulatorCancel}
        />
      )}
    </>
  );
}

function invalid(message: string, details?: Record<string, unknown>) {
  return new JupicoWalletError('INVALID_SESSION', message, details);
}

const styles = StyleSheet.create({
  fallback: { flex: 1, backgroundColor: '#000', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
