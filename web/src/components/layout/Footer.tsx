import { CONTRACT_ID, explorerContractUrl } from '../../lib/config.ts';
import { truncMiddle } from '../../lib/format.ts';
import './layout.css';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-row">
        <p className="footer-motto">Ballots are anonymous. Math is loud.</p>
        <p className="footer-meta">
          Groth16 over BN254 host functions ·{' '}
          <a href={explorerContractUrl(CONTRACT_ID)} target="_blank" rel="noreferrer">
            <code>{truncMiddle(CONTRACT_ID, 6, 6)}</code>
          </a>{' '}
          · built for Stellar Hacks: Real-World ZK
        </p>
      </div>
    </footer>
  );
}
