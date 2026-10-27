import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { WalletState } from './useWalletController';

export const BUTTON_HEIGHT = 50;

interface Props {
  state: WalletState;
  style?: StyleProp<ViewStyle>;
  /** The wallet button; hidden while there is no usable session. */
  children: React.ReactNode;
  showButton: boolean;
}

/**
 * Layout shared by both components: the wallet button, a spinner over it while
 * processing, and the status line underneath — the "output inside the
 * component" for every scenario.
 */
export function WalletFrame({ state, style, children, showButton }: Props) {
  const dimmed = state.status !== 'ready' && !isResult(state.status);
  return (
    <View style={[styles.root, style]}>
      <View style={styles.buttonArea}>
        {showButton && (
          <View
            style={[styles.button, dimmed && styles.dimmed]}
            pointerEvents={dimmed ? 'none' : 'auto'}>
            {children}
          </View>
        )}
        {(state.status === 'processing' || state.status === 'loading') && (
          <View style={styles.spinner} pointerEvents="none">
            <ActivityIndicator color="#8a8a99" />
          </View>
        )}
      </View>
      <Text
        numberOfLines={2}
        style={[
          styles.status,
          state.status === 'success' && styles.success,
          state.status === 'failed' && styles.failed,
        ]}>
        {state.message ?? ''}
      </Text>
    </View>
  );
}

function isResult(status: WalletState['status']) {
  return status === 'success' || status === 'failed' || status === 'cancelled';
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  buttonArea: { height: BUTTON_HEIGHT, justifyContent: 'center' },
  button: { height: BUTTON_HEIGHT, width: '100%' },
  dimmed: { opacity: 0.4 },
  spinner: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  status: { marginTop: 6, minHeight: 18, textAlign: 'center', fontSize: 13, fontWeight: '500', color: '#8a8a99' },
  success: { color: '#2eb85c' },
  failed: { color: '#e5484d' },
});
