import { explorerTxUrl } from '../../lib/config.ts';
import { makePassPack } from '../../lib/passes.ts';
import { CopyButton } from '../ui/CopyButton.tsx';
import { HashChip } from '../ui/HashChip.tsx';
import type { ElectorateMember } from './CreateWizard.tsx';
import './create.css';

export function PassHandout({
  pollId,
  title,
  electorate,
  rootHex,
  txHash,
}: {
  pollId: number;
  title: string;
  electorate: ElectorateMember[];
  rootHex: string;
  txHash: string | null;
}) {
  const commitments = electorate.map((m) => m.commitment);

  const packFor = (member: ElectorateMember, index: number) =>
    makePassPack({
      pollId,
      name: member.name,
      nullifier: member.identity.nullifier,
      trapdoor: member.identity.trapdoor,
      leafIndex: index,
      commitments,
      rootHex,
    });

  const downloadAll = () => {
    const bundle = {
      booth: 'ballot-pack',
      pollId,
      title,
      root: `0x${rootHex}`,
      passes: electorate.map((m, i) => packFor(m, i)),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `booth-poll-${pollId}-passes.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="wizard-panel sheet handout">
      <span className="receipt-seal handout-seal" aria-hidden="true">
        Live
      </span>
      <p className="overline">Poll Nº {pollId} is on the docket</p>
      <h2 className="review-title">{title}</h2>
      <p className="handout-sub">
        Electorate root <HashChip value={rootHex} head={8} tail={8} copyValue={`0x${rootHex}`} /> is
        frozen on-chain
        {txHash !== null && (
          <>
            {' '}
            —{' '}
            <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer">
              see the transaction ↗
            </a>
          </>
        )}
        .
      </p>

      <div className="notice notice--alarm handout-warning" role="alert">
        <strong>Hand out the passes now.</strong> The secrets below exist only in this tab — once
        you leave, they are gone. Anyone holding a pass can cast that voter’s one anonymous
        ballot.
      </div>

      <ul className="handout-list" role="list">
        {electorate.map((m, i) => (
          <li key={i} className="handout-row">
            <span className="commit-name">{m.name}</span>
            <span className="mono commit-leaf">leaf {i}</span>
            <CopyButton text={JSON.stringify(packFor(m, i), null, 2)} label={`copy pass`} />
          </li>
        ))}
      </ul>

      <div className="handout-actions">
        <button type="button" className="ghost-btn ghost-btn--stamp" onClick={downloadAll}>
          Download all passes (.json)
        </button>
        <a className="stamp-btn handout-open" href={`#/poll/${pollId}`}>
          Open poll Nº {pollId}
        </a>
      </div>
      <p className="ballot-fineprint">
        To vote: open the poll, choose “paste a pass”, and drop in one of these JSON passes.
      </p>
    </div>
  );
}
