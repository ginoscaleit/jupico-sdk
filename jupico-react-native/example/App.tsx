import React, {useCallback, useState} from 'react';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ApplePayJupico,
  decodeWalletSession,
  GooglePayJupico,
  type JupicoSessions,
  type SubmitErrorEvent,
  type TransactionCompleteEvent,
  type WalletLogEntry,
  type WalletLogKind,
} from '@jupico/react-native-wallets';

// Apple encrypts the token for this Merchant ID's processing certificate, so it
// must be the one the environment's VGS route decrypts with (the same one the
// web uses there). Each must also be in this app's in-app-payments entitlement.
const MERCHANT_IDS: Record<string, string> = {
  development: 'merchant.com.jupico.dev',
  sandbox: 'merchant.com.jupico.applepay',
  production: 'merchant.com.jupico.prod',
};
const merchantIdFor = (s: JupicoSessions | null) =>
  MERCHANT_IDS[decodeWalletSession(s, 'applePay')?.environment ?? ''] ?? MERCHANT_IDS.production!;
// Platform API that creates the session. The session it returns carries its
// environment, and the SDK picks hosted-api and VGS from that.
const AUTHORIZE_URLS = {
  sandbox: 'https://sandbox-platform.jupico.com/v1/sessions/browser/authorize',
  dev: 'https://dev-platform.jupico.com/v1/sessions/browser/authorize',
};

type Source = 'create' | 'paste';
type Env = keyof typeof AUTHORIZE_URLS;

/** SDK trace kinds, plus what the demo app itself does. */
type Kind = WalletLogKind | 'app' | 'handler';
type LogEntry = {
  id: number;
  time: string;
  kind: Kind;
  title: string;
  body?: string;
};

const KIND_META: Record<Kind, {label: string; color: string; arrow: string}> = {
  input: {label: 'INPUT', color: '#b48cff', arrow: '⇢'},
  step: {label: 'STEP', color: '#8a8a99', arrow: '·'},
  request: {label: 'REQUEST', color: '#ffb547', arrow: '↑'},
  response: {label: 'RESPONSE', color: '#ffd68a', arrow: '↓'},
  native: {label: 'NATIVE', color: '#4fd1c5', arrow: '⇄'},
  status: {label: 'STATUS', color: '#5b8cff', arrow: '●'},
  output: {label: 'OUTPUT', color: '#3ddc84', arrow: '⇠'},
  handler: {label: 'HANDLER', color: '#3ddc84', arrow: '✓'},
  app: {label: 'APP', color: '#e8e8f0', arrow: '▸'},
};

const FILTERS: {key: string; label: string; kinds: Kind[] | null}[] = [
  {key: 'all', label: 'All', kinds: null},
  {key: 'in', label: 'Inputs', kinds: ['input']},
  {key: 'net', label: 'Network', kinds: ['request', 'response']},
  {key: 'native', label: 'Native', kinds: ['native']},
  {key: 'status', label: 'Status', kinds: ['status', 'step']},
  {key: 'out', label: 'Outputs', kinds: ['output', 'handler']},
  {key: 'app', label: 'App', kinds: ['app']},
];

// Payloads shown expanded by default: the ones a demo audience cares about.
const EXPANDED_BY_DEFAULT: Kind[] = ['output', 'handler'];

let nextId = 1;
const clock = (d = new Date()) =>
  `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`;

/**
 * Accepts whatever the demo operator pastes: the full authorize response,
 * its `data`, `{ sessions }`, the `{ data: "<base64>" }` envelope, or the
 * bare base64 string.
 */
function parsePastedSessions(text: string): JupicoSessions {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return {data: trimmed};
  const json = JSON.parse(trimmed);
  return json?.data?.sessions ?? json?.sessions ?? json;
}

export default function App() {
  const [source, setSource] = useState<Source>('create');
  const [env, setEnv] = useState<Env>('sandbox');
  const [form, setForm] = useState({
    subMerchantId: 'jpt-sim-md-1',
    username: '',
    password: '',
    amount: '4.90',
    description: 'Jupico Coffee',
  });
  const [pasted, setPasted] = useState('');
  const [sessions, setSessions] = useState<JupicoSessions | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('all');
  const [toggled, setToggled] = useState<Set<number>>(new Set());

  const append = useCallback((kind: Kind, title: string, payload?: unknown, time?: Date) => {
    setLog(prev => [
      {
        id: nextId++,
        time: clock(time),
        kind,
        title,
        body: payload === undefined ? undefined : JSON.stringify(payload, null, 2),
      },
      ...prev,
    ]);
  }, []);

  // Everything the SDK does, step by step (inputs, network, native, status, outputs).
  const onLog = useCallback(
    (e: WalletLogEntry) => append(e.kind, e.message, e.data, new Date(e.time)),
    [append],
  );

  const loadSessions = (s: JupicoSessions, origin: string) => {
    append('app', `passing sessions to the component (${origin})`);
    setSessions(s);
    setVersion(v => v + 1);
  };

  // Step 1: normally your BACKEND does this. Done here only for the demo;
  // never ship Jupico API credentials inside an app.
  const authorize = async () => {
    setLoading(true);
    const amount = Number(form.amount);
    const body = {
      subMerchantId: form.subMerchantId,
      applePay: {enabled: true, amount, description: form.description},
      googlePay: {enabled: true, amount, description: form.description},
    };
    const url = AUTHORIZE_URLS[env];
    append('app', `backend stand-in: POST ${url}`, body);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${btoa(`${form.username}:${form.password}`)}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      append('app', `backend stand-in: HTTP ${res.status}`, json);
      if (res.ok && json?.data?.sessions) {
        loadSessions(json.data.sessions, `${env} authorize`);
      }
    } catch (e: any) {
      append('app', 'backend stand-in: request failed', {message: e?.message});
    } finally {
      setLoading(false);
    }
  };

  const applyPasted = () => {
    try {
      loadSessions(parsePastedSessions(pasted), 'pasted');
    } catch (e: any) {
      append('app', 'could not parse the pasted sessions', {message: e?.message});
    }
  };

  // Step 3: the handlers a client implements. Logged as HANDLER entries to
  // show what the app receives, next to the SDK's OUTPUT entries.
  const transactionComplete = (e: TransactionCompleteEvent) => {
    append('handler', 'app received transactionComplete → send oneTimeToken to the backend', e);
  };
  const onSubmitError = (e: SubmitErrorEvent) =>
    append('handler', `app received onSubmitError (${e.error.code})`, e);

  const field = (key: keyof typeof form, label: string, secure = false) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={form[key]}
        onChangeText={v => setForm(f => ({...f, [key]: v}))}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor="#55556a"
      />
    </View>
  );

  const kinds = FILTERS.find(f => f.key === filter)?.kinds;
  const visible = kinds ? log.filter(e => kinds.includes(e.kind)) : log;
  const isOpen = (e: LogEntry) => EXPANDED_BY_DEFAULT.includes(e.kind) !== toggled.has(e.id);
  const toggle = (id: number) =>
    setToggled(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Jupico Wallets</Text>
        <Text style={styles.subtitle}>
          React Native · {Platform.OS === 'ios' ? '<ApplePayJupico>' : '<GooglePayJupico>'} · v0.1
        </Text>

        <Text style={styles.section}>1 · Session</Text>
        <View style={styles.segment}>
          {(['create', 'paste'] as Source[]).map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.segmentItem, s === source && styles.segmentActive]}
              onPress={() => setSource(s)}>
              <Text style={[styles.segmentText, s === source && styles.segmentTextActive]}>
                {s === 'create' ? 'Create' : 'Paste'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.card}>
          {source === 'create' ? (
            <>
              <Text style={styles.hint}>
                Stands in for the merchant backend. Credentials stay in memory only.
              </Text>
              <View style={[styles.segment, styles.envSegment]}>
                {(Object.keys(AUTHORIZE_URLS) as Env[]).map(e => (
                  <TouchableOpacity
                    key={e}
                    style={[styles.segmentItem, e === env && styles.segmentActive]}
                    onPress={() => setEnv(e)}>
                    <Text style={[styles.segmentText, e === env && styles.segmentTextActive]}>
                      {e === 'sandbox' ? 'Sandbox' : 'Dev'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {field('subMerchantId', 'subMerchantId')}
              {field('username', 'API username')}
              {field('password', 'API password', true)}
              <View style={styles.row}>
                <View style={styles.flex}>{field('amount', 'Amount')}</View>
                <View style={styles.flex2}>{field('description', 'Description')}</View>
              </View>
              <TouchableOpacity style={styles.action} onPress={authorize} disabled={loading}>
                <Text style={styles.actionText}>{loading ? 'Authorizing…' : 'Authorize session'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.hint}>
                Paste the authorize response, its data.sessions, or the base64 string.
              </Text>
              <TextInput
                style={[styles.input, styles.paste]}
                value={pasted}
                onChangeText={setPasted}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                placeholder='{"data":{"sessions":{"data":"eyJ…"}}}'
                placeholderTextColor="#55556a"
              />
              <TouchableOpacity style={styles.action} onPress={applyPasted}>
                <Text style={styles.actionText}>Use these sessions</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={styles.section}>2 · Pay</Text>
        <View style={styles.card}>
          {/* key remounts the component for each new session. */}
          {Platform.OS === 'ios' ? (
            <ApplePayJupico
              key={version}
              sessions={sessions}
              merchantIdentifier={merchantIdFor(sessions)}
              buttonStyle="white"
              transactionComplete={transactionComplete}
              onSubmitError={onSubmitError}
              onLog={onLog}
              debug={__DEV__}
            />
          ) : (
            <GooglePayJupico
              key={version}
              sessions={sessions}
              buttonTheme="light"
              transactionComplete={transactionComplete}
              onSubmitError={onSubmitError}
              onLog={onLog}
              debug={__DEV__}
            />
          )}
        </View>

        <View style={styles.logHeader}>
          <Text style={styles.section}>3 · Trace</Text>
          <TouchableOpacity
            onPress={() => {
              setLog([]);
              setToggled(new Set());
            }}>
            <Text style={styles.clear}>Clear</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map(f => {
            const count = f.kinds ? log.filter(e => f.kinds!.includes(e.kind)).length : log.length;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, f.key === filter && styles.chipActive]}
                onPress={() => setFilter(f.key)}>
                <Text style={[styles.chipText, f.key === filter && styles.chipTextActive]}>
                  {f.label} {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.logBox}>
          {visible.length === 0 && <Text style={styles.hint}>No entries yet</Text>}
          {visible.map(entry => {
            const meta = KIND_META[entry.kind];
            const open = isOpen(entry);
            return (
              <TouchableOpacity
                key={entry.id}
                style={styles.logEntry}
                activeOpacity={entry.body ? 0.6 : 1}
                onPress={() => entry.body && toggle(entry.id)}>
                <View style={styles.logRow}>
                  <Text style={[styles.badge, {color: meta.color, borderColor: meta.color}]}>
                    {meta.arrow} {meta.label}
                  </Text>
                  <Text style={styles.logTime}>{entry.time}</Text>
                </View>
                <Text style={styles.logEntryTitle}>
                  {entry.title}
                  {entry.body && !open ? <Text style={styles.more}>  ▸ payload</Text> : null}
                </Text>
                {!!entry.body && open && (
                  <Text style={styles.logBody} selectable>
                    {entry.body}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0b0b0f'},
  content: {padding: 20, gap: 12},
  title: {color: '#fff', fontSize: 26, fontWeight: '700', marginTop: 16},
  subtitle: {color: '#8a8a99', fontSize: 14},
  section: {color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 8},
  segment: {flexDirection: 'row', backgroundColor: '#17171f', borderRadius: 10, padding: 3},
  segmentItem: {flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center'},
  segmentActive: {backgroundColor: '#2c2c3a'},
  segmentText: {color: '#8a8a99', fontSize: 13, fontWeight: '600'},
  segmentTextActive: {color: '#fff'},
  envSegment: {backgroundColor: '#0f0f15', marginTop: 12},
  card: {backgroundColor: '#17171f', borderRadius: 14, padding: 16, gap: 10},
  hint: {color: '#8a8a99', fontSize: 13, lineHeight: 18},
  row: {flexDirection: 'row', gap: 10},
  flex: {flex: 1},
  flex2: {flex: 2},
  field: {gap: 4},
  fieldLabel: {color: '#b8b8c8', fontSize: 12},
  input: {
    backgroundColor: '#0f0f15',
    color: '#e8e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
  },
  paste: {minHeight: 90, textAlignVertical: 'top', fontFamily: mono, fontSize: 11},
  action: {backgroundColor: '#5b8cff', borderRadius: 10, paddingVertical: 12, alignItems: 'center'},
  actionText: {color: '#fff', fontSize: 15, fontWeight: '700'},
  logHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end'},
  clear: {color: '#5b8cff', fontSize: 15},
  chips: {gap: 6},
  chip: {paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#17171f'},
  chipActive: {backgroundColor: '#2c2c3a'},
  chipText: {color: '#8a8a99', fontSize: 12, fontWeight: '600'},
  chipTextActive: {color: '#fff'},
  logBox: {backgroundColor: '#17171f', borderRadius: 14, padding: 12, gap: 12},
  logEntry: {gap: 4},
  logRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  badge: {
    fontSize: 10,
    fontWeight: '800',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
    fontFamily: mono,
  },
  logEntryTitle: {color: '#e8e8f0', fontSize: 13, fontWeight: '600'},
  more: {color: '#5b8cff', fontWeight: '500'},
  logTime: {color: '#8a8a99', fontSize: 11, fontFamily: mono},
  logBody: {
    color: '#b8b8c8',
    fontSize: 11,
    fontFamily: mono,
    backgroundColor: '#0f0f15',
    borderRadius: 8,
    padding: 8,
  },
});
