import React, {useEffect, useState} from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import {
  activeWallet,
  isSupported,
  canMakePayments,
  requestPayment,
  WalletError,
  type PaymentRequest,
} from '@jupico/react-native-wallets';

// Google's canonical TEST tokenization: returns a dummy token with no real PSP.
// On iOS the merchantIdentifier MUST match an entry in the app's
// com.apple.developer.in-app-payments entitlement, or PassKit refuses to
// present the sheet. A live sheet also requires a real device with a card.
const request: PaymentRequest = {
  currencyCode: 'USD',
  lineItems: [
    {label: 'Cappuccino', amount: '4.50'},
    {label: 'Tax', amount: '0.40'},
  ],
  totalLabel: 'Jupico Coffee',
  totalAmount: '4.90',
  supportedNetworks: ['visa', 'mastercard', 'amex'],
  tokenization: {
    type: 'gateway',
    gateway: 'example',
    parameters: {gatewayMerchantId: 'exampleGatewayMerchantId'},
  },
  apple: {
    merchantIdentifier: 'merchant.com.jupico.prod',
    countryCode: 'US',
    merchantCapabilities: ['3ds'],
  },
  google: {
    merchantName: 'Jupico Coffee',
    environment: 'TEST',
  },
};

type Line = {label: string; value: string; ok?: boolean};

export default function App() {
  const [lines, setLines] = useState<Line[]>([]);
  const [result, setResult] = useState<string>('');

  const log = (label: string, value: string, ok?: boolean) =>
    setLines(prev => [...prev, {label, value, ok}]);

  useEffect(() => {
    (async () => {
      log('Platform', `${Platform.OS} → ${activeWallet()}`);
      try {
        const supported = await isSupported();
        log('isSupported()', String(supported), supported);
        const can = await canMakePayments(request);
        log('canMakePayments()', String(can), can);
      } catch (e) {
        log('capability check', String(e), false);
      }
    })();
  }, []);

  const onPay = async () => {
    setResult('Presenting sheet…');
    try {
      const res = await requestPayment(request);
      setResult(
        `✅ ${res.platform}\n` +
          `network: ${res.cardNetwork ?? '—'}\n` +
          `token: ${res.token.slice(0, 40)}…`,
      );
    } catch (e) {
      if (e instanceof WalletError) {
        setResult(`⚠️ ${e.code}\n${e.message}`);
      } else {
        setResult(`❌ ${String(e)}`);
      }
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Jupico Wallets SDK</Text>
        <Text style={styles.subtitle}>Apple Pay · Google Pay demo</Text>

        <View style={styles.card}>
          {lines.map((l, i) => (
            <View style={styles.row} key={i}>
              <Text style={styles.rowLabel}>{l.label}</Text>
              <Text
                style={[
                  styles.rowValue,
                  l.ok === true && styles.ok,
                  l.ok === false && styles.bad,
                ]}>
                {l.value}
              </Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.payButton} onPress={onPay}>
          <Text style={styles.payText}>Pay {request.totalAmount} USD</Text>
        </TouchableOpacity>

        {!!result && (
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>{result}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0b0b0f'},
  content: {padding: 24, gap: 16},
  title: {color: '#fff', fontSize: 26, fontWeight: '700', marginTop: 24},
  subtitle: {color: '#8a8a99', fontSize: 15, marginBottom: 8},
  card: {backgroundColor: '#17171f', borderRadius: 14, padding: 16, gap: 10},
  row: {flexDirection: 'row', justifyContent: 'space-between'},
  rowLabel: {color: '#b8b8c8', fontSize: 15},
  rowValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },
  ok: {color: '#3ddc84'},
  bad: {color: '#ff6b6b'},
  payButton: {
    backgroundColor: '#000',
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  payText: {color: '#fff', fontSize: 17, fontWeight: '700'},
  resultBox: {backgroundColor: '#17171f', borderRadius: 14, padding: 16},
  resultText: {
    color: '#e8e8f0',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
