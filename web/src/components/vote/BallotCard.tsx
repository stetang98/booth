import { useState } from 'react';
import { useVoteFlow } from '../../hooks/useVoteFlow.ts';
import { DEMO_ROOT_HEX, type ResolvedPass } from '../../lib/passes.ts';
import type { PollInfo } from '../../lib/stellar.ts';
import { FreshDemoButton } from '../poll/FreshDemoButton.tsx';
import { PassPicker } from './PassPicker.tsx';
import { ReceiptCard } from './ReceiptCard.tsx';
import { VoteStepper } from './VoteStepper.tsx';
import './vote.css';

const CHOICE_KEYS = 'ABCDEFGHIJKLMNOP';

export function BallotCard({
  poll,
  closed,
  onVoted,
}: {
  poll: PollInfo;
  closed: boolean;
  onVoted: () => void;
}) {
  const { state, run, reset } = useVoteFlow(onVoted);
  const [pass, setPass] = useState<ResolvedPass | null>(null);
  const [choice, setChoice] = useState<number | null>(null);

  const rerun = pass !== null && choice !== null ? () => void run(pass, choice, poll) : undefined;

  return (
    <section className="ballot sheet" aria-labelledby="ballot-heading">
      <header className="ballot-head">
        <h2 id="ballot-heading" className="ballot-heading">
          Official ballot
        </h2>
        <span className="mono ballot-no">Nº {poll.id}</span>
      </header>

      {state.phase === 'running' && <VoteStepper state={state} />}

      {state.phase === 'success' && state.receipt !== null && (
        <ReceiptCard receipt={state.receipt} onDoubleVote={rerun} onReset={reset} />
      )}

      {state.phase === 'blocked' && (
        <div className="blocked" role="status">
          <p className="blocked-hand" aria-hidden="true">
            ✋
          </p>
          <h3 className="blocked-title">Double voting blocked by nullifier</h3>
          <p className="blocked-copy">{state.error}</p>
          <p className="blocked-copy blocked-copy--dim">
            The contract met this pass’s one-time nullifier a second time and refused the ballot —
            without ever learning whose pass it is. That is the whole trick.
          </p>
          <p className="mono blocked-code">contract error #5 · AlreadyVoted</p>
          <div className="receipt-actions">
            <button type="button" className="ghost-btn" onClick={reset}>
              Back to the ballot
            </button>
            {poll.rootHex === DEMO_ROOT_HEX && <FreshDemoButton />}
          </div>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="vote-error" role="alert">
          <h3 className="vote-error-title">The ballot didn’t land</h3>
          <p className="blocked-copy">{state.error}</p>
          {state.errorCode !== null && (
            <p className="mono blocked-code">contract error #{state.errorCode}</p>
          )}
          <div className="receipt-actions">
            {rerun !== undefined && (
              <button type="button" className="ghost-btn" onClick={rerun}>
                Try again
              </button>
            )}
            <button type="button" className="ghost-btn" onClick={reset}>
              Back to the ballot
            </button>
          </div>
        </div>
      )}

      {state.phase === 'idle' && (
        <>
          <PassPicker poll={poll} selected={pass} onSelect={setPass} />

          <fieldset className="choices" disabled={closed}>
            <legend className="ballot-section-label">2 · Make one mark</legend>
            <div className="ballot-rows" role="radiogroup" aria-label="Ballot choices">
              {poll.choices.map((label, i) => (
                <label
                  key={i}
                  className={`ballot-row ${choice === i ? 'ballot-row--marked' : ''}`}
                >
                  <input
                    type="radio"
                    name={`choice-${poll.id}`}
                    className="visually-hidden"
                    checked={choice === i}
                    onChange={() => setChoice(i)}
                    disabled={closed}
                  />
                  <span className={`oval ${choice === i ? 'oval--marked' : ''}`} aria-hidden="true" />
                  <span className="ballot-row-label">{label}</span>
                  <span className="ballot-key" aria-hidden="true">
                    {CHOICE_KEYS[i] ?? i}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="ballot-actions">
            {closed ? (
              <p className="notice">This poll has closed. The returns at right are final.</p>
            ) : (
              <>
                <button
                  type="button"
                  className="stamp-btn"
                  disabled={pass === null || choice === null}
                  onClick={() => {
                    if (pass !== null && choice !== null) void run(pass, choice, poll);
                  }}
                >
                  Cast ballot
                </button>
                <p className="ballot-fineprint">
                  Ballots are submitted from a throwaway courier key unrelated to your identity —
                  on mainnet this would be a fee-bump relayer. Your pass secrets never leave this
                  tab.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
