// Poseidon Merkle tree over voter identity commitments.
//
// TypeScript port of scripts/lib/merkle.mjs with poseidon-lite in place of
// circomlibjs (circomlib-compatible parameters, verified against the demo
// fixtures in the smoke test). Fixed depth 16, empty leaf = 0n, zero-hash
// chain per level — identical layout to the circuit.

// Subpath import: pulls only the 2-arity Poseidon constants instead of all 16.
import { poseidon2 } from 'poseidon-lite/poseidon2';

export const TREE_DEPTH = 16;

export interface Identity {
  nullifier: bigint;
  trapdoor: bigint;
}

export interface MerkleTree {
  root: bigint;
  layers: bigint[][];
  zeros: bigint[];
  depth: number;
}

export interface MerklePath {
  pathElements: bigint[];
  pathIndices: number[];
}

export function poseidonHash2(a: bigint, b: bigint): bigint {
  return poseidon2([a, b]);
}

/** commitment = Poseidon(identityNullifier, identityTrapdoor) */
export function computeCommitment(identity: Identity): bigint {
  return poseidonHash2(identity.nullifier, identity.trapdoor);
}

/** nullifierHash = Poseidon(identityNullifier, pollId) */
export function computeNullifierHash(identityNullifier: bigint, pollId: bigint): bigint {
  return poseidonHash2(identityNullifier, pollId);
}

/** 31 random bytes — always below the BN254 scalar field modulus. */
export function randomFieldElement(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(31));
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return BigInt(`0x${hex}`);
}

export function generateIdentity(): Identity {
  return { nullifier: randomFieldElement(), trapdoor: randomFieldElement() };
}

/**
 * Fixed-depth Poseidon Merkle tree over the eligibility commitments.
 * Empty leaves are 0; zero hashes are precomputed per level.
 */
export function buildTree(leaves: readonly bigint[], depth: number = TREE_DEPTH): MerkleTree {
  const zeros: bigint[] = [0n];
  for (let i = 1; i <= depth; i++) {
    zeros.push(poseidonHash2(zeros[i - 1], zeros[i - 1]));
  }
  const layers: bigint[][] = [leaves.map((leaf) => BigInt(leaf))];
  for (let level = 0; level < depth; level++) {
    const cur = layers[level];
    const next: bigint[] = [];
    for (let i = 0; i < Math.ceil(cur.length / 2); i++) {
      const left = cur[2 * i] ?? zeros[level];
      const right = cur[2 * i + 1] ?? zeros[level];
      next.push(poseidonHash2(left, right));
    }
    layers.push(next);
  }
  const root = layers[depth][0] ?? zeros[depth];
  return { root, layers, zeros, depth };
}

export function merkleProof(tree: MerkleTree, leafIndex: number): MerklePath {
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  let idx = leafIndex;
  for (let level = 0; level < tree.depth; level++) {
    const siblingIdx = idx ^ 1;
    const sibling = tree.layers[level][siblingIdx] ?? tree.zeros[level];
    pathElements.push(sibling);
    pathIndices.push(idx & 1);
    idx >>= 1;
  }
  return { pathElements, pathIndices };
}
