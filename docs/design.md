# Booth — Anonymous On-Chain Voting on Stellar

**Design doc · 2026-07-01 · target: Stellar Hacks: Real-World ZK (DoraHacks, deadline 2026-07-03 17:00 UTC)**

## One-liner

Booth lets an eligible voter cast a ballot that proves *"I am one of the approved voters and I have not voted before"* — without revealing **which** approved voter they are. Eligibility and one-person-one-vote are enforced by a Groth16 zero-knowledge proof verified inside a Soroban smart contract using Stellar's Protocol 25/26 native **BN254** host functions. The tally is public and auditable; the link between a voter and their ballot is cryptographically severed.

## Why this wins

- **ZK is load-bearing, not decorative.** Remove the proof and the app collapses — there is no other way to be admitted to the ballot or to be stopped from double-voting. This is exactly the bar SDF stated ("ZK genuinely load-bearing, not just namechecked").
- **On-theme with the new primitives.** It verifies a real Groth16 proof on-chain via `env.crypto().bn254().pairing_check()` / `g1_msm` — the CAP-0074/CAP-0080 host functions the hackathon exists to celebrate. Poseidon (CAP-0075) is used in-circuit for the Merkle tree and nullifier.
- **Differentiated.** The competitor scan (111 hackathon repos) shows ~20 privacy-payment pools, ~13 proof-of-reserves, ~13 identity passports — but **anonymous voting is nearly empty** and SDF explicitly named zkVoting as a wanted, unowned use case. A sharp, finished "mild-to-medium" build in white space beats an unfinished clone in a crowded lane.
- **Real-world framing.** DAO governance, token-holder votes, shareholder resolutions, union/co-op ballots — all move real decisions and need *both* verifiability (public tally) and privacy (secret ballot). That tension is the classic voting problem; ZK is the accepted answer.
- **Feasible in 2 days on this machine.** Circom + snarkjs on BN254 runs natively on Apple Silicon (no RISC Zero x86 blocker). The verifier is a mechanical BN254 port of the official `soroban-examples/groth16_verifier`.

## Architecture

Three units, each independently testable:

```
┌─────────────────────────┐     ┌──────────────────────────┐     ┌───────────────────────────┐
│ 1. Circuit (Circom)     │     │ 2. Contract (Soroban)    │     │ 3. dApp (React + snarkjs) │
│  vote.circom            │     │  booth (Rust, no_std)    │     │  browser proving          │
│  - Merkle membership    │──┐  │  - create_poll(root,     │  ┌──│  - build eligibility tree │
│  - Poseidon nullifier   │  │  │      vk, choices, end)   │  │  │  - Freighter wallet       │
│  - vote binding         │  │  │  - vote(poll, proof,     │◀─┘  │  - generate Groth16 proof │
│  outputs: proof + VK    │  └─▶│      publics)  ⟶ verify   │─────▶│  - live tally view        │
│  (snarkjs, bn128)       │     │  - nullifier set + tally │     │  (@stellar/stellar-sdk)   │
└─────────────────────────┘     └──────────────────────────┘     └───────────────────────────┘
```

### Unit 1 — The circuit (`circuits/vote.circom`)

A Semaphore-style membership + nullifier circuit, compiled on the default **bn128** prime (matches BN254 host functions and circomlib Poseidon).

**Private inputs:** `identityTrapdoor`, `identityNullifier`, `pathElements[DEPTH]`, `pathIndices[DEPTH]`.
**Public inputs:** `merkleRoot`, `nullifierHash`, `pollId`, `voteChoice`.

**Constraints:**
1. `commitment = Poseidon(identityNullifier, identityTrapdoor)` (the voter's leaf).
2. Merkle inclusion: `commitment` at `pathElements/pathIndices` hashes up (Poseidon) to `merkleRoot`.
3. `nullifierHash === Poseidon(identityNullifier, pollId)` — deterministic per (voter, poll), so a second vote in the same poll produces the same nullifier and is rejected on-chain, but the same voter is unlinkable *across* polls.
4. `voteChoiceSquared <== voteChoice * voteChoice` — a dummy constraint that binds `voteChoice` into the proof so it cannot be malleated after proving (standard Semaphore signal-binding trick).

Tree depth: **16** (65,536 eligible voters) — comfortable for a demo, cheap to prove.

**Proof system:** Groth16 over BN254. Trusted setup uses the public Hermez `powersOfTau28_hez_final` ptau (no fresh large ceremony needed); we run the small circuit-specific phase-2 (`snarkjs groth16 setup` + one contribution) and commit the resulting `.zkey` + `verification_key.json`.

### Unit 2 — The contract (`contracts/booth`, Rust `no_std`, soroban-sdk 26.1.0)

A **BN254 port** of the official `stellar/soroban-examples/groth16_verifier` (swap `bls12_381()`→`bn254()`, `G1Affine`→`Bn254G1Affine`, etc. — verification equation is identical: `e(-A,B)·e(α,β)·e(vk_x,γ)·e(C,δ)==1`). Wrapped in poll/nullifier/tally state.

Storage model (instance + persistent):
- `Poll { root: BytesN<32>, choices: u32, end_ledger: u32, tallies: Vec<u32> }` keyed by `poll_id: u32`.
- Shared `VerificationKey` (same circuit → one VK for all polls), set once at init.
- `Nullifier(poll_id, nullifier_hash) -> ()` persistent entries; presence = already voted.

Functions:
- `__constructor(admin, vk_bytes)` — parse and store the VK once.
- `create_poll(admin, root, choices, duration_ledgers) -> poll_id` — admin publishes the eligibility Merkle root and ballot options.
- `vote(poll_id, proof_bytes, pub_signals_bytes)`:
  1. Load poll; require `env.ledger().sequence() < end_ledger`.
  2. Parse public signals; require `merkleRoot == poll.root`, `pollId == poll_id`, `voteChoice < poll.choices`.
  3. Require `nullifierHash` not already present → else `AlreadyVoted`.
  4. `bn254.pairing_check(...)` on the parsed proof → else `InvalidProof`.
  5. Record nullifier, increment `tallies[voteChoice]`, emit `voted` event.
- `results(poll_id) -> Vec<u32>` — public read.

The contract never sees voter identity, only the nullifier hash and the choice. Double-voting is impossible (nullifier collision); vote-buying resistance is out of scope (documented honestly).

**Byte encoding (the known footgun, handled once in the converter):** G1 = `be(X)‖be(Y)` (64 B); G2 = `be(X.c1)‖be(X.c0)‖be(Y.c1)‖be(Y.c0)` (128 B, note the **c1-before-c0 limb swap** vs snarkjs JSON order); Fr/public signals = 32-byte big-endian. Proof `A` is negated inside the contract via the SDK's `Neg for &Bn254G1Affine`. `vk_x = ic[0] + Σ pub_i·ic[i+1]` computed with `g1_msm`.

### Unit 3 — The dApp (`web/`, Vite + React + TypeScript)

- **Wallet:** Freighter (`@stellar/freighter-api`) for signing `vote` transactions; contract reads via `@stellar/stellar-sdk` `simulateTransaction`.
- **Identity:** on first use the browser generates `identityTrapdoor`/`identityNullifier`, stores them locally, and shows the derived `commitment` for the organizer to add to the eligibility set (demo: a one-click "register" that appends to a local/committed list and rebuilds the tree).
- **Proving in-browser:** `snarkjs.groth16.fullProve(input, vote_js/vote.wasm, vote_final.zkey)` runs client-side; the `identity` secrets never leave the browser. The proof + public signals are converted to the contract's byte layout in JS and submitted.
- **Tally view:** live bar chart reading `results(poll_id)` — the public, verifiable side of the secret ballot.

Design language (per anti-template policy): a single opinionated visual direction — "civic / ballot-box" editorial, one deliberate type pairing, real hover/focus states, a tally visualization treated as a first-class design element, not a default card grid.

## Data flow (one vote)

1. Organizer creates a poll → collects voter commitments → builds Poseidon Merkle tree off-chain → `create_poll(root, choices, duration)`.
2. Voter opens dApp → proves membership + computes nullifier **in the browser** → gets `{proof, publics}`.
3. dApp converts to bytes → `vote(poll_id, proof_bytes, pub_bytes)` signed by any funded key (the signing key is *not* linked to the voter identity).
4. Contract verifies the proof with BN254 host functions, checks the nullifier, bumps the tally.
5. Anyone reads `results(poll_id)`.

## Scope (YAGNI)

**MVP (must ship + demo):** circuit + local proof/verify; BN254 verifier contract deployed to testnet; `create_poll`/`vote`/`results` working end-to-end from the browser; one honest demo poll; nullifier double-vote block demonstrated on camera.

**Stretch (only if MVP is solid):** on-chain incremental Merkle tree using the Poseidon host function (trustless registration, removes organizer trust) — high value, high risk (circomlib-parameter matching), explicitly deferred.

**Explicitly out of scope (say so in README):** coercion/vote-buying resistance, receipt-freeness, gasless relayer, mainnet deployment, audited trusted setup.

## Testing

- Circuit: `snarkjs groth16 verify` on generated proof (positive), tampered public signal (must fail).
- Contract: Rust unit tests — valid proof passes; wrong root, reused nullifier, expired poll, out-of-range choice all revert with the right error; tally math.
- E2E: script that runs browser-equivalent proving → CLI `stellar contract invoke vote` on testnet → asserts `results` incremented and second identical vote rejected.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| G2 limb-swap / point encoding bug | Isolate in one converter with a round-trip test against a known-good snarkjs proof before wiring the contract. |
| Verify tx exceeds CPU budget | BN254 Groth16 with few public inputs (~4) is well under the 100M budget (BLS ref was ~41M); measure early with `--cost`. |
| circomlib Poseidon (circuit) vs circomlibjs (browser) mismatch | Both from iden3 and version-pinned; add a test asserting JS-computed root == circuit-computed root. |
| Time overrun | MVP first, commit working slices continuously; stretch strictly optional. Video can use pre-generated identities. |
| Trusted-setup honesty | Use public Hermez ptau, commit all artifacts, document the toy phase-2 contribution as non-production in README. |

## Deliverables for submission

Open-source GitHub repo (github.com/stetang98) with clear README (incl. honest WIP/mock notes), 2–3 min screen-recorded demo video (no face needed), deployed testnet contract IDs, and the DoraHacks BUIDL writeup.
