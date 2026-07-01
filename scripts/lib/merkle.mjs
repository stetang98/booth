import { buildPoseidon } from 'circomlibjs';

export const TREE_DEPTH = 16;

let poseidonSingleton = null;

export async function getPoseidon() {
  if (!poseidonSingleton) {
    poseidonSingleton = await buildPoseidon();
  }
  return poseidonSingleton;
}

export async function poseidonHash2(a, b) {
  const poseidon = await getPoseidon();
  return poseidon.F.toObject(poseidon([BigInt(a), BigInt(b)]));
}

// commitment = Poseidon(identityNullifier, identityTrapdoor)
export async function computeCommitment(identity) {
  return poseidonHash2(identity.nullifier, identity.trapdoor);
}

// nullifierHash = Poseidon(identityNullifier, pollId)
export async function computeNullifierHash(identity, pollId) {
  return poseidonHash2(identity.nullifier, BigInt(pollId));
}

export function randomFieldElement() {
  // 31 random bytes < bn128 field modulus, always safe
  const bytes = crypto.getRandomValues(new Uint8Array(31));
  return BigInt(
    '0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  );
}

export function generateIdentity() {
  return { nullifier: randomFieldElement(), trapdoor: randomFieldElement() };
}

// Fixed-depth Poseidon Merkle tree over the eligibility commitments.
// Empty leaves are 0; zero hashes are precomputed per level.
export async function buildTree(leaves, depth = TREE_DEPTH) {
  const zeros = [0n];
  for (let i = 1; i <= depth; i++) {
    zeros.push(await poseidonHash2(zeros[i - 1], zeros[i - 1]));
  }
  const layers = [leaves.map(BigInt)];
  for (let level = 0; level < depth; level++) {
    const cur = layers[level];
    const next = [];
    for (let i = 0; i < Math.ceil(cur.length / 2); i++) {
      const left = cur[2 * i] ?? zeros[level];
      const right = cur[2 * i + 1] ?? zeros[level];
      next.push(await poseidonHash2(left, right));
    }
    layers.push(next);
  }
  const root = layers[depth][0] ?? zeros[depth];
  return { root, layers, zeros, depth };
}

export function merkleProof(tree, leafIndex) {
  const pathElements = [];
  const pathIndices = [];
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
