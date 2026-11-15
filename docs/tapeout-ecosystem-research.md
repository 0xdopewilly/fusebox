# TapeOut ecosystem: integration research (2026-11-15)

Read-only research against TapeKit, the TAPs repo and X Layer mainnet (chain 196). Sources: TapeKit SPEC.md Appendix B.5 and the README "Site owner handbook"; TAP-10 to TAP-14.

## DeWEB site on a circuit container (TapeKit + DeWEB)

1. Open the circuit's container. Opener `0x536adD8F30f03b69f6fbF29d425A816A0dC50106`, `open(address circuits, uint256 tokenId) payable returns (address)`, FEE = 0.08 OKB.
   For #15 on OrderGuard (`0x57F319CF056F72F48cF1dbb670F2A3DB007Aa355`) the container is `0x7af0647557909b07E0D92C4a8F63396120F8BDB3`.
   Before it is opened, putFile reverts NotOwner(), bind reverts NotContainer() and hub.send reverts NotOpened().
2. Upload to SiteRegistry `0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6` (impl `0xa85c4143…a45f`). Every write is nonpayable.
   - `putFile(address container, string path, string contentType, bytes32 sha256Hash, bytes data)` writes the first ≤24,000 bytes.
   - `appendChunk(address container, string path, uint256 expectIndex, bytes data)` adds the rest, with expectIndex = 1, 2, …
   - `setFallback(address container, string path)`, `removeFile(address container, string path)`
   - `setOperator(address container, address op, uint256 ttl)`
   - Limits: CHUNK_MAX 24000, at most 350 chunks a file.
   - Paths have no leading "/" and no `.` or `..`. sha256 is of the whole file (zero shows as "unverified"). contentType may only use `[A-Za-z0-9.+/;= -]`.
3. Activate (free). DomainBinding `0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9`, `bind(string name, address container, uint256 months) payable`, e.g. `bind("15.2.272.tape", container, 120)` with value 0 (monthlyFee = 0). It used about 170k gas in a precedent tx.
4. URL: https://15-2-272.tapekit.org/ (status page /.tape/status, canonical tape://15.2.272.tape/). The "100% on-chain" badge needs no https:// references.
5. Cost: a full 24 KB chunk is about 5.4M gas. At 0.02 gwei with no L1 fee, 300 KB ≈ 0.0014 OKB. In total, ≈ 0.08 OKB to open plus ≈ 0.002 OKB of gas.
   Working example: 1.2.344.tape (holder setOperator, then the operator uploaded).

## TapeSend

- Hub: proxy `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee`, owner-upgradeable. No protocol fee; payloads up to 16,000 bytes.
- `send(address circuits, uint256 tokenId, bytes32 to, bytes32 ref, bytes payload) returns (uint256)`
- `publishKey(address circuits, uint256 tokenId, uint8 suite, uint16 keyIndex, bytes32 key, uint64 chains)`
- Reads: `keyFor`, `endpointOf(address)`, `inboxPage(bytes32,uint256,uint256)`, `outboxPage(address,uint256,uint256)`
- Event: `Sent(bytes32 indexed to, address indexed from, bytes32 indexed ref, uint256 inboxIndex, uint256 outboxIndex, bytes payload)`
- The sender must be ownerOf of the sending circuit, and its container must be opened. A contract may send; publishKey needs an EOA.
- Endpoint = uint32(0) ‖ uint64(196) ‖ container. #15: `0x0000000000000000000000c47af0647557909b07e0d92c4a8f63396120f8bdb3`.
- Public message (no key, the recipient need not be opened): payload `0x54 0x53 0x02 0x00` ‖ UTF-8 JSON `{"v":1,"kind":"message","subject":…,"body":…}`. Reference code: TapeKit send/module/src (MIT).
- Sealed messages: X25519 + HKDF-SHA256 + XChaCha20-Poly1305, with the key derived from a wallet signature over fixed EIP-4361 text.
- TAP-12 verdicts must answer an earlier sealed commitment, so a single fuse decision isn't a verdict. "Agent seals a promise, Fusebox judges hit/miss at period end" fits, but takes 8+ h.

## TAP-11 / TAP-13 (TapeAPI)

Feasible in 3–4 h: add `.well-known/tapeapi.json` to the DeWEB site, with an EIP-712 Delegation signed by the holder (domain TapeAPI/1/196/hub), and serve signed `check` responses. SDK: github.com/BruceLanLan/tapeapi. TapeAPI isn't one of the tools judges named.

## FabX / TapeCode

Unverified. Neither has a public repo, contract or API. TapeCode is TapeOut's AI dev tool (app list gated to apps built with it); FabX is a circuit-design community.

## Recommendation

1. A DeWEB site on #15 served via tapekit.org. It earns credit for both DeWEB and TapeKit. About 0.082 OKB.
2. TapeSend fuse alerts / a public log. The sender must hold a circuit NFT, so the server needs that key, or a dedicated circuit owned by a hot wallet.
