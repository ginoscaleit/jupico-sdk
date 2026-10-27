import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SIMULATOR_CARDS, type SimulatorCard } from '../payloads';

interface Props {
  visible: boolean;
  description?: string;
  amount: string;
  currencyCode: string;
  processing: boolean;
  onPay: (card: SimulatorCard) => void;
  onCancel: () => void;
}

/**
 * Stand-in for the Apple Pay sheet when `provider.type === "simulator"`,
 * matching the web component's simulator modal (test card picker + Pay).
 */
export function SimulatorSheet(props: Props) {
  const [cardIndex, setCardIndex] = useState(0);
  const [picking, setPicking] = useState(false);
  const card = SIMULATOR_CARDS[cardIndex]!;

  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onCancel}>
      <Pressable style={styles.backdrop} onPress={props.processing ? undefined : props.onCancel} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{APPLE_LOGO}Pay</Text>
          <Text style={styles.badge}>Simulator</Text>
          <View style={styles.flex} />
          <Pressable onPress={props.onCancel} disabled={props.processing} hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>

        <Pressable style={styles.row} onPress={() => setPicking(p => !p)} disabled={props.processing}>
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>{card.displayName}</Text>
            <Text style={styles.rowSub}>
              {card.network} ••{card.last4} · Simulator User, San Francisco CA 94102
            </Text>
          </View>
          <Text style={styles.chevron}>{picking ? '▴' : '▾'}</Text>
        </Pressable>
        {picking &&
          SIMULATOR_CARDS.map((c, i) => (
            <Pressable
              key={c.pan}
              style={styles.option}
              onPress={() => {
                setCardIndex(i);
                setPicking(false);
              }}>
              <Text style={[styles.optionText, i === cardIndex && styles.optionActive]}>
                {c.displayName} ••{c.last4}
              </Text>
            </Pressable>
          ))}

        <View style={styles.row}>
          <Text style={[styles.rowTitle, styles.flex]}>{props.description || 'Payment'}</Text>
          <Text style={styles.amount}>{formatAmount(props.amount, props.currencyCode)}</Text>
        </View>

        <Pressable
          style={[styles.pay, props.processing && styles.payBusy]}
          disabled={props.processing}
          onPress={() => props.onPay(card)}>
          {props.processing ? (
            <View style={styles.processing}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.payText}>Processing</Text>
            </View>
          ) : (
            <Text style={styles.payText}>Click to Pay</Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

// The Apple logo glyph only exists in Apple system fonts.
const APPLE_LOGO = Platform.OS === 'ios' ? '\uF8FF ' : '';

function formatAmount(amount: string, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#f2f2f7', borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 16, paddingBottom: 36, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#000' },
  badge: { fontSize: 11, fontWeight: '700', color: '#fff', backgroundColor: '#ff9500', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  cancel: { fontSize: 16, color: '#007aff' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#000' },
  rowSub: { fontSize: 12, color: '#6e6e73', marginTop: 2 },
  chevron: { fontSize: 16, color: '#6e6e73', marginLeft: 8 },
  option: { backgroundColor: '#fff', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12 },
  optionText: { fontSize: 14, color: '#000' },
  optionActive: { fontWeight: '700', color: '#007aff' },
  amount: { fontSize: 15, fontWeight: '700', color: '#000' },
  pay: { backgroundColor: '#000', borderRadius: 10, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  payBusy: { opacity: 0.7 },
  payText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  processing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
