// Lazy accessor for the chain module. The Stellar SDK dominates the bundle,
// so it loads as a separate async chunk while the paper UI paints instantly.

let modPromise: Promise<typeof import('./stellar.ts')> | null = null;

export function chain(): Promise<typeof import('./stellar.ts')> {
  modPromise ??= import('./stellar.ts');
  return modPromise;
}
