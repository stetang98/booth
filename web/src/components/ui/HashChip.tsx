import { truncMiddle } from '../../lib/format.ts';
import { CopyButton } from './CopyButton.tsx';
import './ui.css';

/** Truncated monospace value with a copy affordance. */
export function HashChip({
  value,
  head = 8,
  tail = 8,
  copyValue,
}: {
  value: string;
  head?: number;
  tail?: number;
  copyValue?: string;
}) {
  return (
    <span className="hash-chip">
      <code title={value}>{truncMiddle(value, head, tail)}</code>
      <CopyButton text={copyValue ?? value} />
    </span>
  );
}
