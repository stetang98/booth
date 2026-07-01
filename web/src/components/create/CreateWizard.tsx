import { useState } from 'react';
import { generateIdentity, type Identity } from '../../lib/merkle.ts';
import { computeCommitment } from '../../lib/merkle.ts';
import { ReviewLaunch } from './ReviewLaunch.tsx';
import './create.css';

export interface ElectorateMember {
  name: string;
  identity: Identity;
  commitment: bigint;
}

const DURATIONS = [
  { label: '1 hour', ledgers: 720 },
  { label: '6 hours', ledgers: 4_320 },
  { label: '24 hours', ledgers: 17_280 },
  { label: '3 days', ledgers: 51_840 },
  { label: '7 days', ledgers: 120_960 },
] as const;

const MAX_CHOICES = 16;
const MAX_VOTERS = 64;

type WizardStep = 'details' | 'voters' | 'review';

const STEP_LABELS: Record<WizardStep, string> = {
  details: 'The question',
  voters: 'The electorate',
  review: 'Seal & publish',
};

export function CreateWizard() {
  const [step, setStep] = useState<WizardStep>('details');
  const [title, setTitle] = useState('');
  const [choices, setChoices] = useState<string[]>(['', '']);
  const [durationLedgers, setDurationLedgers] = useState<number>(17_280);
  const [names, setNames] = useState<string[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [electorate, setElectorate] = useState<ElectorateMember[] | null>(null);

  const cleanChoices = choices.map((c) => c.trim()).filter((c) => c !== '');
  const detailsValid =
    title.trim() !== '' && cleanChoices.length >= 2 && cleanChoices.length <= MAX_CHOICES;

  const addName = () => {
    const name = nameInput.trim();
    if (name === '' || names.length >= MAX_VOTERS) return;
    setNames((prev) => [...prev, name]);
    setNameInput('');
  };

  const buildElectorate = () => {
    const members = names.map((name) => {
      const identity = generateIdentity();
      return { name, identity, commitment: computeCommitment(identity) };
    });
    setElectorate(members);
    setStep('review');
  };

  const steps: WizardStep[] = ['details', 'voters', 'review'];

  return (
    <div className="wrap create-page">
      <section aria-labelledby="create-heading">
        <p className="overline">Self-service · anyone can be an organizer</p>
        <h1 id="create-heading" className="create-title">
          Open a poll
        </h1>
        <p className="create-sub">
          Name the question, list the voters, and Booth freezes the electorate as a Merkle root
          on-chain. Every voter gets a secret pass — generated in this tab, never sent anywhere.
        </p>

        <ol className="wizard-rail" aria-label="Wizard progress">
          {steps.map((s, i) => (
            <li
              key={s}
              className={`rail-step ${step === s ? 'rail-step--active' : ''} ${
                steps.indexOf(step) > i ? 'rail-step--done' : ''
              }`}
              aria-current={step === s ? 'step' : undefined}
            >
              <span className="rail-n">{i + 1}</span> {STEP_LABELS[s]}
            </li>
          ))}
        </ol>

        {step === 'details' && (
          <div className="wizard-panel sheet">
            <label className="field">
              <span className="field-label">Poll question</span>
              <input
                type="text"
                className="field-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Should the DAO fund the winter grants round?"
                maxLength={120}
              />
            </label>

            <div className="field">
              <span className="field-label">Choices ({cleanChoices.length} of 2–{MAX_CHOICES})</span>
              <ul className="choice-editor" role="list">
                {choices.map((choice, i) => (
                  <li key={i} className="choice-editor-row">
                    <span className="ballot-key" aria-hidden="true">
                      {'ABCDEFGHIJKLMNOP'[i]}
                    </span>
                    <input
                      type="text"
                      className="field-input"
                      value={choice}
                      aria-label={`Choice ${i + 1}`}
                      onChange={(e) =>
                        setChoices((prev) => prev.map((c, j) => (j === i ? e.target.value : c)))
                      }
                      placeholder={i === 0 ? 'Yes' : i === 1 ? 'No' : `Choice ${i + 1}`}
                    />
                    {choices.length > 2 && (
                      <button
                        type="button"
                        className="text-btn"
                        aria-label={`Remove choice ${i + 1}`}
                        onClick={() => setChoices((prev) => prev.filter((_, j) => j !== i))}
                      >
                        remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {choices.length < MAX_CHOICES && (
                <button
                  type="button"
                  className="ghost-btn add-choice"
                  onClick={() => setChoices((prev) => [...prev, ''])}
                >
                  + add a choice
                </button>
              )}
            </div>

            <label className="field">
              <span className="field-label">Voting window</span>
              <select
                className="field-input field-select"
                value={durationLedgers}
                onChange={(e) => setDurationLedgers(Number(e.target.value))}
              >
                {DURATIONS.map((d) => (
                  <option key={d.ledgers} value={d.ledgers}>
                    {d.label} (~{d.ledgers.toLocaleString()} ledgers)
                  </option>
                ))}
              </select>
            </label>

            <div className="wizard-nav">
              <span />
              <button
                type="button"
                className="ghost-btn"
                disabled={!detailsValid}
                onClick={() => setStep('voters')}
              >
                Continue → electorate
              </button>
            </div>
          </div>
        )}

        {step === 'voters' && (
          <div className="wizard-panel sheet">
            <label className="field">
              <span className="field-label">Add voters by name (press Enter)</span>
              <div className="voter-input-row">
                <input
                  type="text"
                  className="field-input"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addName();
                    }
                  }}
                  placeholder="e.g. Noether"
                  maxLength={40}
                />
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={addName}
                  disabled={nameInput.trim() === '' || names.length >= MAX_VOTERS}
                >
                  Add
                </button>
              </div>
            </label>

            {names.length > 0 ? (
              <ul className="voter-chips" role="list">
                {names.map((name, i) => (
                  <li key={`${name}-${i}`} className="voter-chip">
                    {name}
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() => setNames((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="wizard-hint">
                No voters yet. Each name will receive a secret pass — two field elements drawn
                from <code>crypto.getRandomValues</code>.
              </p>
            )}

            <div className="wizard-nav">
              <button type="button" className="text-btn" onClick={() => setStep('details')}>
                ← back
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={names.length === 0}
                onClick={buildElectorate}
              >
                Continue → review
              </button>
            </div>
          </div>
        )}

        {step === 'review' && electorate !== null && (
          <ReviewLaunch
            title={title.trim()}
            choices={cleanChoices}
            durationLedgers={durationLedgers}
            electorate={electorate}
            onRegenerate={buildElectorate}
            onBack={() => setStep('voters')}
          />
        )}
      </section>
    </div>
  );
}
