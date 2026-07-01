import { usePolls } from '../../hooks/usePolls.ts';
import { PollCard } from '../poll/PollCard.tsx';
import './home.css';

function SpecimenBallot() {
  return (
    <figure className="specimen" aria-hidden="true">
      <div className="specimen-head">
        <span>Official ballot</span>
        <span>Nº 2</span>
      </div>
      <p className="specimen-q">Fund Project Aurora from the community treasury?</p>
      <ul className="specimen-rows">
        <li>
          <span className="oval oval--marked" />
          Yes, fund it
        </li>
        <li>
          <span className="oval" />
          No, revise the budget
        </li>
        <li>
          <span className="oval" />
          Abstain
        </li>
      </ul>
      <div className="specimen-seal">Counted · voter unknown</div>
    </figure>
  );
}

const HOW_IT_WORKS = [
  {
    n: '1',
    title: 'Hold a voter pass',
    body: 'Your pass is two secret numbers. Their Poseidon hash sits as one anonymous leaf in the poll’s eligibility Merkle tree — the root is frozen on-chain.',
  },
  {
    n: '2',
    title: 'Prove, without telling',
    body: 'Your browser generates a Groth16 proof: “I’m one of the approved voters and this is my one-time nullifier for this poll.” Secrets never leave the tab.',
  },
  {
    n: '3',
    title: 'The contract counts',
    body: 'Stellar’s BN254 host functions verify the proof on-chain, burn the nullifier so you can’t vote twice, and add your choice to the public tally.',
  },
];

export function Home() {
  const { polls, pinned, loading, loadingMore, error, hasMore, latestLedger, loadMore, refresh } =
    usePolls();

  return (
    <div className="wrap">
      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <p className="overline">
            Anonymous on-chain voting · <span className="accent">Groth16 × BN254</span> · Stellar
            testnet
          </p>
          <h1 id="hero-heading">
            Secret ballots,
            <br />
            counted <em>in public.</em>
          </h1>
          <p className="hero-sub">
            Booth lets an on-chain organization vote without anyone — not even the organizer —
            learning who cast which ballot. Eligibility is a Merkle tree, the ballot is a
            zero-knowledge proof, and the tally is arithmetic that everyone can check.
          </p>
          <div className="hero-actions">
            <a className="stamp-btn hero-cta" href="#/poll/2">
              Open the live demo poll
            </a>
            <a className="hero-alt" href="#/create">
              or create your own →
            </a>
          </div>
        </div>
        <SpecimenBallot />
      </section>

      <section className="how" aria-label="How a secret ballot works">
        <h2 className="section-title">How the curtain works</h2>
        <ol className="how-grid">
          {HOW_IT_WORKS.map((step) => (
            <li key={step.n} className="how-step">
              <span className="how-n" aria-hidden="true">
                {step.n}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="docket" aria-labelledby="docket-heading">
        <div className="docket-head">
          <h2 className="section-title" id="docket-heading">
            On the docket
          </h2>
          <button type="button" className="text-btn" onClick={refresh}>
            refresh
          </button>
        </div>
        {loading && <p className="mono docket-status">reading the chain…</p>}
        {error && (
          <div className="notice notice--alarm" role="alert">
            Could not reach the Soroban RPC: {error}
          </div>
        )}
        {!loading && (pinned !== null || polls !== null) && (
          <>
            <ul className="poll-list">
              {pinned !== null && (
                <PollCard poll={pinned} latestLedger={latestLedger} pinned />
              )}
              {(polls ?? []).map((poll) => (
                <PollCard key={poll.id} poll={poll} latestLedger={latestLedger} />
              ))}
            </ul>
            {hasMore && (
              <div className="docket-more">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'loading…' : 'Load older polls'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
