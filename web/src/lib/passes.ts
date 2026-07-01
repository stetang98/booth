// Voter passes: the demo electorate for the live demo poll, plus parsing and
// validation for imported passes (self-contained "pass pack" JSON).

import { buildTree, computeCommitment } from './merkle.ts';
import { bigIntToHex32 } from './format.ts';

/** Data mirrored from web-seed/demo-passes.json — the electorate of poll Nº 2. */
export const DEMO_POLL_ID = 2;
export const DEMO_ROOT_HEX = '27f3098d5f4234120ee344c1a48e1213102a79033eeca520bbfb6cce52698ee7';
export const DEMO_ROOT_DEC =
  '18069610858590039929802593847871822307312366606043690869619525088500106497767';

export interface DemoPass {
  name: string;
  nullifier: string;
  trapdoor: string;
  commitment: string;
  leafIndex: number;
}

export const DEMO_PASSES: readonly DemoPass[] = [
  {
    name: 'Ada',
    nullifier: '987654327913580247',
    trapdoor: '853973421147336420',
    commitment: '15527697763306245031597191765954388858666588902857374064338780430237788530863',
    leafIndex: 0,
  },
  {
    name: 'Grace',
    nullifier: '1975308655827160494',
    trapdoor: '1707946842294672840',
    commitment: '21096441036487841647689764509029979889269668562000389261693999935284467595204',
    leafIndex: 1,
  },
  {
    name: 'Alan',
    nullifier: '2962962983740740741',
    trapdoor: '2561920263442009260',
    commitment: '3778774880120730776715229563668459906249076882904254589711573806541416156192',
    leafIndex: 2,
  },
  {
    name: 'Edsger',
    nullifier: '3950617311654320988',
    trapdoor: '3415893684589345680',
    commitment: '19187078152212649982300675600111140163039355024255106166658685565139226917805',
    leafIndex: 3,
  },
  {
    name: 'Barbara',
    nullifier: '4938271639567901235',
    trapdoor: '4269867105736682100',
    commitment: '19148228817204612929491452205537654764242501542640245982248250753642840359316',
    leafIndex: 4,
  },
];

export const DEMO_COMMITMENTS: readonly string[] = DEMO_PASSES.map((p) => p.commitment);

/** A pass resolved to everything the prover needs. */
export interface ResolvedPass {
  label: string;
  nullifier: bigint;
  trapdoor: bigint;
  leafIndex: number;
  /** Every commitment in the electorate, in leaf order. */
  commitments: bigint[];
  source: 'demo' | 'imported';
}

/** Downloadable / pasteable pass format produced by the create-poll wizard. */
export interface PassPack {
  booth: 'voter-pass';
  version: 1;
  pollId: number | null;
  name: string;
  nullifier: string;
  trapdoor: string;
  leafIndex: number;
  commitments: string[];
  root: string;
}

export function resolveDemoPass(pass: DemoPass): ResolvedPass {
  return {
    label: pass.name,
    nullifier: BigInt(pass.nullifier),
    trapdoor: BigInt(pass.trapdoor),
    leafIndex: pass.leafIndex,
    commitments: DEMO_COMMITMENTS.map((c) => BigInt(c)),
    source: 'demo',
  };
}

export function makePassPack(args: {
  pollId: number | null;
  name: string;
  nullifier: bigint;
  trapdoor: bigint;
  leafIndex: number;
  commitments: readonly bigint[];
  rootHex: string;
}): PassPack {
  return {
    booth: 'voter-pass',
    version: 1,
    pollId: args.pollId,
    name: args.name,
    nullifier: args.nullifier.toString(),
    trapdoor: args.trapdoor.toString(),
    leafIndex: args.leafIndex,
    commitments: args.commitments.map((c) => c.toString()),
    root: `0x${args.rootHex}`,
  };
}

function parseBigIntField(value: unknown, field: string): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`Pass JSON is missing "${field}".`);
  }
  try {
    return BigInt(value);
  } catch {
    throw new Error(`"${field}" is not a valid decimal or 0x-hex integer.`);
  }
}

/**
 * Parses pasted pass JSON. Accepts a full pass pack (with `commitments[]`) or
 * a bare pass whose commitment belongs to the demo electorate. Validates that
 * the secrets actually hash to the claimed leaf.
 */
export function parsePassJson(text: string): ResolvedPass {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That is not valid JSON.');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Pass JSON must be an object.');
  }
  const obj = raw as Record<string, unknown>;

  const nullifier = parseBigIntField(obj.nullifier, 'nullifier');
  const trapdoor = parseBigIntField(obj.trapdoor, 'trapdoor');
  const commitment = computeCommitment({ nullifier, trapdoor });
  const label = typeof obj.name === 'string' && obj.name.trim() !== '' ? obj.name.trim() : 'Imported pass';

  if (Array.isArray(obj.commitments) && obj.commitments.length > 0) {
    const commitments = obj.commitments.map((c, i) =>
      parseBigIntField(c, `commitments[${i}]`),
    );
    const leafIndex =
      typeof obj.leafIndex === 'number' ? obj.leafIndex : commitments.findIndex((c) => c === commitment);
    if (leafIndex < 0 || leafIndex >= commitments.length) {
      throw new Error('This pass is not a member of its own electorate list.');
    }
    if (commitments[leafIndex] !== commitment) {
      throw new Error(
        `Pass secrets do not hash to the electorate commitment at leaf ${leafIndex}.`,
      );
    }
    return { label, nullifier, trapdoor, leafIndex, commitments, source: 'imported' };
  }

  // Bare pass — only usable if it belongs to the built-in demo electorate.
  const demoIndex = DEMO_COMMITMENTS.findIndex((c) => BigInt(c) === commitment);
  if (demoIndex === -1) {
    throw new Error(
      'This pass has no electorate list ("commitments") and is not one of the demo passes.',
    );
  }
  return {
    label,
    nullifier,
    trapdoor,
    leafIndex: demoIndex,
    commitments: DEMO_COMMITMENTS.map((c) => BigInt(c)),
    source: 'imported',
  };
}

/** Rebuilds the electorate tree and returns its root as 32-byte hex. */
export function passRootHex(pass: ResolvedPass): string {
  return bigIntToHex32(buildTree(pass.commitments).root);
}
