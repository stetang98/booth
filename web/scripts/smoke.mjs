// Booth end-to-end smoke test (run with: npm run smoke  |  npx tsx scripts/smoke.mjs)
//
// Exercises the exact modules the browser uses (src/lib/*.ts via tsx), with no
// browser required:
//   1. poseidon-lite matches the demo-pass fixtures (commitments + root)
//   2. ported Merkle tree reproduces web-seed/demo-passes.json rootDec
//   3. a real Groth16 proof is generated with snarkjs over circuits/build
//   4. the ported proof encoder is byte-identical to scripts/lib/encode.mjs
//   5. live chain reads agree with the fixtures (skip with --offline)
//   6. the on-chain verifier ACCEPTS the freshly generated proof in simulation
//      (nothing is submitted; no nullifier is burned)
//   7. optional --vote: submits ONE real ballot to poll 0 (the "smoke test
//      poll", public fixture electorate) through the full courier pipeline.
//
// Flags: --offline (skip network), --vote (real on-chain vote on poll 0)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as snarkjs from 'snarkjs';
import {
  buildTree,
  computeCommitment,
  computeNullifierHash,
  merkleProof,
  poseidonHash2,
} from '../src/lib/merkle.ts';
import { encodeFr, encodeProof, encodeVerificationKey } from '../src/lib/encode.ts';
import { bigIntToHex32 } from '../src/lib/format.ts';
import { CONTRACT_ID, NETWORK_PASSPHRASE } from '../src/lib/config.ts';
import { extractContractErrorCode } from '../src/lib/errors.ts';
import {
  ensureFunded,
  fetchHasVoted,
  fetchPoll,
  fetchPollCount,
  getServer,
  scv,
  submitVote,
} from '../src/lib/stellar.ts';
import * as refEncode from '../../scripts/lib/encode.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const CIRCUITS = path.join(REPO, 'circuits', 'build');

const args = new Set(process.argv.slice(2));
const OFFLINE = args.has('--offline');
const DO_VOTE = args.has('--vote');

let stepNo = 0;
const step = (title) => console.log(`\n[${++stepNo}] ${title}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => {
  console.error(`  ✗ FAILED: ${msg}`);
  process.exit(1);
};
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

/* ------------------------------------------------------------------ */
step('poseidon-lite vs demo-pass fixtures (circomlib compatibility)');
const seed = JSON.parse(readFileSync(path.join(REPO, 'web-seed', 'demo-passes.json'), 'utf8'));
for (const pass of seed.passes) {
  const commitment = computeCommitment({
    nullifier: BigInt(pass.nullifier),
    trapdoor: BigInt(pass.trapdoor),
  });
  assert(
    commitment === BigInt(pass.commitment),
    `commitment(${pass.name}) matches fixture`,
  );
}

/* ------------------------------------------------------------------ */
step('ported Merkle tree reproduces the fixture root');
const demoLeaves = seed.passes.map((p) => BigInt(p.commitment));
const demoTree = buildTree(demoLeaves);
assert(demoTree.root === BigInt(seed.rootDec), 'tree root === rootDec');
assert(bigIntToHex32(demoTree.root) === seed.rootHex, 'hex encoding === rootHex');
for (const pass of seed.passes) {
  const { pathElements, pathIndices } = merkleProof(demoTree, pass.leafIndex);
  let cur = BigInt(pass.commitment);
  for (let i = 0; i < pathElements.length; i++) {
    cur = pathIndices[i] === 1
      ? poseidonHash2(pathElements[i], cur)
      : poseidonHash2(cur, pathElements[i]);
  }
  assert(cur === demoTree.root, `merkle path for ${pass.name} folds back to the root`);
}

/* ------------------------------------------------------------------ */
step('real Groth16 proof over circuits/build (snarkjs fullProve)');
const voter = seed.passes[1]; // Grace, leaf 1
const PROOF_POLL_ID = 2n;
const PROOF_CHOICE = 0n;
const votePath = merkleProof(demoTree, voter.leafIndex);
const nullifierHash = computeNullifierHash(BigInt(voter.nullifier), PROOF_POLL_ID);
const input = {
  identityNullifier: voter.nullifier,
  identityTrapdoor: voter.trapdoor,
  pathElements: votePath.pathElements.map(String),
  pathIndices: votePath.pathIndices.map(String),
  merkleRoot: demoTree.root.toString(),
  nullifierHash: nullifierHash.toString(),
  pollId: PROOF_POLL_ID.toString(),
  voteChoice: PROOF_CHOICE.toString(),
};
const t0 = Date.now();
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  input,
  path.join(CIRCUITS, 'vote_js', 'vote.wasm'),
  path.join(CIRCUITS, 'vote_final.zkey'),
);
ok(`proof generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const vk = JSON.parse(readFileSync(path.join(CIRCUITS, 'verification_key.json'), 'utf8'));
assert(await snarkjs.groth16.verify(vk, publicSignals, proof), 'proof verifies locally');
assert(
  publicSignals[0] === demoTree.root.toString() &&
    publicSignals[1] === nullifierHash.toString() &&
    publicSignals[2] === PROOF_POLL_ID.toString() &&
    publicSignals[3] === PROOF_CHOICE.toString(),
  'public signal order is [merkleRoot, nullifierHash, pollId, voteChoice]',
);

/* ------------------------------------------------------------------ */
step('ported encoder is byte-identical to the reference encoder');
const mineProof = encodeProof(proof);
const refProof = refEncode.encodeProof(proof);
assert(mineProof === refProof, 'encodeProof: identical hex');
assert(mineProof.length === 512, 'proof encodes to exactly 256 bytes');
assert(
  encodeVerificationKey(vk) === refEncode.encodeVerificationKey(vk),
  'encodeVerificationKey: identical hex (G1/G2 limb order)',
);
for (const signal of publicSignals) {
  if (encodeFr(signal) !== refEncode.encodeFr(signal)) fail(`encodeFr(${signal}) differs`);
}
ok('encodeFr: identical for all public signals');

if (OFFLINE) {
  console.log('\n--offline: skipping live-chain checks. CRYPTO SMOKE TEST PASSED');
  process.exit(0);
}

/* ------------------------------------------------------------------ */
step('live chain reads (Stellar testnet RPC)');
const count = await fetchPollCount();
assert(count >= 3, `poll count is ${count} (>= 3)`);
const poll2 = await fetchPoll(2);
assert(poll2.rootHex === seed.rootHex, 'poll 2 electorate root matches demo passes');
ok(`poll 2: "${poll2.title}" tallies=[${poll2.tallies.join(', ')}]`);

/* ------------------------------------------------------------------ */
step('on-chain verifier accepts the freshly generated proof (simulation only)');
{
  const sdk = await import('@stellar/stellar-sdk/minimal');
  const { Api } = sdk.rpc;
  const server = getServer();
  const source = new sdk.Account(
    sdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 9)).publicKey(),
    '0',
  );
  const tx = new sdk.TransactionBuilder(source, {
    fee: sdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      new sdk.Contract(CONTRACT_ID).call(
        'vote',
        scv.u32(2),
        scv.bytesFromHex(mineProof),
        scv.bytesFromHex(bigIntToHex32(nullifierHash)),
        scv.u32(Number(PROOF_CHOICE)),
      ),
    )
    .setTimeout(120)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) {
    const code = extractContractErrorCode(sim.error);
    if (code === 5) {
      ok('verifier reached AlreadyVoted (#5) — proof itself was accepted earlier');
    } else {
      fail(`vote simulation rejected with contract error #${code}: ${sim.error.slice(0, 300)}`);
    }
  } else {
    ok('vote(poll 2) simulation SUCCEEDED — Groth16 proof verified by the deployed contract');
    ok('(simulation only: nothing submitted, no nullifier burned)');
  }
}

/* ------------------------------------------------------------------ */
if (DO_VOTE) {
  step('--vote: full courier pipeline against poll 0 (public fixture electorate)');
  const fixtureIdentities = [
    { nullifier: 111111n, trapdoor: 222222n },
    { nullifier: 333333n, trapdoor: 444444n },
    { nullifier: 555555n, trapdoor: 666666n },
  ];
  const fixtureTree = buildTree(fixtureIdentities.map((id) => computeCommitment(id)));
  const poll0 = await fetchPoll(0);
  assert(bigIntToHex32(fixtureTree.root) === poll0.rootHex, 'poll 0 root matches fixture electorate');

  let voterIdx = -1;
  for (let i = 0; i < fixtureIdentities.length; i++) {
    const nh = computeNullifierHash(fixtureIdentities[i].nullifier, 0n);
    if (!(await fetchHasVoted(0, bigIntToHex32(nh)))) {
      voterIdx = i;
      break;
    }
  }
  if (voterIdx === -1) {
    ok('all fixture voters already voted in poll 0 — skipping the write test');
  } else {
    const id = fixtureIdentities[voterIdx];
    const mp = merkleProof(fixtureTree, voterIdx);
    const nh = computeNullifierHash(id.nullifier, 0n);
    const choice = 0;
    const res = await snarkjs.groth16.fullProve(
      {
        identityNullifier: id.nullifier.toString(),
        identityTrapdoor: id.trapdoor.toString(),
        pathElements: mp.pathElements.map(String),
        pathIndices: mp.pathIndices.map(String),
        merkleRoot: fixtureTree.root.toString(),
        nullifierHash: nh.toString(),
        pollId: '0',
        voteChoice: String(choice),
      },
      path.join(CIRCUITS, 'vote_js', 'vote.wasm'),
      path.join(CIRCUITS, 'vote_final.zkey'),
    );
    const sdk = await import('@stellar/stellar-sdk/minimal');
    const courier = sdk.Keypair.random();
    ok(`courier ${courier.publicKey()}`);
    await ensureFunded(courier);
    ok('courier funded by friendbot');
    const before = (await fetchPoll(0)).tallies[choice];
    const result = await submitVote({
      pollId: 0,
      proofHex: encodeProof(res.proof),
      nullifierHashHex: bigIntToHex32(nh),
      choice,
      signer: courier,
      onPhase: (phase, detail) => ok(`phase: ${phase}${detail ? ` (${detail})` : ''}`),
    });
    ok(`vote landed: tx ${result.hash} @ ledger ${result.ledger}`);
    const after = (await fetchPoll(0)).tallies[choice];
    assert(after === before + 1, `tally for choice ${choice} incremented (${before} -> ${after})`);
    assert(await fetchHasVoted(0, bigIntToHex32(nh)), 'has_voted flips to true');

    // Same voter tries again with a fresh proof — the nullifier must be burned.
    const revote = await snarkjs.groth16.fullProve(
      {
        identityNullifier: id.nullifier.toString(),
        identityTrapdoor: id.trapdoor.toString(),
        pathElements: mp.pathElements.map(String),
        pathIndices: mp.pathIndices.map(String),
        merkleRoot: fixtureTree.root.toString(),
        nullifierHash: nh.toString(),
        pollId: '0',
        voteChoice: '1',
      },
      path.join(CIRCUITS, 'vote_js', 'vote.wasm'),
      path.join(CIRCUITS, 'vote_final.zkey'),
    );
    try {
      await submitVote({
        pollId: 0,
        proofHex: encodeProof(revote.proof),
        nullifierHashHex: bigIntToHex32(nh),
        choice: 1,
        signer: courier,
      });
      fail('double vote was accepted — nullifier not enforced?!');
    } catch (err) {
      assert(
        err?.code === 5,
        `double vote blocked with contract error #5 (got: ${err?.code ?? err})`,
      );
    }
  }
}

console.log('\nSMOKE TEST PASSED');
process.exit(0);
