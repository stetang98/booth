import type { CSSProperties } from 'react';
import { explorerContractUrl } from '../../lib/config.ts';
import { formatPercent, percent, plural } from '../../lib/format.ts';
import type { PollInfo } from '../../lib/stellar.ts';
import './poll.css';

const CHOICE_KEYS = 'ABCDEFGHIJKLMNOP';

export function TallyBoard({
  poll,
  refreshing,
  onRefresh,
}: {
  poll: PollInfo;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const max = Math.max(...poll.tallies);
  const hasVotes = poll.totalBallots > 0;

  return (
    <section className="tally sheet" aria-labelledby="tally-heading">
      <div className="tally-head">
        <h2 id="tally-heading">Returns</h2>
        <button
          type="button"
          className="ghost-btn tally-refresh"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'refreshing…' : 'refresh'}
        </button>
      </div>

      <ol className="tally-rows">
        {poll.choices.map((choice, i) => {
          const count = poll.tallies[i] ?? 0;
          const isLeader = hasVotes && count === max;
          const p = hasVotes ? percent(count, poll.totalBallots) / 100 : 0;
          return (
            <li key={i} className={`tally-row ${isLeader ? 'tally-row--leader' : ''}`}>
              <div className="tally-label">
                <span className="ballot-key" aria-hidden="true">
                  {CHOICE_KEYS[i] ?? i}
                </span>
                <span className="tally-choice">{choice}</span>
                <span className="tally-count mono">
                  {count} · {formatPercent(count, poll.totalBallots)}
                </span>
              </div>
              <div
                className="tally-bar"
                role="img"
                aria-label={`${choice}: ${count} of ${poll.totalBallots} ballots`}
              >
                <div className="tally-fill" style={{ '--p': p } as CSSProperties} />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="tally-foot">
        <span className="mono">
          {plural(poll.totalBallots, 'ballot')} counted · auto-refreshes every 10 s
        </span>
        <a href={explorerContractUrl()} target="_blank" rel="noreferrer">
          Verify this poll’s contract state ↗
        </a>
      </div>
    </section>
  );
}
