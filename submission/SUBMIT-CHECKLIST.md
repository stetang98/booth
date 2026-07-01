# Booth — DoraHacks 提交（逐字段可粘贴 · 共 5 页）

入口：https://dorahacks.io/hackathon/stellar-hacks-zk → **Register as Hacker**（没注册过先注册）→ **Submit BUIDL**
截止 **2026-07-03 17:00 UTC = 北京时间 7/4 凌晨 1:00** · 建议 **7/2 提交完**，给审核留缓冲。
页面顺序：**Profile → Details → Team → Contact → Submission**

> 视频已传 YouTube（unlisted）：https://youtu.be/woqsZBT4vUY —— 下文所有视频链接已回填好，直接照抄即可。

================================================================
# ① PROFILE
================================================================

真实表单字段顺序（已核对当前 DoraHacks UI）：

| 字段 | 粘这个 |
|---|---|
| BUIDL (project) name | `Booth` |
| BUIDL logo | 上传 `submission/booth-logo.png`（480×480，<2MB） |
| Vision（"Describe the problem which this project solves"） | 见下方单独一段 |
| Category → Key innovation domains（可选，多选） | 搜索并选 **`ZK`**（本届核心标签，必选）；如列表里有 DAO/Governance 可顺手加一个 |
| Infrastructures → **Layer-1s/L1s**（可选） | 搜索并选 **`Stellar`**（Stellar 是独立 L1，不是 L2/Appchain，其余三栏 L2s/Appchains/Other 留空） |
| Is this BUIDL an AI Agent? | **No**（开关关闭） |
| GitHub/Gitlab/Bitbucket * | `https://github.com/stetang98/booth` |
| Project website | `https://booth-stellar.vercel.app` |
| Demo video * | `https://youtu.be/woqsZBT4vUY` |
| Social links（至少一个） | `https://x.com/Stetang3438` |

**Vision（问题优先描述，252 字符，粘这一行）:**

On-chain governance dropped the secret ballot: every vote is signed by an address, linkable forever. Booth fixes this — Groth16 proofs on Stellar's new BN254 host functions let eligible voters stay anonymous, block double votes, keep tallies auditable.

================================================================
# ② DETAILS
================================================================
只有一个富文本框「Describe your BUIDL」，吃 Markdown。
把下面 **【复制开始】到【复制结束】之间整段** 粘进去。
- 若格式没渲染：点工具栏 `<>`（源码模式），或右侧 "Switch to old editor"，再粘。
- 加分项：工具栏 🎬 图标可**内嵌** demo 视频，粘 `https://youtu.be/woqsZBT4vUY`，评委不用跳走就能看。

------------------------------【复制开始】------------------------------
**Booth is the secret ballot, on-chain — anonymous voting for Stellar organizations. A ballot is accepted *only* with a Groth16 zero-knowledge proof, verified inside a Soroban contract by Stellar's Protocol 25/26 BN254 host functions. The proof is the ballot box.**

▶ Demo: https://youtu.be/woqsZBT4vUY · Live dApp (no wallet needed): https://booth-stellar.vercel.app · Code (MIT): https://github.com/stetang98/booth

### The problem

The secret ballot is a 150-year-old legal requirement — boards, co-ops, unions and shareholder meetings are obligated to offer it. On-chain governance silently traded it away: every vote is signed by an address, forever linkable to the voter. Today you pick one: **verifiable** (public on-chain voting, zero privacy) or **secret** (off-chain forms, trust-me tallies). A real ballot must be both.

### What Booth does

Every ballot carries a zero-knowledge proof that shows, without revealing who the voter is:

**1 · "I am eligible."** The voter knows the secrets behind an identity commitment inside the poll's electorate — a Poseidon Merkle tree whose root is frozen on-chain when the poll opens. Which member? Cryptographically unknowable.

**2 · "I haven't voted yet."** The proof exposes a per-poll **nullifier** = Poseidon(identitySecret, pollId). Same voter + same poll → same nullifier → the contract rejects the second ballot with `AlreadyVoted`. Across different polls, nullifiers are unlinkable — no cross-poll profiling.

**3 · "This is my choice."** The ballot choice is bound inside the proof; it cannot be altered in flight.

The Soroban contract verifies the proof on-chain, burns the nullifier, and increments a public tally. Auditable result, untraceable ballots. Voter secrets never leave the browser; ballots travel on throwaway courier keys unrelated to voter identity.

**ZK is load-bearing:** remove the proof and Booth ceases to exist — nothing else admits an anonymous-but-eligible voter while making double voting impossible.

### Built on Stellar's newest cryptography

- **BN254 `pairing_check`** (Protocol 25 "X-Ray", CAP-0074) — the Groth16 verification equation, on-chain
- **BN254 `g1_msm`** (Protocol 26 "Yardstick", CAP-0080) — the public-input MSM in one host call
- **Poseidon** (circomlib) in-circuit for commitments, Merkle tree and nullifiers

We deliberately chose the **BN254 route** over the older BLS12-381 example path: it works with stock circom + snarkjs + circomlib and the public Hermez powers-of-tau, and it is measurably cheaper — **27.13M CPU instructions per on-chain vote (27% of the tx budget), ~34% less than the reference BLS12-381 verifier**. Among the first end-to-end Circom → Groth16 → BN254-host-function applications on Stellar; the snarkjs→Soroban byte-encoding path (including the G2 limb-order swap) is solved, tested, and reusable from the repo.

### What's real — try to break it

Everything runs on Stellar testnet with no mocks:

1. Open https://booth-stellar.vercel.app → the live demo poll. No wallet extension needed.
2. Pick a demo voter pass, mark the ballot, cast — the Groth16 proof (4,432 constraints) is generated **in your browser** in ~1–3s and verified by the contract on-chain. Every receipt links to the transaction on stellar.expert.
3. Press **"Try to vote twice ✋"** — the contract rejects the reused nullifier: `contract error #5 · AlreadyVoted`. That rejection is the protocol working.
4. Or create your own poll: the app generates voter passes client-side, builds the electorate tree in-browser, opens the poll on testnet, and hands you the passes to distribute.

Hardening beyond the happy path: an independent security review during the build found the classic circomlib `LessThan` wraparound under-constraint — fixed with a full `Num2Bits` range decomposition; public inputs are rebuilt from contract state (root, pollId) so proofs can't be replayed against stale or foreign electorates; non-canonical field elements (≥ r) are rejected to kill nullifier aliasing.

### Verifiable on-chain

- Contract: https://stellar.expert/explorer/testnet/contract/CAQY4QYKESCAPKLDS5O5RLKGXMALSNZ3NCBT327BETJP7ZKOCL6HZKEW
- A real anonymous ballot (browser-generated proof, verified on-chain): https://stellar.expert/explorer/testnet/tx/3d2d6845a32353a8af04c427fb474366553e07572e16198306dfd80b09de8574
- 8 contract unit tests against real snarkjs proofs: tamper rejection, choice-binding, nullifier replay, poll expiry, non-canonical field elements, cost report

### Honest limitations (hackathon build)

Toy single-contribution phase-2 setup (production needs a multi-party ceremony) · organizers pick electorates (like a shareholder register) · coercion/vote-buying resistance out of scope (MACI-style is future work) · courier keys stand in for mainnet fee-bump relayers · unaudited.

### Tech stack

Circom 2.2 circuit (Poseidon Merkle depth 16 + nullifier, 4,432 constraints) · snarkjs Groth16 over BN254 · Soroban contract in Rust (soroban-sdk 26.1, `bn254().pairing_check` + `g1_msm`) · React + Vite dApp with in-browser proving, walletless courier-key UX · Stellar testnet (Protocol 26).
------------------------------【复制结束】------------------------------

================================================================
# ③ TEAM
================================================================
- **Invite new members**：单人项目，**留空**。
- **Team information ***（必填文本框）—— 粘这段：

Solo builder. I designed and built Booth end-to-end during the hackathon: the Circom circuit (Poseidon Merkle membership + per-poll nullifiers), the Soroban contract verifying Groth16 proofs via the new BN254 host functions (8 unit tests against real proofs, 27.1M CPU per vote), and the React dApp with in-browser proving and walletless UX. One person, full stack: circuit, contract, frontend, demo.

================================================================
# ④ CONTACT（仅 DoraHacks staff 可见）
================================================================
- **Telegram (primary contact) ***：`@Stetang`
- **Backup contact ***：选 **WeChat**，填 `SteForget`

================================================================
# ⑤ SUBMISSION（点 Submit 前核对）
================================================================
- **Track**：本届是单一开放赛道 —— 下拉里只有一项就选它（名字类似 "Stellar Hacks: Real-World ZK" / "Open Track"）；若出现多个或看不懂，截图发我确认。
- **Need teammates?**：跳过。
- **Which country are you based in? ***：如实填写。
- **☑ I agree to the Terms of Use Agreement and Participant Agreement**：勾上。
- 点最终 **Submit**。

> 注：没有单独「合约地址」栏 —— 已写进 Details 正文 "Verifiable on-chain"，评委直接可见。

================================================================
# ⏳ 提交后：still under review 怎么办
================================================================
under review = 组织方人工审核队列，**正常现象**。算不算数看「提交时间」（截止前即可），审核通过常发生在截止之后。

**主动催审两渠道：**
1. BUIDL 页面的 **"Message organizer →"** 按钮（组织方联系人：jayrome）
2. 官方群：Stellar Dev Discord `#zk-chat`（https://discord.gg/stellardev）· Telegram 群 https://t.me/+e898qibDUVExODkx

**可直接粘贴的催审消息（英文）：**
> Hi! My BUIDL "Booth" (submitted July 2) is still "under review" ahead of the July 3 deadline. Could an organizer please review/approve it when possible? All deliverables are live and accessible — public GitHub repo, demo video, and the deployed dApp verifying Groth16 proofs on Stellar testnet (contract CAQY4Q…6HZKEW). Happy to provide anything you need. Thank you! — @Stetang (Telegram)

**别做的：** 别编辑/重新提交（可能重置审核）；就等 + 催。

================================================================
# 提交前 5 分钟自检
================================================================
- [ ] 无痕窗口打开三链接全部可用：GitHub / booth-stellar.vercel.app / https://youtu.be/woqsZBT4vUY
- [ ] dApp 上点 "Start a fresh demo poll" 投一票走通（顺手确认服务正常）
- [ ] YouTube 视频公开范围确认是"不公开"（Unlisted），不是"私享"
- [ ] Vision 一行粘贴后没被截断（252 字符，注意实际表单若有更严上限就从中间那句裁）
