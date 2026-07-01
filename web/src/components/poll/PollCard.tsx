import { ledgerEta, plural } from '../../lib/format.ts';
import { DEMO_ROOT_HEX } from '../../lib/passes.ts';
import type { PollInfo } from '../../lib/stellar.ts';
import './poll.css';

export function PollCard({
  poll,
  latestLedger,
}: {
  poll: PollInfo;
  latestLedger: number | null;
}) {
  const eta = latestLedger !== null ? ledgerEta(poll.endLedger, latestLedger) : null;
  const isDemo = poll.rootHex === DEMO_ROOT_HEX;

  return (
    <li className="poll-card sheet">
      <a href={`#/poll/${poll.id}`} className="poll-card-link">
        <div className="poll-card-top">
          <span className="overline">
            Poll Nº {poll.id}
            {isDemo && <span className="demo-badge">Live demo</span>}
          </span>
          <span className={`status-pill ${eta?.closed ? 'status-pill--closed' : ''}`}>
            {eta === null ? '…' : eta.closed ? 'Closed' : `Open · closes in ${eta.text}`}
          </span>
        </div>
        <h3 className="poll-card-title">{poll.title}</h3>
        <p className="poll-card-meta mono">
          {plural(poll.choices.length, 'choice')} · {plural(poll.totalBallots, 'ballot')} cast
          <span className="poll-card-arrow" aria-hidden="true">
            →
          </span>
        </p>
      </a>
    </li>
  );
}
