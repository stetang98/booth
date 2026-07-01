import './lib/polyfill.ts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/global.css';
import App from './App.tsx';

const rootEl = document.getElementById('root');
if (rootEl === null) {
  throw new Error('#root element missing');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
