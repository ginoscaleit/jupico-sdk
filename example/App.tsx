import React, {useCallback, useMemo, useState} from 'react';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ApplePayJupico,
  GooglePayJupico,
  type JupicoSessions,
  type JupicoWalletSession,
  type StatusChangeEvent,
  type SubmitErrorEvent,
  type TransactionCompleteEvent,
} from '@jupico/react-native-wallets';

// Must match the com.apple.developer.in-app-payments entitlement of this app.
const MERCHANT_ID = 'merchant.com.jupico.prod';

type Scenario = 'live' | 'simulator' | 'invalid';

const SCENARIOS: {key: Scenario; label: string; hint: string}[] = [
  {
    key: 'live',
    label: 'Live wallet',
    hint: 'Real Apple Pay / Google Pay sheet. Needs a card in Wallet. Nothing is charged.',
  },
  {
    key: 'simulator',
    label: 'Simulator',
    hint: 'provider.type = "simulator": choose Pay, Decline or Cancel to trigger each scenario.',
  },
  {
    key: 'invalid',
    label: 'Invalid session',
    hint: 'The backend refused the wallet; the component reports it through onSubmitError.',
  },
];

/**
 * Stand-in for what the merchant backend gets from
 * POST /v1/sessions/browser/authorize → data.sessions. The shape (base64 `data`
 * envelope, applePay/googlePay entries) is exactly what the web components get.
 */
function demoSessions(scenario: Scenario): JupicoSessions {
  const wallet = (type: string): JupicoWalletSession => ({
    provider: {type, settings: {vault: 'tntkkrpdnva'}},
    tokenSessionId: `demo-${Date.now()}`,
    subMerchantPublicKey: 'pk_demo',
    environment: 'sandbox',
    amount: '4.90',
    description: 'Jupico Coffee',
    countryCode: 'US',
    currencyCode: 'USD',
  });
  const refused: JupicoWalletSession = {
    error: {
      httpCode: 401,
      code: 'auth_submerchant_feature_disabled',
      message: 'Submerchant feature disabled.',
    },
  };
  const decoded =
    scenario === 'invalid'
      ? {applePay: refused, googlePay: refused}
      : scenario === 'simulator'
      ? {applePay: wallet('simulator'), googlePay: wallet('simulator')}
      : {applePay: wallet('vgs-applepay'), googlePay: wallet('vgs-googlepay')};
  // Sent to the component base64-encoded, exactly as the API returns it.
  return typeof btoa === 'function'
    ? {data: btoa(JSON.stringify(decoded))}
    : decoded;
}

const decodeForLog = (s: JupicoSessions) =>
  typeof s.data === 'string' && typeof atob === 'function'
    ? JSON.parse(atob(s.data))
    : s;

type LogKind = 'info' | 'status' | 'success' | 'error';
type LogEntry = {id: number; time: string; kind: LogKind; title: string; body?: string};

let nextId = 1;
const now = () => new Date().toTimeString().slice(0, 8);

export default function App() {
  const [scenario, setScenario] = useState<Scenario>('simulator');
  const [log, setLog] = useState<LogEntry[]>([]);

  const append = useCallback(
    (kind: LogKind, title: string, payload?: unknown) =>
      setLog(prev => [
        {
          id: nextId++,
          time: now(),
          kind,
          title,
          body: payload === undefined ? undefined : JSON.stringify(payload, null, 2),
        },
        ...prev,
      ]),
    [],
  );

  const sessions = useMemo(() => {
    const s = demoSessions(scenario);
    append('info', `sessions loaded · ${scenario} (decoded)`, decodeForLog(s));
    return s;
  }, [scenario, append]);

  // The three handlers a client implements.
  const transactionComplete = (e: TransactionCompleteEvent) => {
    append('success', 'transactionComplete', e);
    // Client: POST e.oneTimeToken.paymentToken.data to your backend → sale.
  };
  const onSubmitError = (e: SubmitErrorEvent) =>
    append('error', `onSubmitError · ${e.error.code}`, e);
  const onStatusChange = (e: StatusChangeEvent) =>
    append('status', `status → ${e.status}`, e.message ? e : undefined);

  const active = SCENARIOS.find(s => s.key === scenario)!;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Jupico Wallets SDK</Text>
        <Text style={styles.subtitle}>
          Native UI components · {Platform.OS === 'ios' ? 'Apple Pay' : 'Google Pay'} ·
          proof of concept
        </Text>

        <View style={styles.segment}>
          {SCENARIOS.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[styles.segmentItem, s.key === scenario && styles.segmentActive]}
              onPress={() => setScenario(s.key)}>
              <Text
                style={[styles.segmentText, s.key === scenario && styles.segmentTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.hint}>{active.hint}</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Cappuccino + tax · $4.90</Text>
          {/* key remounts the component so each scenario starts clean. */}
          {Platform.OS === 'ios' ? (
            <ApplePayJupico
              key={scenario}
              sessions={sessions}
              merchantIdentifier={MERCHANT_ID}
              buttonStyle="white"
              transactionComplete={transactionComplete}
              onSubmitError={onSubmitError}
              onStatusChange={onStatusChange}
            />
          ) : (
            <GooglePayJupico
              key={scenario}
              sessions={sessions}
              buttonTheme="light"
              transactionComplete={transactionComplete}
              onSubmitError={onSubmitError}
              onStatusChange={onStatusChange}
            />
          )}
        </View>

        <View style={styles.logHeader}>
          <Text style={styles.logTitle}>Event log</Text>
          <TouchableOpacity onPress={() => setLog([])}>
            <Text style={styles.clear}>Clear</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.logBox}>
          {log.length === 0 && <Text style={styles.empty}>No events yet</Text>}
          {log.map(entry => (
            <View key={entry.id} style={styles.logEntry}>
              <View style={styles.logRow}>
                <View style={[styles.dot, dotColor[entry.kind]]} />
                <Text style={styles.logEntryTitle}>{entry.title}</Text>
                <Text style={styles.logTime}>{entry.time}</Text>
              </View>
              {!!entry.body && <Text style={styles.logBody}>{entry.body}</Text>}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const dotColor = StyleSheet.create({
  info: {backgroundColor: '#8a8a99'},
  status: {backgroundColor: '#5b8cff'},
  success: {backgroundColor: '#3ddc84'},
  error: {backgroundColor: '#ff6b6b'},
});

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0b0b0f'},
  content: {padding: 20, gap: 14},
  title: {color: '#fff', fontSize: 26, fontWeight: '700', marginTop: 16},
  subtitle: {color: '#8a8a99', fontSize: 14},
  segment: {
    flexDirection: 'row',
    backgroundColor: '#17171f',
    borderRadius: 10,
    padding: 3,
    marginTop: 6,
  },
  segmentItem: {flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center'},
  segmentActive: {backgroundColor: '#2c2c3a'},
  segmentText: {color: '#8a8a99', fontSize: 13, fontWeight: '600'},
  segmentTextActive: {color: '#fff'},
  hint: {color: '#8a8a99', fontSize: 13, lineHeight: 18},
  card: {backgroundColor: '#17171f', borderRadius: 14, padding: 16, gap: 12},
  cardLabel: {color: '#e8e8f0', fontSize: 15, fontWeight: '600'},
  logHeader: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 6},
  logTitle: {color: '#fff', fontSize: 17, fontWeight: '700'},
  clear: {color: '#5b8cff', fontSize: 15},
  logBox: {backgroundColor: '#17171f', borderRadius: 14, padding: 12, gap: 10},
  empty: {color: '#8a8a99', fontSize: 13},
  logEntry: {gap: 4},
  logRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  dot: {width: 8, height: 8, borderRadius: 4},
  logEntryTitle: {color: '#e8e8f0', fontSize: 14, fontWeight: '600', flex: 1},
  logTime: {color: '#8a8a99', fontSize: 12, fontFamily: mono},
  logBody: {
    color: '#b8b8c8',
    fontSize: 11,
    fontFamily: mono,
    backgroundColor: '#0f0f15',
    borderRadius: 8,
    padding: 8,
  },
});
