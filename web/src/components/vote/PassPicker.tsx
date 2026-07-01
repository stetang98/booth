import { useEffect, useState } from 'react';
import { bigIntToHex32, truncMiddle } from '../../lib/format.ts';
import { computeNullifierHash } from '../../lib/merkle.ts';
import {
  DEMO_PASSES,
  DEMO_ROOT_HEX,
  parsePassJson,
  passRootHex,
  resolveDemoPass,
  type ResolvedPass,
} from '../../lib/passes.ts';
import { chain } from '../../lib/chain.ts';
import type { PollInfo } from '../../lib/stellar.ts';
import { FreshDemoButton } from '../poll/FreshDemoButton.tsx';
import './vote.css';

export function PassPicker({
  poll,
  selected,
  onSelect,
}: {
  poll: PollInfo;
  selected: ResolvedPass | null;
  onSelect: (pass: ResolvedPass) => void;
}) {
  const isDemoElectorate = poll.rootHex === DEMO_ROOT_HEX;
  const [showImport, setShowImport] = useState(!isDemoElectorate);
  const [votedMap, setVotedMap] = useState<Record<number, boolean>>({});
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const allUsed = DEMO_PASSES.every((p) => votedMap[p.leafIndex] === true);

  // Badge demo passes whose nullifier is already burned for this poll.
  useEffect(() => {
    if (!isDemoElectorate) return;
    let alive = true;
    void Promise.all(
      DEMO_PASSES.map(async (pass) => {
        const { fetchHasVoted } = await chain();
        const hash = computeNullifierHash(BigInt(pass.nullifier), BigInt(poll.id));
        const voted = await fetchHasVoted(poll.id, bigIntToHex32(hash));
        return [pass.leafIndex, voted] as const;
      }),
    )
      .then((entries) => {
        if (alive) setVotedMap(Object.fromEntries(entries));
      })
      .catch(() => {
        /* badges are best-effort */
      });
    return () => {
      alive = false;
    };
  }, [isDemoElectorate, poll.id, poll.totalBallots]);

  const loadImported = () => {
    setImportError(null);
    try {
      const pass = parsePassJson(importText);
      if (passRootHex(pass) !== poll.rootHex) {
        throw new Error(
          'This pass belongs to a different poll — its electorate root does not match.',
        );
      }
      onSelect(pass);
      setImportText('');
      if (isDemoElectorate) setShowImport(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="pass-picker">
      <div className="ballot-section-head">
        <span className="ballot-section-label">1 · Present a voter pass</span>
        {isDemoElectorate && (
          <button
            type="button"
            className="text-btn pass-toggle"
            onClick={() => setShowImport((v) => !v)}
          >
            {showImport ? 'use a demo pass' : 'paste a pass instead'}
          </button>
        )}
      </div>

      {isDemoElectorate && !showImport && (
        <>
          <ul className="pass-grid" role="list">
            {DEMO_PASSES.map((pass) => {
              const isSelected =
                selected?.source === 'demo' && selected.leafIndex === pass.leafIndex;
              const voted = votedMap[pass.leafIndex] === true;
              return (
                <li key={pass.leafIndex}>
                  <button
                    type="button"
                    className={`pass-card ${isSelected ? 'pass-card--selected' : ''} ${
                      voted ? 'pass-card--used' : ''
                    }`}
                    aria-pressed={isSelected}
                    onClick={() => onSelect(resolveDemoPass(pass))}
                  >
                    <span className="pass-name">{pass.name}</span>
                    <span className="pass-leaf mono">leaf {pass.leafIndex}</span>
                    <span className="pass-commit mono">{truncMiddle(pass.commitment, 5, 5)}</span>
                    {voted && <span className="pass-voted">voted</span>}
                    {voted && (
                      <span className="pass-used-note">already voted in this poll</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {allUsed && (
            <div className="notice pass-all-used" role="status">
              All five demo passes have voted in this poll — nullifiers are one-time by design.{' '}
              <FreshDemoButton compact />
            </div>
          )}
        </>
      )}

      {showImport && (
        <div className="pass-import">
          <label className="pass-import-label" htmlFor="pass-json">
            Paste a voter pass (JSON with <code>nullifier</code>, <code>trapdoor</code> and the
            electorate <code>commitments</code>)
          </label>
          <textarea
            id="pass-json"
            className="pass-import-area mono"
            rows={5}
            value={importText}
            spellCheck={false}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{"booth":"voter-pass","nullifier":"…","trapdoor":"…","leafIndex":0,"commitments":["…"]}'
          />
          <div className="pass-import-row">
            <button
              type="button"
              className="ghost-btn"
              onClick={loadImported}
              disabled={importText.trim() === ''}
            >
              Load pass
            </button>
            {selected?.source === 'imported' && (
              <span className="pass-loaded mono">loaded: {selected.label} · leaf {selected.leafIndex}</span>
            )}
          </div>
          {importError !== null && (
            <p className="pass-import-error" role="alert">
              {importError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
