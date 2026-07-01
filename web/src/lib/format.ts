// Small display helpers — hex, truncation, ledger countdowns.

import { LEDGER_SECONDS } from './config.ts';

export function truncMiddle(value: string, head = 6, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** BigInt -> 64-char lowercase hex (32 bytes, big-endian, no 0x). */
export function bigIntToHex32(value: bigint): string {
  const hex = value.toString(16);
  if (hex.length > 64) throw new Error(`value exceeds 32 bytes: ${value}`);
  return hex.padStart(64, '0');
}

export function hexToBigInt(hex: string): bigint {
  return BigInt(`0x${hex.replace(/^0x/i, '')}`);
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function percent(count: number, total: number): number {
  if (total <= 0) return 0;
  return (count / total) * 100;
}

export function formatPercent(count: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round(percent(count, total))}%`;
}

export interface LedgerEta {
  closed: boolean;
  text: string;
}

/** Human countdown from ledger delta (~5s per ledger). */
export function ledgerEta(endLedger: number, latestLedger: number): LedgerEta {
  const remaining = endLedger - latestLedger;
  if (remaining <= 0) return { closed: true, text: 'closed' };
  const seconds = remaining * LEDGER_SECONDS;
  if (seconds < 3600) return { closed: false, text: `~${Math.max(1, Math.round(seconds / 60))} min` };
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return { closed: false, text: m > 0 ? `~${h} h ${m} min` : `~${h} h` };
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.round((seconds % 86400) / 3600);
  return { closed: false, text: h > 0 ? `~${d} d ${h} h` : `~${d} d` };
}

export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}
