<div align="center">

# 🗳️ Booth

**The secret ballot, on-chain. Anonymous voting for Stellar organizations — every ballot admitted by a Groth16 zero-knowledge proof verified inside a Soroban contract.**

Built for **[Stellar Hacks: Real-World ZK](https://dorahacks.io/hackathon/stellar-hacks-zk)** · July 2026

**Live dApp:** https://booth-stellar.vercel.app · **Demo video:** [youtu.be/woqsZBT4vUY](https://youtu.be/woqsZBT4vUY)
**Contract (Stellar testnet):** [`CAQY4QYKESCAPKLDS5O5RLKGXMALSNZ3NCBT327BETJP7ZKOCL6HZKEW`](https://stellar.expert/explorer/testnet/contract/CAQY4QYKESCAPKLDS5O5RLKGXMALSNZ3NCBT327BETJP7ZKOCL6HZKEW)

</div>

---

## The problem

The secret ballot has been a legal requirement of fair elections for 150 years — corporate boards, co-ops, unions, and shareholder meetings are *obligated* to offer it. But when organizations move governance on-chain, they trade it away: every vote is signed by an address, forever linkable to the voter. Today's options are bad:

- **Public on-chain voting** — auditable tally, zero privacy. Your boss sees how you voted on the compensation proposal.
- **Off-chain voting** (forms, email, SaaS) — private-ish, but the tally is whatever the administrator says it is.

You currently pick one: **verifiable** or **secret**. A real ballot must be both.

## What Booth does

Booth is an anonymous voting protocol on Stellar. A ballot is accepted **only** with a zero-knowledge proof that:

1. **"I am eligible"** — the voter knows the secrets behind an identity commitment that is a member of the poll's electorate (a Poseidon Merkle tree whose root is frozen on-chain when the poll opens), *without revealing which member*.
2. **"I haven't voted yet"** — the proof exposes a **nullifier** = `Poseidon(identitySecret, pollId)`. Same voter + same poll → same nullifier → the contract rejects the second ballot. Across *different* polls the nullifiers are unlinkable.
3. **"This is my choice"** — the ballot choice is bound inside the proof, so it can't be altered in flight.

The Soroban contract verifies the Groth16 proof **on-chain** with Stellar's Protocol 25/26 BN254 host functions, burns the nullifier, and increments the tally. The result: a tally anyone can audit, ballots nobody can trace. Voter secrets never leave the browser; ballots are submitted from throwaway courier keys unrelated to the voter's identity.

## ZK is load-bearing here

Remove the proof and Booth ceases to exist: there is no account-based fallback for "eligible but anonymous," and no other mechanism stops double voting without identifying the voter. The proof *is* the ballot box.

```
        browser (secrets stay here)                     Stellar testnet
┌─────────────────────────────────────┐       ┌─────────────────────────────────┐
│ voter pass {nullifier, trapdoor}    │       │  booth contract (Soroban)       │
│   commitment = Poseidon(n, t)       │       │                                 │
│   Merkle path → poll root           │       │  vote(poll_id, proof,           │
│   nullifierHash = Poseidon(n, poll) │       │       nullifier_hash, choice):  │
│                                     │       │   1. poll open? choice valid?   │
│ snarkjs groth16.fullProve (~1–3 s)  │──tx──▶│   2. nullifier unseen?          │
│   4,432-constraint circuit          │       │   3. BN254 pairing check ✓      │
│                                     │       │      (CAP-74/80 host fns)       │
│ throwaway courier key signs & pays  │       │   4. burn nullifier, tally += 1 │
└─────────────────────────────────────┘       └─────────────────────────────────┘
```

**Public signals:** `[merkleRoot, nullifierHash, pollId, voteChoice]` — root and pollId are taken from **contract state**, never from the caller, so proofs can't be replayed against stale or foreign electorates.

## Built on Stellar's newest cryptography

Booth is one of the first end-to-end applications of the ZK primitives Stellar shipped this year:

| Primitive | Protocol | Where Booth uses it |
|---|---|---|
| BN254 `pairing_check` | 25 "X-Ray" (CAP-0074) | Groth16 verification equation, on-chain |
| BN254 `g1_msm` | 26 "Yardstick" (CAP-0080) | `vk_x = IC₀ + Σ pubᵢ·ICᵢ₊₁` in one MSM call |
| Poseidon hash | in-circuit (circomlib) | commitments, Merkle tree, nullifiers |

Using the BN254 curve (instead of the older BLS12-381 path from the official `groth16_verifier` example) means Booth works with stock **circom + snarkjs + circomlib** and the public Hermez powers-of-tau — no custom ceremony, no exotic tooling — and it's cheaper:

**Measured cost per on-chain vote: 27.13 M CPU instructions (27 % of the 100 M budget)** — vs ~41 M for the reference BLS12-381 verifier. Full budget dump in [`contracts/booth/src/test.rs`](contracts/booth/src/test.rs) (`print_vote_cost`).

## Try it in 2 minutes (judges start here)

1. Open **https://booth-stellar.vercel.app** → poll **“Fund Project Aurora from the community treasury?”** (the live demo poll).
2. Pick a **demo voter pass** (Ada, Grace, Alan, Edsger or Barbara — publicly known demo identities).
3. Mark the ballot → **Cast ballot**. Watch the stepper: Merkle proof → Groth16 proof (in your tab) → courier key → on-chain verification, with the transaction link on **stellar.expert**.
4. Now press **“Try voting again”** with the same pass → the contract rejects it with `AlreadyVoted` — the nullifier is burned. That rejection *is* the protocol working.
5. Optional: **Create your own poll** — name voters, the app generates passes client-side, builds the electorate tree, opens the poll on testnet, and hands you the passes to distribute.

No wallet extension needed — everything runs from the browser on testnet.

## Repository layout

```
circuits/vote.circom        the whole protocol in 120 lines of circom
circuits/build/             compiled artifacts committed for reproducibility
                            (vote.wasm, vote_final.zkey, verification_key.json)
contracts/booth/            Soroban contract: BN254 Groth16 verifier + polls,
                            nullifiers, tallies · 8 unit tests w/ real proofs
scripts/                    reference implementation (Node): Poseidon Merkle
                            tree, proof→bytes encoder, fixture generator,
                            circuit setup, demo seeding
web/                        React dApp: in-browser proving, walletless submits
docs/                       design doc & demo assets
```

## Run it yourself

```bash
# 1. Contract tests (real Groth16 proofs, incl. the cost report)
cd contracts && cargo test -- --nocapture

# 2. Circuit: prove + verify locally
npm install
node scripts/prove-test.mjs

# 3. Rebuild the circuit from source (downloads public Hermez ptau)
./scripts/setup-circuit.sh

# 4. Web app
cd web && npm install && npm run dev

# 5. Deploy your own contract (needs stellar-cli + funded testnet key)
cd contracts && stellar contract build --manifest-path booth/Cargo.toml
VK=$(python3 -c "import json; print(json.load(open('booth/test_fixtures.json'))['vk_bytes'])")
stellar contract deploy --wasm target/wasm32v1-none/release/booth.wasm \
  --source <your-key> --network testnet -- --vk_bytes "$VK"
```

## Security model — honest edition

This is a hackathon build. What's real and what isn't:

**Real:** the circuit, the on-chain Groth16 verification (no mocks — a bad proof or reused nullifier is rejected by the contract on testnet; try it), the in-browser proving, the cost numbers.

**Trust assumptions & known limitations:**

- **Trusted setup.** Phase 1 is the public Hermez ceremony; the circuit-specific phase 2 had a **single dev contribution** — fine for a demo, unacceptable for production (a real deployment needs a multi-party phase 2).
- **The organizer picks the electorate.** Whoever creates a poll chooses whose commitments are in the tree (exactly like a company picks its shareholder register). Registration UX for voter-generated commitments exists, but the organizer could still include fake voters. Mitigation path: publish the commitment list next to the root (the app does this for created polls).
- **Coercion / vote-buying resistance is out of scope.** A voter *can* prove how they voted (that's inherent to receipt-producing schemes; MACI-style solutions are future work).
- **Anonymity set = the electorate.** A 3-voter poll is not very anonymous. Also: timing correlation (voting the second the poll opens) is on you.
- **Courier keys, not relayers.** Ballots are submitted from fresh friendbot-funded keys on testnet. Mainnet would use fee-bump relayers or paymaster-style sponsorship.
- **Unaudited code**, demo voter passes are public by design, and the `vote_final.zkey` in this repo is the real proving key for the deployed VK — all standard for a hackathon, none of it production-ready.

## Where this goes

Weighted ballots (token-holding proofs), commit–reveal tallies (hide the running count), MACI-style anti-collusion, organizer-free electorates via on-chain Poseidon registration (CAP-0075 host functions), and a `booth-js` SDK so any Soroban dApp can gate actions on anonymous membership proofs.

---

**Stack:** circom 2.2 · snarkjs 0.7 · circomlib Poseidon · Groth16/BN254 · soroban-sdk 26.1 · Stellar Protocol 26 testnet · React + Vite
**License:** MIT · Built by [@stetang98](https://github.com/stetang98) for Stellar Hacks: Real-World ZK, 2026.
