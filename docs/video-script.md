# Booth 演示视频脚本（目标 2:30，纯屏幕录制 + 字幕，无需出镜/配音）

格式：1920×1080 · 屏幕录制（浏览器 + 少量终端）· 大字幕卡 + 界面操作 · 背景音乐（轻，无版权）

| # | 时间 | 画面 | 字幕/文案（英文） |
|---|---|---|---|
| 1 | 0:00–0:12 | 标题卡：Booth logo + 一句话 | **Booth — the secret ballot, on-chain.** Anonymous voting for Stellar organizations, enforced by zero-knowledge proofs. |
| 2 | 0:12–0:30 | 问题卡（两栏对比动画：public voting vs off-chain form） | On-chain voting is public forever. Off-chain voting is "trust me". The secret ballot — a 150-year legal requirement — must be **both verifiable and secret**. |
| 3 | 0:30–0:45 | dApp 首页滚动，指到 demo poll | This is Booth, live on Stellar testnet. One contract, real Groth16 proofs — no mocks. Poll: *"Fund Project Aurora from the community treasury?"* |
| 4 | 0:45–1:20 | 核心流程：选 Ada 的 voter pass → 填选票 → Cast ballot → 步进器逐步点亮（Merkle → Groth16 proving → courier key → on-chain verify ✓）→ 回执卡 + stellar.expert 交易页打开 | Pick a voter pass. Mark the ballot. The proof is generated **in the browser** — secrets never leave the tab (~2s, 4,432 constraints). A throwaway courier key submits it. The Soroban contract verifies the proof with **Protocol 25/26 BN254 host functions** — here's the transaction on stellar.expert. Nobody can tell *which* of the five voters just voted. |
| 5 | 1:20–1:40 | 高光时刻：同一 pass 再投一次 → 合约拒绝 AlreadyVoted 的友好提示特写 | Try voting twice? The proof exposes a **nullifier** — same voter + same poll = same nullifier. The contract burns it: `Error #5 AlreadyVoted`. **That rejection is the protocol working.** |
| 6 | 1:40–2:00 | 换 Grace 投另一票 → 计票条动 → results 面板 | Different voter, fresh nullifier — accepted. The tally is public and auditable by anyone; the ballots are not linkable to voters. |
| 7 | 2:00–2:15 | 快速蒙太奇：create-your-own-poll 向导（生成 passes → root → 开票）+ 终端 `cargo test` 8 绿 + cost 报告特写 27.1M | Create your own electorate in 30 seconds — passes generated client-side. Under the hood: 8 contract tests against real proofs, and **27M CPU per vote — 27% of budget, ~34% cheaper than the BLS12-381 reference** — thanks to CAP-74 pairing_check + CAP-80 MSM. |
| 8 | 2:15–2:30 | 结尾卡：repo + 合约 + dApp 链接，一行 roadmap | ZK is the ballot box here — remove the proof and there is no protocol. github.com/stetang98/booth · live on testnet · Built for Stellar Hacks: Real-World ZK. *Ballots are anonymous. Math is loud.* |

## 制作清单

- [ ] 录屏素材：§3–§7 每段单独录（Playwright 脚本驱动浏览器，光标平滑；1080p；浅色主题）
- [ ] 终端素材：`cargo test -- --nocapture` 输出 + budget 报告滚动
- [ ] 标题卡/问题卡：HTML 一页渲染后截图/录制（与 dApp 同款字体 Fraunces）
- [ ] 音乐：YouTube Audio Library 无版权轻节奏（或免）
- [ ] ffmpeg 拼接 + drawtext/ASS 字幕（英文字幕，字号大，底部）
- [ ] 输出 `docs/demo.mp4` ≤ 2:45；上传 YouTube unlisted；链接回填 README + BUIDL.md
