// The money path: Merkle proof -> Groth16 proof -> courier key -> submit ->
// verified on-chain. Every step reports live status; contract error #5
// (AlreadyVoted) is a first-class "blocked" outcome, not a generic failure.

import { useCallback, useRef, useState } from 'react';
import { chain } from '../lib/chain.ts';
import { encodeProof } from '../lib/encode.ts';
import { ALREADY_VOTED_CODE, CONTRACT_ERROR_MESSAGES, toContractCallError } from '../lib/errors.ts';
import { bigIntToHex32, truncMiddle } from '../lib/format.ts';
import { buildTree, computeNullifierHash, merkleProof } from '../lib/merkle.ts';
import type { ResolvedPass } from '../lib/passes.ts';
import type { PollInfo } from '../lib/stellar.ts';
import { generateVoteProof, type ArtifactProgress, type VoteCircuitInput } from '../lib/zk.ts';

export const VOTE_STEPS = ['merkle', 'prove', 'fund', 'submit', 'confirm'] as const;
export type VoteStepId = (typeof VOTE_STEPS)[number];
export type StepStatus = 'idle' | 'active' | 'done' | 'failed';

export interface VoteReceipt {
  pollId: number;
  pollTitle: string;
  choiceIndex: number;
  choiceLabel: string;
  nullifierHashHex: string;
  txHash: string;
  ledger: number;
  courier: string;
}

export interface VoteFlowState {
  phase: 'idle' | 'running' | 'success' | 'blocked' | 'error';
  steps: Record<VoteStepId, StepStatus>;
  detail: Partial<Record<VoteStepId, string>>;
  progress: ArtifactProgress | null;
  error: string | null;
  errorCode: number | null;
  receipt: VoteReceipt | null;
}

const IDLE_STEPS: Record<VoteStepId, StepStatus> = {
  merkle: 'idle',
  prove: 'idle',
  fund: 'idle',
  submit: 'idle',
  confirm: 'idle',
};

const IDLE_STATE: VoteFlowState = {
  phase: 'idle',
  steps: IDLE_STEPS,
  detail: {},
  progress: null,
  error: null,
  errorCode: null,
  receipt: null,
};

/** Yields to the renderer so step transitions paint before heavy work. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

export interface VoteFlow {
  state: VoteFlowState;
  run: (pass: ResolvedPass, choiceIndex: number, poll: PollInfo) => Promise<void>;
  reset: () => void;
}

export function useVoteFlow(onSuccess?: () => void): VoteFlow {
  const [state, setState] = useState<VoteFlowState>(IDLE_STATE);
  const runningRef = useRef(false);

  const patch = useCallback((updater: (prev: VoteFlowState) => VoteFlowState) => {
    setState(updater);
  }, []);

  const setStep = useCallback(
    (step: VoteStepId, status: StepStatus, detail?: string) => {
      patch((prev) => ({
        ...prev,
        steps: { ...prev.steps, [step]: status },
        detail: detail === undefined ? prev.detail : { ...prev.detail, [step]: detail },
      }));
    },
    [patch],
  );

  const run = useCallback(
    async (pass: ResolvedPass, choiceIndex: number, poll: PollInfo) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setState({ ...IDLE_STATE, phase: 'running' });

      let current: VoteStepId = 'merkle';
      try {
        /* ① Merkle proof (client-side) */
        setStep('merkle', 'active', 'hashing the electorate…');
        await tick();
        const tree = buildTree(pass.commitments);
        const rootHex = bigIntToHex32(tree.root);
        if (rootHex !== poll.rootHex) {
          throw new Error(
            'This pass belongs to a different electorate than this poll — the Merkle roots do not match.',
          );
        }
        const path = merkleProof(tree, pass.leafIndex);
        const nullifierHash = computeNullifierHash(pass.nullifier, BigInt(poll.id));
        const nullifierHashHex = bigIntToHex32(nullifierHash);
        setStep(
          'merkle',
          'done',
          `leaf ${pass.leafIndex} of ${pass.commitments.length} · root matches on-chain`,
        );

        /* ② Groth16 proof (in this tab) */
        current = 'prove';
        setStep('prove', 'active', 'your secrets never leave this tab');
        await tick();
        const input: VoteCircuitInput = {
          identityNullifier: pass.nullifier.toString(),
          identityTrapdoor: pass.trapdoor.toString(),
          pathElements: path.pathElements.map(String),
          pathIndices: path.pathIndices.map(String),
          merkleRoot: tree.root.toString(),
          nullifierHash: nullifierHash.toString(),
          pollId: String(poll.id),
          voteChoice: String(choiceIndex),
        };
        const started = performance.now();
        const { proof, publicSignals } = await generateVoteProof(input, (p) => {
          patch((prev) => ({ ...prev, progress: p }));
        });
        patch((prev) => ({ ...prev, progress: null }));
        // Public signal order: [merkleRoot, nullifierHash, pollId, voteChoice]
        const expected = [tree.root.toString(), nullifierHash.toString(), String(poll.id), String(choiceIndex)];
        if (expected.some((v, i) => publicSignals[i] !== v)) {
          throw new Error('Circuit public signals mismatch — refusing to submit.');
        }
        const proofHex = encodeProof(proof);
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        setStep('prove', 'done', `groth16 proof in ${seconds}s · 256 bytes`);

        /* ③ Courier key */
        current = 'fund';
        setStep('fund', 'active', 'preparing a throwaway courier key…');
        const { ensureFunded, getSessionKeypair, submitVote } = await chain();
        const courier = getSessionKeypair();
        const fundResult = await ensureFunded(courier);
        setStep(
          'fund',
          'done',
          `${truncMiddle(courier.publicKey(), 4, 4)} ${
            fundResult === 'existing' ? 'reused from this session' : 'funded by friendbot'
          }`,
        );

        /* ④ Submit ⑤ Confirm */
        current = 'submit';
        setStep('submit', 'active', 'simulating + signing…');
        const result = await submitVote({
          pollId: poll.id,
          proofHex,
          nullifierHashHex,
          choice: choiceIndex,
          signer: courier,
          onPhase: (phase, detail) => {
            if (phase === 'sent') {
              setStep('submit', 'done', `tx ${truncMiddle(detail ?? '', 6, 6)} accepted`);
              current = 'confirm';
              setStep('confirm', 'active', 'waiting for the ledger…');
            }
          },
        });
        setStep('confirm', 'done', `ledger ${result.ledger} · proof verified by the contract`);

        const receipt: VoteReceipt = {
          pollId: poll.id,
          pollTitle: poll.title,
          choiceIndex,
          choiceLabel: poll.choices[choiceIndex] ?? String(choiceIndex),
          nullifierHashHex,
          txHash: result.hash,
          ledger: result.ledger,
          courier: courier.publicKey(),
        };
        patch((prev) => ({ ...prev, phase: 'success', receipt }));
        onSuccess?.();
      } catch (err) {
        const decoded = toContractCallError(err);
        const friendly =
          decoded.code !== null
            ? (CONTRACT_ERROR_MESSAGES[decoded.code] ?? decoded.message)
            : decoded.message;
        setStep(current, 'failed');
        patch((prev) => ({
          ...prev,
          phase: decoded.code === ALREADY_VOTED_CODE ? 'blocked' : 'error',
          error: friendly,
          errorCode: decoded.code,
          progress: null,
        }));
      } finally {
        runningRef.current = false;
      }
    },
    [onSuccess, patch, setStep],
  );

  const reset = useCallback(() => {
    if (!runningRef.current) setState(IDLE_STATE);
  }, []);

  return { state, run, reset };
}
