// Generates the demo "voter passes" shipped with the dApp and the seed data
// for the on-chain demo poll. Deterministic so the web app, the poll root and
// the docs always agree.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  computeCommitment,
  buildTree,
} from './lib/merkle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const NAMES = ['Ada', 'Grace', 'Alan', 'Edsger', 'Barbara'];
// deterministic demo secrets (publicly known — these are demo passes, not real voters)
const passes = NAMES.map((name, i) => ({
  name,
  nullifier: (1000000007n * BigInt(i + 1) * 987654321n).toString(),
  trapdoor: (2718281828n * BigInt(i + 1) * 314159265n).toString(),
}));

const commitments = [];
for (const p of passes) {
  commitments.push(
    await computeCommitment({
      nullifier: BigInt(p.nullifier),
      trapdoor: BigInt(p.trapdoor),
    })
  );
}
const tree = await buildTree(commitments);

const out = {
  root: '0x' + tree.root.toString(16).padStart(64, '0'),
  rootHex: tree.root.toString(16).padStart(64, '0'),
  rootDec: tree.root.toString(),
  passes: passes.map((p, i) => ({
    ...p,
    commitment: commitments[i].toString(),
    leafIndex: i,
  })),
};

mkdirSync(path.join(ROOT, 'web-seed'), { recursive: true });
writeFileSync(
  path.join(ROOT, 'web-seed', 'demo-passes.json'),
  JSON.stringify(out, null, 2)
);
console.log('demo root hex:', out.rootHex);
console.log('written to web-seed/demo-passes.json');
process.exit(0);
