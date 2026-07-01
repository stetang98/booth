# DoraHacks BUIDL 提交文案（提交时复制粘贴）

> 提交入口：https://dorahacks.io/hackathon/stellar-hacks-zk → Submit BUIDL
> 截止：**2026-07-03 17:00 UTC（北京时间 7 月 4 日凌晨 1:00）** — 建议 7/3 中午前提交完
> 要求核对：✅ 开源仓库 ✅ 2-3 分钟演示视频 ✅ ZK 承重（链上验证）

---

## Project name

Booth

## Tagline (one-liner)

The secret ballot, on-chain: anonymous voting for Stellar organizations — every ballot admitted by a Groth16 proof verified with Protocol 25/26 BN254 host functions.

## Description（主文案，英文）

### The problem

The secret ballot is a 150-year-old legal requirement — boards, co-ops, unions and shareholder meetings are obligated to offer it. On-chain governance silently traded it away: every vote is signed by an address, forever linkable to the voter. Today you pick one: **verifiable** (public on-chain voting, zero privacy) or **secret** (off-chain forms, trust-me tallies). A real ballot must be both.

### What Booth does

Booth accepts a ballot **only** with a zero-knowledge proof that the voter (1) knows the secrets of an identity commitment inside the poll's electorate Merkle tree — without revealing which one, (2) presents an unused per-poll **nullifier** = Poseidon(secret, pollId) — so double voting is cryptographically impossible while votes across different polls stay unlinkable, and (3) has their ballot choice bound inside the proof. The Soroban contract verifies the Groth16 proof **on-chain**, burns the nullifier, and increments the public tally. Auditable result, untraceable ballots. Voter secrets never leave the browser; ballots travel on throwaway courier keys.

**ZK is load-bearing:** remove the proof and Booth ceases to exist — there is no other mechanism that admits an anonymous-but-eligible voter and stops them voting twice. The proof *is* the ballot box.

### Built on Stellar's newest cryptography

- **BN254 `pairing_check`** (Protocol 25 "X-Ray", CAP-0074) — the Groth16 verification equation, on-chain
- **BN254 `g1_msm`** (Protocol 26 "Yardstick", CAP-0080) — the public-input MSM in one host call
- **Poseidon** (circomlib) in-circuit for commitments, tree and nullifiers

We deliberately took the **BN254 route** instead of the older BLS12-381 example path: it works with stock circom + snarkjs + circomlib and the public Hermez powers-of-tau, and it's measurably cheaper — **27.13M CPU instructions per on-chain vote (27% of budget), ~34% less than the reference BLS12-381 verifier (~41M)**. To our knowledge this is among the first end-to-end Circom→Groth16→BN254-host-function applications on Stellar; the byte-encoding path (incl. the snarkjs→Soroban G2 limb order) is solved and tested in the repo for anyone to reuse.

### What's real (try to break it)

Everything on Stellar testnet, no mocks: pick a demo voter pass on the live dApp, watch the proof generate in your tab (~1–3s), see it verified on-chain (stellar.expert link on every receipt), then press **"Try voting again"** — the contract rejects the reused nullifier with `AlreadyVoted`. That rejection is the protocol working. You can also create your own poll with your own electorate, all client-side.

- 8 contract unit tests against real snarkjs proofs (tamper rejection, choice-binding, nullifier replay, poll expiry, non-canonical field elements)
- Honest security model in the README: toy phase-2 setup, organizer-picked electorates, coercion-resistance out of scope, courier keys vs. relayers

### Links

- Live dApp: https://booth-stellar.vercel.app
- Contract (testnet): CDZ4RIBISYEIR52SJRY57VMEFQDZNDDO77MSC4JQLBXYI3H4CI3OLCXT
  https://stellar.expert/explorer/testnet/contract/CDZ4RIBISYEIR52SJRY57VMEFQDZNDDO77MSC4JQLBXYI3H4CI3OLCXT
- GitHub: https://github.com/stetang98/booth
- Demo video: 【提交前填 YouTube/Loom 链接】

### Roadmap

Weighted ballots (token-holding proofs), commit-reveal tallies, MACI-style anti-collusion, organizer-free registration via CAP-0075 on-chain Poseidon, and a booth-js SDK so any Soroban dApp can gate actions on anonymous membership proofs.

---

## 表单字段速查

| 字段 | 填写 |
|---|---|
| BUIDL name | `Booth` |
| Logo | `submission/booth-logo.png`（480×480，待生成） |
| Category | Crypto / Web3 |
| Platform technology | Stellar · ZK |
| Tech tags | Rust, Circom, Zero Knowledge, Soroban, Groth16, BN254 |
| GitHub link | `https://github.com/stetang98/booth` |
| Demo/dApp URL | `https://booth-stellar.vercel.app` |
| Video | 【YouTube unlisted 链接】 |
| Team | Solo — Ste Tang（@Stetang3438 / GitHub stetang98） |
| Contact | Telegram @Stetang |

## 提交前检查清单

- [ ] 三个链接全部无痕窗口可打开（GitHub / dApp / 视频）
- [ ] dApp 上 poll 2 能完整投一票 + 重投被拒（录像前后各验一次）
- [ ] README 顶部链接都是活的
- [ ] 视频 2-3 分钟内，展示：问题 → 投票全流程（证明生成+链上验证+回执）→ 双投被拒 → 计票 + stellar.expert
- [ ] 提交后状态 under review → 用 GlassVault 的催审模板去 Telegram 群催
