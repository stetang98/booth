import type { CSSProperties } from 'react';
import {
  VOTE_STEPS,
  type VoteFlowState,
  type VoteStepId,
} from '../../hooks/useVoteFlow.ts';
import './vote.css';

const STEP_META: Record<VoteStepId, { title: string; hint: string }> = {
  merkle: { title: 'Build Merkle proof', hint: 'locating your leaf in the electorate' },
  prove: { title: 'Generate Groth16 proof', hint: 'your secrets never leave this tab' },
  fund: { title: 'Fund throwaway courier key', hint: 'friendbot pays the fees, not you' },
  submit: { title: 'Submit to Stellar', hint: 'the courier signs — your identity does not' },
  confirm: { title: 'Verified on-chain', hint: 'BN254 pairing check inside the contract' },
};

function StepMark({ status, index }: { status: string; index: number }) {
  if (status === 'done') {
    return (
      <span className="step-mark step-mark--done" aria-hidden="true">
        ✓
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="step-mark step-mark--failed" aria-hidden="true">
        ✕
      </span>
    );
  }
  return (
    <span
      className={`step-mark ${status === 'active' ? 'step-mark--active' : ''}`}
      aria-hidden="true"
    >
      {index + 1}
    </span>
  );
}

export function VoteStepper({ state }: { state: VoteFlowState }) {
  return (
    <div className="stepper" aria-live="polite">
      <p className="ballot-section-label">Casting your ballot</p>
      <ol className="steps">
        {VOTE_STEPS.map((id, index) => {
          const status = state.steps[id];
          const meta = STEP_META[id];
          const detail = state.detail[id];
          return (
            <li key={id} className={`step step--${status}`}>
              <StepMark status={status} index={index} />
              <div className="step-body">
                <span className="step-title">
                  {meta.title}
                  {status === 'active' && <span className="step-working mono"> · working…</span>}
                </span>
                <span className="step-detail mono">{detail ?? meta.hint}</span>
                {id === 'prove' && status === 'active' && state.progress !== null && (
                  <span className="step-progress">
                    <span className="step-progress-bar">
                      <span
                        className="step-progress-fill"
                        style={{ '--p': state.progress.fraction } as CSSProperties}
                      />
                    </span>
                    <span className="mono">
                      {state.progress.label} · {Math.round(state.progress.fraction * 100)}% of 6.0 MB
                      (one-time)
                    </span>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="stepper-note">
        The proof is generated locally; only 256 bytes of Groth16 proof and a nullifier hash go
        on-chain.
      </p>
    </div>
  );
}
