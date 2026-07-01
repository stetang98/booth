// Generates deterministic test fixtures for the Rust contract tests:
// a real Groth16 proof over a small eligibility tree, encoded in the
// contract's byte layout. Output: contracts/booth/test_fixtures.json
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as snarkjs from 'snarkjs';
import {
  computeCommitment,
  computeNullifierHash,
  buildTree,
  merkleProof,
} from './lib/merkle.mjs';
import { encodeProof, encodeVerificationKey, encodeFr } from './lib/encode.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'circuits', 'build');

const POLL_ID = 1n;
const VOTE_CHOICE = 2n;

// deterministic identities so fixtures are reproducible
const identities = [
  { nullifier: 111111n, trapdoor: 222222n },
  { nullifier: 333333n, trapdoor: 444444n },
  { nullifier: 555555n, trapdoor: 666666n },
];
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

const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  input,
  path.join(BUILD, 'vote_js', 'vote.wasm'),
  path.join(BUILD, 'vote_final.zkey')
);
const vk = JSON.parse(readFileSync(path.join(BUILD, 'verification_key.json')));
const ok = await snarkjs.groth16.verify(vk, publicSignals, proof);
if (!ok) throw new Error('fixture proof failed local verification');

// second voter's proof for the same poll (different nullifier) + a re-vote
// proof by voter 1 with a different choice (same nullifier -> must be blocked)
const mk = async (voterIdx, choice) => {
  const v = identities[voterIdx];
  const mp = merkleProof(tree, voterIdx);
  const nh = await computeNullifierHash(v, POLL_ID);
  const inp = {
    identityNullifier: v.nullifier.toString(),
    identityTrapdoor: v.trapdoor.toString(),
    pathElements: mp.pathElements.map(String),
    pathIndices: mp.pathIndices.map(String),
    merkleRoot: tree.root.toString(),
    nullifierHash: nh.toString(),
    pollId: POLL_ID.toString(),
    voteChoice: choice.toString(),
  };
  const r = await snarkjs.groth16.fullProve(
    inp,
    path.join(BUILD, 'vote_js', 'vote.wasm'),
    path.join(BUILD, 'vote_final.zkey')
  );
  if (!(await snarkjs.groth16.verify(vk, r.publicSignals, r.proof))) {
    throw new Error('aux fixture proof failed');
  }
  return { proof: r.proof, publicSignals: r.publicSignals };
};

const voter2 = await mk(2, 0n);
const revote = await mk(1, 3n); // voter 1 votes again with choice 3

const fixtures = {
  vk_bytes: encodeVerificationKey(vk),
  merkle_root: encodeFr(tree.root),
  poll_id: Number(POLL_ID),
  votes: [
    {
      name: 'voter1_choice2',
      proof_bytes: encodeProof(proof),
      nullifier_hash: encodeFr(publicSignals[1]),
      vote_choice: Number(VOTE_CHOICE),
    },
    {
      name: 'voter2_choice0',
      proof_bytes: encodeProof(voter2.proof),
      nullifier_hash: encodeFr(voter2.publicSignals[1]),
      vote_choice: 0,
    },
    {
      name: 'voter1_revote_choice3',
      proof_bytes: encodeProof(revote.proof),
      nullifier_hash: encodeFr(revote.publicSignals[1]),
      vote_choice: 3,
    },
  ],
};

const out = path.join(ROOT, 'contracts', 'booth', 'test_fixtures.json');
writeFileSync(out, JSON.stringify(fixtures, null, 2));
console.log('fixtures written to', out);
console.log('vk_bytes length:', fixtures.vk_bytes.length / 2, 'bytes');
process.exit(0);
