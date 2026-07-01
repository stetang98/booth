// All chain access: reads via simulateTransaction, writes via an ephemeral
// "courier" keypair funded by friendbot (walletless UX — on mainnet this
// would be a fee-bump relayer).

import { Buffer } from 'buffer';
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  nativeToScVal,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { Api, Server } from '@stellar/stellar-sdk/rpc';
import { CONTRACT_ID, FRIENDBOT_URL, NETWORK_PASSPHRASE, RPC_URL } from './config.ts';
import { ContractCallError, safeStringify, toContractCallError } from './errors.ts';
import { bytesToHex } from './format.ts';

const INCLUSION_FEE = '100000'; // 0.01 XLM inclusion fee; resources added by prepareTransaction
const TX_TIMEOUT_SECONDS = 120;
const CONFIRM_POLL_MS = 1000;
const CONFIRM_MAX_POLLS = 90;

const server = new Server(RPC_URL);
const contract = new Contract(CONTRACT_ID);

export function getServer(): Server {
  return server;
}

/* ------------------------------ ScVal helpers ------------------------------ */

export const scv = {
  u32: (n: number): xdr.ScVal => nativeToScVal(n, { type: 'u32' }),
  str: (s: string): xdr.ScVal => nativeToScVal(s, { type: 'string' }),
  strVec: (items: readonly string[]): xdr.ScVal =>
    xdr.ScVal.scvVec(items.map((s) => nativeToScVal(s, { type: 'string' }))),
  bytesFromHex: (hex: string): xdr.ScVal => xdr.ScVal.scvBytes(Buffer.from(hex, 'hex')),
  address: (publicKey: string): xdr.ScVal => new Address(publicKey).toScVal(),
};

/* --------------------------------- reads ---------------------------------- */

// Any syntactically valid source works for simulation; it never signs anything.
const VIEW_SOURCE = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7)).publicKey();

async function simulateView(method: string, args: xdr.ScVal[]): Promise<unknown> {
  const source = new Account(VIEW_SOURCE, '0');
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) {
    throw toContractCallError(new Error(sim.error));
  }
  if (!sim.result) {
    throw new Error(`Simulation returned no result for ${method}`);
  }
  return scValToNative(sim.result.retval);
}

export interface PollInfo {
  id: number;
  organizer: string;
  title: string;
  choices: string[];
  rootHex: string;
  endLedger: number;
  tallies: number[];
  totalBallots: number;
}

interface RawPoll {
  organizer: string;
  title: string;
  choices: string[];
  root: Uint8Array;
  end_ledger: number;
  tallies: number[];
}

function toPollInfo(id: number, raw: RawPoll): PollInfo {
  const tallies = raw.tallies.map(Number);
  return {
    id,
    organizer: String(raw.organizer),
    title: raw.title,
    choices: raw.choices.map(String),
    rootHex: bytesToHex(new Uint8Array(raw.root)),
    endLedger: Number(raw.end_ledger),
    tallies,
    totalBallots: tallies.reduce((a, b) => a + b, 0),
  };
}

export async function fetchPollCount(): Promise<number> {
  return Number(await simulateView('get_poll_count', []));
}

export async function fetchPoll(id: number): Promise<PollInfo> {
  const raw = (await simulateView('get_poll', [scv.u32(id)])) as RawPoll;
  return toPollInfo(id, raw);
}

export async function fetchAllPolls(): Promise<PollInfo[]> {
  const count = await fetchPollCount();
  const ids = Array.from({ length: count }, (_, i) => i);
  return Promise.all(ids.map((id) => fetchPoll(id)));
}

export async function fetchHasVoted(pollId: number, nullifierHashHex: string): Promise<boolean> {
  return Boolean(
    await simulateView('has_voted', [scv.u32(pollId), scv.bytesFromHex(nullifierHashHex)]),
  );
}

export async function fetchLatestLedger(): Promise<number> {
  const res = await server.getLatestLedger();
  return res.sequence;
}

/* ------------------------- courier (session) keypair ----------------------- */

const SESSION_STORAGE_KEY = 'booth:courier-secret';

function readStoredSecret(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Ephemeral throwaway key, cached per browser so repeat actions are fast. */
export function getSessionKeypair(): Keypair {
  const stored = readStoredSecret();
  if (stored) {
    try {
      return Keypair.fromSecret(stored);
    } catch {
      // fall through to a fresh key
    }
  }
  const kp = Keypair.random();
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, kp.secret());
  } catch {
    // in-memory only (private browsing etc.)
  }
  return kp;
}

async function accountExists(publicKey: string): Promise<boolean> {
  try {
    await server.getAccount(publicKey);
    return true;
  } catch {
    return false;
  }
}

export type FundResult = 'existing' | 'funded';

/** Funds via friendbot when needed; a 400 "already funded" is fine. */
export async function ensureFunded(kp: Keypair): Promise<FundResult> {
  const publicKey = kp.publicKey();
  if (await accountExists(publicKey)) return 'existing';
  try {
    await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  } catch {
    // network hiccup — the existence poll below decides
  }
  for (let i = 0; i < 12; i++) {
    if (await accountExists(publicKey)) return 'funded';
    await sleep(1000);
  }
  throw new Error('Friendbot funding did not land — testnet may be congested. Try again.');
}

/* --------------------------------- writes --------------------------------- */

export type InvokePhase = 'prepare' | 'sent' | 'confirmed';

export interface InvokeResult {
  hash: string;
  ledger: number;
  returnValue: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function invokeContract(opts: {
  method: string;
  args: xdr.ScVal[];
  signer: Keypair;
  onPhase?: (phase: InvokePhase, detail?: string) => void;
}): Promise<InvokeResult> {
  const { method, args, signer, onPhase } = opts;
  const account = await server.getAccount(signer.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: INCLUSION_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();

  onPhase?.('prepare');
  let prepared;
  try {
    // Simulates, assembles Soroban resources + auth. Contract errors
    // (e.g. Error(Contract, #5) AlreadyVoted) surface here.
    prepared = await server.prepareTransaction(tx);
  } catch (err) {
    throw toContractCallError(err);
  }
  prepared.sign(signer);

  const sent = await server.sendTransaction(prepared);
  if (
    sent.status !== Api.SendTransactionStatus.PENDING &&
    sent.status !== Api.SendTransactionStatus.DUPLICATE
  ) {
    const blob = `${sent.status} ${safeStringify(sent.errorResult ?? '')}`;
    throw toContractCallError(new Error(`Transaction rejected at submission: ${blob}`));
  }
  onPhase?.('sent', sent.hash);

  for (let i = 0; i < CONFIRM_MAX_POLLS; i++) {
    await sleep(CONFIRM_POLL_MS);
    const resp = await server.getTransaction(sent.hash);
    if (resp.status === Api.GetTransactionStatus.SUCCESS) {
      onPhase?.('confirmed');
      return {
        hash: sent.hash,
        ledger: resp.ledger,
        returnValue: resp.returnValue ? scValToNative(resp.returnValue) : undefined,
      };
    }
    if (resp.status === Api.GetTransactionStatus.FAILED) {
      const code = extractFailureCode(resp);
      throw new ContractCallError(
        code !== null ? 'The contract rejected this transaction.' : 'Transaction failed on-chain.',
        code,
        sent.hash,
      );
    }
  }
  throw new Error(`Timed out waiting for confirmation of ${sent.hash}.`);
}

function extractFailureCode(resp: unknown): number | null {
  // Best-effort: contract failures normally surface at simulation time, but a
  // FAILED result may still carry the diagnostic string somewhere printable.
  const err = toContractCallError(new Error(safeStringify(resp)));
  return err.code;
}

/* ---------------------------- high-level actions --------------------------- */

export async function submitVote(opts: {
  pollId: number;
  proofHex: string;
  nullifierHashHex: string;
  choice: number;
  signer: Keypair;
  onPhase?: (phase: InvokePhase, detail?: string) => void;
}): Promise<InvokeResult> {
  if (opts.proofHex.length !== 512) {
    throw new Error(`proof must be 256 bytes, got ${opts.proofHex.length / 2}`);
  }
  return invokeContract({
    method: 'vote',
    args: [
      scv.u32(opts.pollId),
      scv.bytesFromHex(opts.proofHex),
      scv.bytesFromHex(opts.nullifierHashHex),
      scv.u32(opts.choice),
    ],
    signer: opts.signer,
    onPhase: opts.onPhase,
  });
}

export async function submitCreatePoll(opts: {
  title: string;
  choices: string[];
  rootHex: string;
  durationLedgers: number;
  signer: Keypair;
  onPhase?: (phase: InvokePhase, detail?: string) => void;
}): Promise<InvokeResult & { pollId: number }> {
  const result = await invokeContract({
    method: 'create_poll',
    args: [
      scv.address(opts.signer.publicKey()),
      scv.str(opts.title),
      scv.strVec(opts.choices),
      scv.bytesFromHex(opts.rootHex),
      scv.u32(opts.durationLedgers),
    ],
    signer: opts.signer,
    onPhase: opts.onPhase,
  });
  let pollId = Number(result.returnValue);
  if (!Number.isFinite(pollId)) {
    pollId = (await fetchPollCount()) - 1;
  }
  return { ...result, pollId };
}
