import { usePoll } from '../../hooks/usePolls.ts';
import { explorerContractUrl } from '../../lib/config.ts';
import { ledgerEta } from '../../lib/format.ts';
import { DEMO_ROOT_HEX } from '../../lib/passes.ts';
import { BallotCard } from '../vote/BallotCard.tsx';
import { HashChip } from '../ui/HashChip.tsx';
import { TallyBoard } from './TallyBoard.tsx';
import './poll.css';

const RESULTS_REFRESH_MS = 10_000;

export function PollPage({ id }: { id: number }) {
  const { data: poll, loading, error, latestLedger, refreshing, refresh } = usePoll(id, {
    refreshMs: RESULTS_REFRESH_MS,
  });

  if (loading) {
    return (
      <div className="wrap poll-page">
        <p className="mono poll-loading">reading poll Nº {id} from the chain…</p>
      </div>
    );
  }

  if (error !== null || poll === null) {
    return (
      <div className="wrap poll-page">
        <div className="notice notice--alarm" role="alert">
          <strong>Poll Nº {id} could not be loaded.</strong>{' '}
          {error ?? 'It may not exist on this contract.'}{' '}
          <a href="#/">Back to the docket</a>
        </div>
      </div>
    );
  }

  const eta = latestLedger !== null ? ledgerEta(poll.endLedger, latestLedger) : null;
  const closed = eta?.closed ?? false;
  const isDemo = poll.rootHex === DEMO_ROOT_HEX;

  return (
    <div className="wrap poll-page">
      <section className="masthead" aria-labelledby="poll-heading">
        <p className="overline">
          Poll Nº {poll.id} · {closed ? 'Closed' : 'Open'}
          {isDemo && <span className="demo-badge">Live demo</span>}
        </p>
        <h1 id="poll-heading" className="poll-title">
          {poll.title}
        </h1>
        <dl className="poll-meta">
          <div>
            <dt>Organizer</dt>
            <dd>
              <HashChip value={poll.organizer} head={6} tail={6} />
            </dd>
          </div>
          <div>
            <dt>Electorate root</dt>
            <dd>
              <HashChip value={poll.rootHex} head={8} tail={8} copyValue={`0x${poll.rootHex}`} />
            </dd>
          </div>
          <div>
            <dt>{closed ? 'Closed at ledger' : 'Closes'}</dt>
            <dd className="mono">
              {closed ? poll.endLedger : eta ? `in ${eta.text} · ledger ${poll.endLedger}` : '…'}
            </dd>
          </div>
          <div>
            <dt>Contract</dt>
            <dd>
              <a href={explorerContractUrl()} target="_blank" rel="noreferrer">
                verify state ↗
              </a>
            </dd>
          </div>
        </dl>
      </section>

      <div className="poll-grid">
        <BallotCard poll={poll} closed={closed} onVoted={refresh} />
        <TallyBoard poll={poll} refreshing={refreshing} onRefresh={refresh} />
      </div>
    </div>
  );
}
