import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Layer 2 — the Turbo Module contract that Codegen consumes.
 *
 * This is intentionally minimal and "stringly/Object" typed: Codegen's own type
 * system doesn't express our rich nested config well, so we pass plain objects
 * across the bridge and keep the strong typing in the JS facade (src/index.ts)
 * and inside each native core. The bridge marshals; it holds no payment logic.
 *
 * Note: `Object` maps to a free-form dictionary (NSDictionary / ReadableMap).
 */
export interface Spec extends TurboModule {
  /** Coarse capability check: does this device/OS support the wallet at all? */
  isSupported(): Promise<boolean>;

  /**
   * Fine-grained check for a specific request (e.g. Apple's canMakePayments
   * with networks, Google's IsReadyToPay). `request` is a serialized
   * PaymentRequest.
   */
  canMakePayments(request: Object): Promise<boolean>;

  /**
   * Presents the native payment sheet and resolves with a serialized
   * PaymentResult, or rejects with { code, message } on failure/cancel.
   */
  requestPayment(request: Object): Promise<Object>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('JupicoWallets');
