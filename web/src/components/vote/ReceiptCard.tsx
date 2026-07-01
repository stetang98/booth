import type { VoteReceipt } from '../../hooks/useVoteFlow.ts';
import { explorerTxUrl } from '../../lib/config.ts';
import { truncMiddle } from '../../lib/format.ts';
import { HashChip } from '../ui/HashChip.tsx';
import './vote.css';

export function ReceiptCard({
  receipt,
  onDoubleVote,
  onReset,
}: {
  receipt: VoteReceipt;
  onDoubleVote?: () => void;
  onReset: () => void;
}) {
  return (
    <div className="receipt" role="status">
      <span className="receipt-seal" aria-hidden="true">
        Recorded
      </span>
      <p className="receipt-kicker">Ballot receipt · Poll Nº {receipt.pollId}</p>
      <h3 className="receipt-title">{receipt.pollTitle}</h3>
      <dl className="receipt-rows">
        <div>
          <dt>Choice</dt>
          <dd className="receipt-choice">
            <span className="oval oval--marked" aria-hidden="true" />
            {receipt.choiceLabel}
          </dd>
        </div>
        <div>
          <dt>Nullifier</dt>
          <dd>
            <HashChip value={receipt.nullifierHashHex} head={10} tail={10} copyValue={`0x${receipt.nullifierHashHex}`} />
          </dd>
        </div>
        <div>
          <dt>Ledger</dt>
          <dd className="mono">{receipt.ledger}</dd>
        </div>
        <div>
          <dt>Transaction</dt>
          <dd>
            <a href={explorerTxUrl(receipt.txHash)} target="_blank" rel="noreferrer">
              {truncMiddle(receipt.txHash, 8, 8)} ↗
            </a>
          </dd>
        </div>
        <div>
          <dt>Courier</dt>
          <dd className="mono" title="Throwaway key — unrelated to your identity">
            {truncMiddle(receipt.courier, 6, 6)} (throwaway)
          </dd>
        </div>
      </dl>
      <p className="receipt-note">
        This stub proves a ballot was counted — not who cast it. The nullifier for this pass is
        now burned for this poll.
      </p>
      <div className="receipt-actions">
        {onDoubleVote !== undefined && (
          <button type="button" className="ghost-btn ghost-btn--stamp" onClick={onDoubleVote}>
            Try to vote twice ✋
          </button>
        )}
        <button type="button" className="ghost-btn" onClick={onReset}>
          Back to the ballot
        </button>
      </div>
    </div>
  );
}
