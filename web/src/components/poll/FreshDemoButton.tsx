import { useState } from 'react';
import { navigate } from '../../hooks/useHashRoute.ts';
import { chain } from '../../lib/chain.ts';
import { toContractCallError } from '../../lib/errors.ts';
import {
  DEMO_POLL_CHOICES,
  DEMO_ROOT_HEX,
  FRESH_DEMO_DURATION_LEDGERS,
  FRESH_DEMO_TITLE,
} from '../../lib/passes.ts';
import './poll.css';

/**
 * Creates a brand-new poll on the SAME demo electorate root and jumps to it.
 * Demo-pass secrets are public, so nullifiers can be burned by anyone — a
 * fresh poll id resets every pass without changing the electorate.
 */
export function FreshDemoButton({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const { ensureFunded, getSessionKeypair, submitCreatePoll } = await chain();
      const organizer = getSessionKeypair();
      await ensureFunded(organizer);
      const result = await submitCreatePoll({
        title: FRESH_DEMO_TITLE,
        choices: [...DEMO_POLL_CHOICES],
        rootHex: DEMO_ROOT_HEX,
        durationLedgers: FRESH_DEMO_DURATION_LEDGERS,
        signer: organizer,
      });
      navigate(`/poll/${result.pollId}`);
    } catch (err) {
      setError(toContractCallError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="fresh-demo">
      <button
        type="button"
        className={compact ? 'text-btn' : 'ghost-btn ghost-btn--stamp'}
        onClick={() => void start()}
        disabled={busy}
        title="New poll id, same five demo passes — resets all nullifiers"
      >
        {busy ? 'opening a fresh poll…' : 'Start a fresh demo poll'}
      </button>
      {error !== null && (
        <span className="fresh-demo-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
