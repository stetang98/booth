import { useMemo, useState } from 'react';
import { chain } from '../../lib/chain.ts';
import { explorerTxUrl } from '../../lib/config.ts';
import { toContractCallError } from '../../lib/errors.ts';
import { bigIntToHex32, truncMiddle } from '../../lib/format.ts';
import { buildTree } from '../../lib/merkle.ts';
import { HashChip } from '../ui/HashChip.tsx';
import type { ElectorateMember } from './CreateWizard.tsx';
import { PassHandout } from './PassHandout.tsx';
import './create.css';

type LaunchPhase = 'idle' | 'fund' | 'submit' | 'confirm' | 'done' | 'error';

interface LaunchState {
  phase: LaunchPhase;
  error: string | null;
  pollId: number | null;
  txHash: string | null;
}

const LAUNCH_LABEL: Record<Exclude<LaunchPhase, 'idle' | 'done' | 'error'>, string> = {
  fund: 'funding the organizer key via friendbot…',
  submit: 'simulating + submitting create_poll…',
  confirm: 'waiting for the ledger…',
};

export function ReviewLaunch({
  title,
  choices,
  durationLedgers,
  electorate,
  onRegenerate,
  onBack,
}: {
  title: string;
  choices: string[];
  durationLedgers: number;
  electorate: ElectorateMember[];
  onRegenerate: () => void;
  onBack: () => void;
}) {
  const [launch, setLaunch] = useState<LaunchState>({
    phase: 'idle',
    error: null,
    pollId: null,
    txHash: null,
  });

  const rootHex = useMemo(
    () => bigIntToHex32(buildTree(electorate.map((m) => m.commitment)).root),
    [electorate],
  );

  const publish = async () => {
    setLaunch({ phase: 'fund', error: null, pollId: null, txHash: null });
    try {
      const { ensureFunded, getSessionKeypair, submitCreatePoll } = await chain();
      const organizer = getSessionKeypair();
      await ensureFunded(organizer);
      setLaunch((prev) => ({ ...prev, phase: 'submit' }));
      const result = await submitCreatePoll({
        title,
        choices,
        rootHex,
        durationLedgers,
        signer: organizer,
        onPhase: (phase) => {
          if (phase === 'sent') setLaunch((prev) => ({ ...prev, phase: 'confirm' }));
        },
      });
      setLaunch({ phase: 'done', error: null, pollId: result.pollId, txHash: result.hash });
    } catch (err) {
      const decoded = toContractCallError(err);
      setLaunch({ phase: 'error', error: decoded.message, pollId: null, txHash: null });
    }
  };

  if (launch.phase === 'done' && launch.pollId !== null) {
    return (
      <PassHandout
        pollId={launch.pollId}
        title={title}
        electorate={electorate}
        rootHex={rootHex}
        txHash={launch.txHash}
      />
    );
  }

  const busy = launch.phase === 'fund' || launch.phase === 'submit' || launch.phase === 'confirm';

  return (
    <div className="wizard-panel sheet">
      <div className="review-summary">
        <h2 className="review-title">{title}</h2>
        <p className="mono review-meta">
          {choices.length} choices · {electorate.length} voters · ~
          {Math.round((durationLedgers * 5) / 3600)} h window
        </p>
        <ul className="review-choices" role="list">
          {choices.map((c, i) => (
            <li key={i}>
              <span className="ballot-key">{'ABCDEFGHIJKLMNOP'[i]}</span> {c}
            </li>
          ))}
        </ul>
      </div>

      <div className="review-electorate">
        <div className="ballot-section-head">
          <span className="ballot-section-label">Electorate commitments</span>
          <button type="button" className="text-btn" onClick={onRegenerate} disabled={busy}>
            re-roll secrets
          </button>
        </div>
        <ul className="commit-list" role="list">
          {electorate.map((m, i) => (
            <li key={i} className="commit-row">
              <span className="commit-name">{m.name}</span>
              <span className="mono commit-hash">{truncMiddle(m.commitment.toString(), 8, 8)}</span>
              <span className="mono commit-leaf">leaf {i}</span>
            </li>
          ))}
        </ul>
        <p className="root-line">
          <span className="field-label">Merkle root (freezes this electorate)</span>
          <HashChip value={rootHex} head={10} tail={10} copyValue={`0x${rootHex}`} />
        </p>
      </div>

      {launch.phase === 'error' && (
        <div className="notice notice--alarm" role="alert">
          Publishing failed: {launch.error}
          <button type="button" className="text-btn retry-btn" onClick={() => void publish()}>
            try again
          </button>
        </div>
      )}

      <div className="wizard-nav">
        <button type="button" className="text-btn" onClick={onBack} disabled={busy}>
          ← back
        </button>
        {busy ? (
          <p className="mono launch-status" role="status">
            {LAUNCH_LABEL[launch.phase as keyof typeof LAUNCH_LABEL]}
          </p>
        ) : (
          <button type="button" className="stamp-btn" onClick={() => void publish()}>
            Publish poll
          </button>
        )}
      </div>
      <p className="ballot-fineprint">
        The poll is created from an ephemeral organizer key funded by friendbot. Voter secrets
        stay in this tab until you hand out the passes on the next screen.
        {launch.txHash !== null && (
          <>
            {' '}
            <a href={explorerTxUrl(launch.txHash)} target="_blank" rel="noreferrer">
              tx ↗
            </a>
          </>
        )}
      </p>
    </div>
  );
}
