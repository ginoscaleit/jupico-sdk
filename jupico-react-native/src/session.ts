import type { JupicoSessions, JupicoWalletSession } from './types';

/**
 * Returns `sessions.applePay` / `sessions.googlePay`, decoding the base64
 * `data` envelope first when present — the same rule as web-components
 * `decodedApplePay` / `decodedGooglePay`. Returns undefined when absent or
 * undecodable.
 */
export function decodeWalletSession(
  sessions: JupicoSessions | null | undefined,
  wallet: 'applePay' | 'googlePay',
): JupicoWalletSession | undefined {
  if (!sessions) return undefined;
  if (typeof sessions.data === 'string') {
    try {
      const decoded = JSON.parse(base64ToUtf8(sessions.data));
      return decoded?.[wallet];
    } catch {
      return undefined;
    }
  }
  return sessions[wallet];
}

export function amountString(value: string | number | undefined): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * URL-safe tolerant base64 → UTF-8 string. Implemented here rather than via
 * atob/TextDecoder, which are not guaranteed on every RN runtime.
 */
export function base64ToUtf8(input: string): string {
  const clean = input.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    buffer = (buffer << 6) | ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return utf8Decode(bytes);
}

function utf8Decode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++]!;
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b < 0xe0) cp = ((b & 0x1f) << 6) | (bytes[i++]! & 0x3f);
    else if (b < 0xf0) cp = ((b & 0x0f) << 12) | ((bytes[i++]! & 0x3f) << 6) | (bytes[i++]! & 0x3f);
    else
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i++]! & 0x3f) << 12) |
        ((bytes[i++]! & 0x3f) << 6) |
        (bytes[i++]! & 0x3f);
    out += String.fromCodePoint(cp);
  }
  return out;
}
