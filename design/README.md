# Fusebox: three design directions

Static mockups for choosing a visual direction. Each HTML file shows three frames side by side on a grey canvas: the landing hero with a how-it-works band (1440), the agent wallet screen (1440), and the same screen on a phone (390). Blue numbered pins point to the motion notes under each frame. Open a file in a browser to see the CSS motion, or open the matching full-page `.png`.

| File | Direction | Rationale |
|---|---|---|
| `direction-a.html` | **A · Consumer unit**: a breaker panel, warm and tactile | The fuse board is a real panel. Fuses are switches on a rail, and a blown fuse is a dropped red lever that you reset. People understand this without reading anything. It uses TapeOut's own app palette (paper, ink, teal), so it feels native to the TapeOut ecosystem. Best for a broad audience and for the "sure thing, boss" demo moment. |
| `direction-b.html` | **B · Live wire**: a series circuit in X Layer black and lime | The wallet is one wire from the agent to the payee, with the fuses in series on it. Lime is current. It reaches the payee only if every fuse is closed, and a blown fuse is a visible break in the line. On a phone the wire runs vertically. Decisions show as a scope trace. It uses X Layer's official monochrome and lime, so it is the most "X Layer" of the three. |
| `direction-c.html` | **C · Datasheet**: a chip datasheet in TapeOut navy and BEM gold | Fusebox is presented the way chips are. The fuses form a device family with real specs: gates, gas, fee, test coverage. The day's decisions are a timing diagram, one waveform per fuse. This direction leads with the designer economy and with rigour, so it speaks to circuit designers and judges. Its colours come from the TapeOut logo and TapeOut's original site. |

## Demo data (the same in all three)
The data is internally consistent and checked against the circuits' own rounding:
- **Wallet:** Atlas, ops agent. Balance 412.500000 USDT0. Fee balance 1.289000.
- **Fuses**, in stack order:
  - Daily Cap: 50 a day.
  - Payee Guard: 6 payees, 24 h cooling-off, 1.000000 trial.
  - Breaker.
  - Two of Three: over 20.000000, approvers You, Ngozi and Sam.
- **Gate counts and gas** come from `docs/ARCHITECTURE.md`.
- **Fees per check:** 0.001000, 0.001000, 0.000500 and 0.002000, so 0.004500 for all four. These fees are proposals; the open question on fee levels is still open.
- **Today:** 8 decisions, 5 paid totalling 45.25 of the 50 cap, 3 refused:
  - 11:52 refused by Daily Cap and Two of Three;
  - 14:02 a stranger, refused by Payee Guard; the Breaker latched;
  - 14:09 refused because the Breaker was still blown.
- **Lifetime:** 214 decisions. Designers earned 0.639900 and Fusebox 0.071100 at the 10% share.

The designer shown for every fuse is a placeholder address (0x7A3d…91Ce), since we tape out all four ourselves. "Release after delivery" is shown as "in design" because it is held back in STATUS.md.

## Brand sources
Each file's top comment lists the exact tokens and where each one came from:
- **TapeOut:** the tapeout.net app (live `:root` CSS variables and the app bundle) and tapeout.net/old.
- **X Layer:** the official logo kit and guideline PDF in github.com/okx/xlayer-docs (`media-kit/`), and the OKLink X Layer explorer.

xlayer.tech did not load: over HTTPS the server answers with a TLS "unrecognized name" error, and over HTTP it is a parked page. okx.com was not tried because it is geo-blocked from this machine.

Fonts come from Google Fonts:
- A: Bricolage Grotesque.
- B: Geist, plus Geist Mono for addresses only.
- C: Newsreader, IBM Plex Sans Condensed and IBM Plex Mono.
