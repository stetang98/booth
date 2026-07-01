// End-to-end circuit sanity test: identity -> tree -> proof -> local verify.
// Usage: node scripts/prove-test.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as snarkjs from 'snarkjs';
import {
  generateIdentity,
  computeCommitment,
  computeNullifierHash,
  buildTree,
  merkleProof,
} from './lib/merkle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'circuits', 'build');
const OUT = path.join(ROOT, 'circuits', 'build', 'test');
mkdirSync(OUT, { recursive: true });

const POLL_ID = 1n;
const VOTE_CHOICE = 2n;

// three registered voters; we vote as the second one
const identities = [generateIdentity(), generateIdentity(), generateIdentity()];
const commitments = [];
for (const id of identities) commitments.push(await computeCommitment(id));

const tree = await buildTree(commitments);
const voter = identities[1];
const { pathElements, pathIndices } = merkleProof(tree, 1);
const nullifierHash = await computeNullifierHash(voter, POLL_ID);

const input = {
  identityNullifier: voter.nullifier.toString(),
  identityTrapdoor: voter.trapdoor.toString(),
  pathElements: pathElements.map(String),
  pathIndices: pathIndices.map(String),
  merkleRoot: tree.root.toString(),
  nullifierHash: nullifierHash.toString(),
  pollId: POLL_ID.toString(),
  voteChoice: VOTE_CHOICE.toString(),
};
writeFileSync(path.join(OUT, 'input.json'), JSON.stringify(input, null, 2));

console.time('fullProve');
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  input,
  path.join(BUILD, 'vote_js', 'vote.wasm'),
  path.join(BUILD, 'vote_final.zkey')
);
console.timeEnd('fullProve');

writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
writeFileSync(path.join(OUT, 'public.json'), JSON.stringify(publicSignals, null, 2));

const vk = JSON.parse(readFileSync(path.join(BUILD, 'verification_key.json')));
const ok = await snarkjs.groth16.verify(vk, publicSignals, proof);
console.log('verify (honest proof):', ok);

// tampered public signal (flip the vote choice) must fail
const tampered = [...publicSignals];
tampered[3] = '3';
const bad = await snarkjs.groth16.verify(vk, tampered, proof);
console.log('verify (tampered choice, must be false):', bad);

if (!ok || bad) {
  console.error('CIRCUIT TEST FAILED');
  process.exit(1);
}
console.log('CIRCUIT TEST PASSED');
console.log('publicSignals order:', publicSignals);
process.exit(0);
