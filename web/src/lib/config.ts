// Network + contract configuration for Booth on Stellar testnet.

export const CONTRACT_ID = 'CAQY4QYKESCAPKLDS5O5RLKGXMALSNZ3NCBT327BETJP7ZKOCL6HZKEW';

export const RPC_URL = 'https://soroban-testnet.stellar.org';
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';
export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

/** Average testnet ledger close time, used for human-readable countdowns. */
export const LEDGER_SECONDS = 5;

export const ZK_WASM_URL = '/zk/vote.wasm';
export const ZK_ZKEY_URL = '/zk/vote_final.zkey';

export function explorerTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export function explorerContractUrl(id: string = CONTRACT_ID): string {
  return `https://stellar.expert/explorer/testnet/contract/${id}`;
}
