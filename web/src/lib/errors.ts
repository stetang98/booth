// Contract error decoding: Soroban surfaces contract failures as
// "Error(Contract, #N)" inside simulation/diagnostic strings.

export const ALREADY_VOTED_CODE = 5;
export const INVALID_PROOF_CODE = 6;

export const CONTRACT_ERROR_MESSAGES: Record<number, string> = {
  1: 'The verification key stored on-chain is malformed.',
  2: 'That poll does not exist on-chain.',
  3: 'This poll has closed — the voting window has ended.',
  4: 'That ballot choice does not exist in this poll.',
  5: 'This voter pass has already cast a ballot in this poll — the nullifier is burned.',
  6: 'Proof rejected by the on-chain verifier.',
  7: 'A public input was not a canonical BN254 field element.',
  8: 'Polls must have between 2 and 16 choices.', // InvalidChoiceCount
  9: 'Poll duration is out of range (60–600,000 ledgers).', // InvalidDuration
};

const CONTRACT_ERROR_RE = /Error\(Contract, #(\d+)\)/;

export function extractContractErrorCode(text: string): number | null {
  const match = CONTRACT_ERROR_RE.exec(text);
  if (!match) return null;
  const code = Number(match[1]);
  return Number.isFinite(code) ? code : null;
}

export class ContractCallError extends Error {
  readonly code: number | null;
  readonly txHash: string | undefined;

  constructor(message: string, code: number | null, txHash?: string) {
    super(message);
    this.name = 'ContractCallError';
    this.code = code;
    this.txHash = txHash;
  }
}

/** Wraps an unknown thrown value, decoding a contract error code if present. */
export function toContractCallError(err: unknown, txHash?: string): ContractCallError {
  if (err instanceof ContractCallError) return err;
  const raw = err instanceof Error ? err.message : safeStringify(err);
  const code = extractContractErrorCode(raw);
  const message = code !== null ? (CONTRACT_ERROR_MESSAGES[code] ?? raw) : raw;
  return new ContractCallError(message, code, txHash);
}

export function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
