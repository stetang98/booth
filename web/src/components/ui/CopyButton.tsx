import { useEffect, useRef, useState } from 'react';
import './ui.css';

export function CopyButton({ text, label = 'copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable — nothing sensible to do
    }
  };

  return (
    <button type="button" className="copy-btn" onClick={() => void onCopy()}>
      {copied ? 'copied ✓' : label}
    </button>
  );
}
