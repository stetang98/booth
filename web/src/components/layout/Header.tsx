import { CONTRACT_ID, explorerContractUrl } from '../../lib/config.ts';
import './layout.css';

export function Header() {
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <a href="#/" className="wordmark" aria-label="Booth — home">
          Booth<span className="wordmark-dot">.</span>
        </a>
        <nav aria-label="Main navigation" className="site-nav">
          <a href="#/">Polls</a>
          <a href="#/create">Create a poll</a>
          <a href={explorerContractUrl(CONTRACT_ID)} target="_blank" rel="noreferrer">
            Contract ↗
          </a>
          <span className="net-badge" title="All state lives on Stellar testnet">
            testnet
          </span>
        </nav>
      </div>
    </header>
  );
}
