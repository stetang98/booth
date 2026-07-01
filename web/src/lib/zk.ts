// In-browser Groth16 proving via snarkjs (loaded as a classic script from
// /snarkjs.min.js). Artifacts are fetched once with progress reporting and
// cached in memory; snarkjs accepts `{ type: 'mem', data }` file objects.

import { ZK_WASM_URL, ZK_ZKEY_URL } from './config.ts';

export interface VoteCircuitInput {
  identityNullifier: string;
  identityTrapdoor: string;
  pathElements: string[];
  pathIndices: string[];
  merkleRoot: string;
  nullifierHash: string;
  pollId: string;
  voteChoice: string;
  [key: string]: string | string[];
}

export interface SnarkProofJson {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}

export interface ProveResult {
  proof: SnarkProofJson;
  publicSignals: string[];
}

interface MemFile {
  type: 'mem';
  data: Uint8Array;
}

interface SnarkjsGlobal {
  groth16: {
    fullProve(
      input: VoteCircuitInput,
      wasm: string | MemFile,
      zkey: string | MemFile,
    ): Promise<ProveResult>;
  };
}

declare global {
  interface Window {
    snarkjs?: SnarkjsGlobal;
  }
}

export interface ArtifactProgress {
  /** 0..1 across all artifacts; -1 when total size is unknown. */
  fraction: number;
  label: string;
}

const ARTIFACT_TOTAL_BYTES = 4446130 + 1804494; // zkey + wasm (known sizes)

let artifactsPromise: Promise<{ wasm: MemFile; zkey: MemFile }> | null = null;

async function fetchBinary(
  url: string,
  onBytes: (delta: number) => void,
): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to fetch ${url} (${res.status})`);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Loads wasm + proving key once per session. Progress is reported across the
 * combined ~6 MB download; subsequent votes reuse the in-memory copies.
 */
export function loadZkArtifacts(
  onProgress?: (p: ArtifactProgress) => void,
): Promise<{ wasm: MemFile; zkey: MemFile }> {
  if (!artifactsPromise) {
    artifactsPromise = (async () => {
      let loaded = 0;
      const report = (label: string) => {
        onProgress?.({ fraction: Math.min(1, loaded / ARTIFACT_TOTAL_BYTES), label });
      };
      report('fetching circuit');
      const wasmBytes = await fetchBinary(ZK_WASM_URL, (d) => {
        loaded += d;
        report('fetching circuit');
      });
      report('fetching proving key');
      const zkeyBytes = await fetchBinary(ZK_ZKEY_URL, (d) => {
        loaded += d;
        report('fetching proving key');
      });
      onProgress?.({ fraction: 1, label: 'proving key ready' });
      return {
        wasm: { type: 'mem', data: wasmBytes } as MemFile,
        zkey: { type: 'mem', data: zkeyBytes } as MemFile,
      };
    })().catch((err: unknown) => {
      artifactsPromise = null; // allow retry after a failed download
      throw err;
    });
  }
  return artifactsPromise;
}

/** Waits for the classic-script snarkjs global to be present. */
export async function getSnarkjs(): Promise<SnarkjsGlobal> {
  for (let i = 0; i < 150; i++) {
    if (window.snarkjs) return window.snarkjs;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('snarkjs failed to load — check that /snarkjs.min.js is reachable.');
}

export async function generateVoteProof(
  input: VoteCircuitInput,
  onProgress?: (p: ArtifactProgress) => void,
): Promise<ProveResult> {
  const [snarkjs, artifacts] = await Promise.all([
    getSnarkjs(),
    loadZkArtifacts(onProgress),
  ]);
  return snarkjs.groth16.fullProve(input, artifacts.wasm, artifacts.zkey);
}
