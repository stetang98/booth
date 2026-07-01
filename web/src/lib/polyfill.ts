// Buffer polyfill for the browser — the Stellar SDK's XDR layer expects a
// global Buffer. Must be imported before anything that touches the SDK.

import { Buffer } from 'buffer';

const g = globalThis as { Buffer?: typeof Buffer };
if (g.Buffer === undefined) {
  g.Buffer = Buffer;
}
