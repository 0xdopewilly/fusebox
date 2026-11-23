# Fusebox

[English](README.md) · **中文**

**你的智能体付款。电路说了算。**

Fusebox 是一个给 AI 智能体用的钱包，运行在 X Layer 上。智能体发起的每一笔付款，都必须先经过一组「保险丝」：在 [TapeOut](https://tapeout.net) 上流片的小型逻辑电路，与付款在同一笔交易里、在 X Layer 链上完成检查。所有保险丝都说可以，钱才会转出；只要有一个说不，什么都不会发生。每个保险丝的设计者，在它每次检查付款时都能赚取费用。

[![Fusebox MCP 服务器](https://mcprush.com/badge/fusebox-mcp/card.svg)](https://mcprush.com/to/fusebox-mcp?ref=badge)

## 评审速览（X Layer TapeOut Accelerate）

| | |
|---|---|
| **演示视频（2:30）** | https://youtu.be/vcopkuNdhkc （附中文字幕） |
| **在线应用** | https://fusebox-xlayer.vercel.app/app · 无需钱包即可试玩：[/app/try](https://fusebox-xlayer.vercel.app/app/try) |
| **DeWEB 链上版本** | https://15-2-272.tapekit.org/ （`15.2.272.tape`，存放在电路 #15 的容器里，由 TapeKit 打开） |
| **TapeOut 处理器** | `0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355`（OrderGuard，X Layer 链 196） |
| **电路 ID** | 15、16、17、18、21（保险丝 1–5）· 22、23、24、25（竞争设计，保险丝 6–9） |
| **使用的 TapeOut 能力** | 电路：每笔付款都在同一笔交易里调用处理器的 `eval` / `step`。**DeWEB + TapeKit**：链上版本的应用。**TapeSend**：每一次拦截都由电路 #15 发送到钱包的链上收件箱。 |
| **商业模式** | [docs/BUSINESS.md](docs/BUSINESS.md)（英文）：每次检查费用的 90% 归电路设计者，Fusebox 收取 10% |
| **实时数据** | [/app/status](https://fusebox-xlayer.vercel.app/app/status)：钱包数、已检查的付款、电路运算次数、设计者收入、链上提醒 |
| **安全保证** | 合约已在 Sourcify 验证；不变量测试、变异测试，以及 Payee Guard 全输入证明，见 [docs/ASSURANCE.md](docs/ASSURANCE.md)（英文） |
| **赛期内开发** | 首次提交 2026-11-13，Fusebox 全部是赛期内完成的工作 |
| **关注** | [@fuseboxhq](https://x.com/fuseboxhq) |

## 解决什么问题

AI 智能体已经能持有资金：付发票、付退款、按调用付 API。但它们整天在读邮件、聊天记录和网页，而读到的任何内容都可能在骗它。一封「我们换了银行」的诈骗邮件，一张重复发送的发票，一次提示词注入，钱就没了，链上也没有退款。

常见的做法是放在服务器上的策略引擎（你得信任它），或者每笔都要人工签名的多签（太慢）。Fusebox 的规则是电路，在付款的同一笔交易里于链上执行：没有任何服务器能让付款蒙混过关，也没有提示词能说服它。

## 保险丝：5 个插槽，9 个电路

**插槽（socket）**就是一种规则：它规定了钱包要告诉电路什么，以及所有者的设置是什么意思。Fusebox 定义了 5 个插槽，为某个插槽流片的任何电路都可以作为保险丝上架。**目前有 9 个保险丝在线：**Fusebox 的 5 个原始保险丝（每个插槽一个），以及在 1–4 号插槽上与它们竞争的 4 个竞争设计。钱包所有者自行选择安装哪一个。9 个全部是 X Layer 上 OrderGuard 处理器（`0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355`）里的 TapeOut 电路。

**5 个原始保险丝（保险丝 1–5）**

| 保险丝 | 电路 | 检查什么 |
|---|---|---|
| [Daily Cap](https://fusebox-xlayer.vercel.app/app/fuse/1?lang=zh) | #15 | 每个 UTC 日的付款总额不超过上限 |
| [Payee Guard](https://fusebox-xlayer.vercel.app/app/fuse/2?lang=zh) | #16 | 只付给已保存的收款方；新收款方在冷静期内只能收小额试付 |
| [Breaker](https://fusebox-xlayer.vercel.app/app/fuse/3?lang=zh) | #17 | 一笔付给陌生地址的付款就会让它熔断，直到所有者重置（带记忆位） |
| [Two of Three](https://fusebox-xlayer.vercel.app/app/fuse/4?lang=zh) | #18 | 超过阈值的大额付款，需要三位审批人中的两位签名 |
| [Repeat Guard](https://fusebox-xlayer.vercel.app/app/fuse/5?lang=zh) | #21 | 同一收款方、同一金额在时间窗口内再次付款会被拦截：同一张发票只付一次 |

**4 个竞争设计（保险丝 6–9）**：同样的插槽，不同的策略。由 Fusebox 团队流片，用来展示同一插槽上的设计竞争；外部设计者也可以用同样的方式上架自己的设计。

| 保险丝 | 插槽 | 电路 | 检查什么 |
|---|---|---|---|
| [Per-Payment Cap](https://fusebox-xlayer.vercel.app/app/fuse/6?lang=zh) | Daily Cap | #22 | 无论来多少张发票，单笔付款都不能超过上限 |
| [Strict Payee Book](https://fusebox-xlayer.vercel.app/app/fuse/7?lang=zh) | Payee Guard | #23 | 新保存的收款方在冷静期结束前什么都收不到，连试付也没有 |
| [Two-Strike Breaker](https://fusebox-xlayer.vercel.app/app/fuse/8?lang=zh) | Breaker | #24 | 一个可疑收款方可能是笔误，两个就是规律：第一次被拒绝，第二次让它熔断 |
| [Lead Approver](https://fusebox-xlayer.vercel.app/app/fuse/9?lang=zh) | Two of Three | #25 | 超过阈值时需要两人签名，且其中一人必须是 1 号席位 |

**自己核验。**每个保险丝的页面都实时读取 X Layer：从 TapeOut 处理器读取网表（并与注册表上架时锁定的哈希比对）、门数、决策次数和收益，并附有 OKLink 上的[处理器](https://www.oklink.com/x-layer/evm/address/0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355)和[电路 NFT 合集](https://www.oklink.com/x-layer/evm/token/0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355)链接。在 [tapeout.net](https://tapeout.net) 上：切换到 X Layer，打开 Processors，再进入 OrderGuard 和对应的电路编号。

## 给开发者

- TypeScript SDK：`npm install fusebox-sdk viem`
- MCP 服务器（已收录于官方 MCP Registry）：`claude mcp add fusebox -- npx -y fusebox-mcp`
- Fuse Studio：无需写代码就能设计保险丝，编译成 NAND 门电路，在所有可能的输入上证明正确后再流片：https://fusebox-xlayer.vercel.app/app/studio

更多细节请见英文版 [README](README.md) 和 [文档](https://fusebox-xlayer.vercel.app/docs)。
