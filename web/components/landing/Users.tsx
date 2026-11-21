"use client";
import { useRef } from "react";
import { gsap, SplitText, useGSAP, reduced, whenNear } from "@/lib/gsap";
import Reg from "./Reg";

const WHO = [
  { k: "A", h: "Teams with payment agents", p: "Invoice and AP agents, procurement bots, payout runs. The agent keeps its speed, and the fuses keep it inside the owner's rules. Set up in three taps.", b: "0.005", s: "USD₮0 for a payment checked by all five fuses" },
  { k: "B", h: "Agent platforms and wallets", p: "Give every user's agent a wallet with fuses: one factory call on X Layer, or one line of MCP for Claude, Cursor and any MCP client.", b: "1 line", s: "npx -y fusebox-mcp" },
  { k: "C", h: "Circuit designers", p: "Build a rule without code in Fuse Studio, checked against your rule before it ships, or bring your own NAND circuit. Tape it out on TapeOut and list it: every wallet that installs it pays you on every decision.", b: "90%", s: "of each fee, paid to the circuit NFT" },
];

export default function Users() {
  const root = useRef<HTMLElement>(null);
  useGSAP((_, contextSafe) => {
    // below the fold: set this section up only as it nears the viewport, so hydration stays light
    let undo: void | (() => void);
    const cancel = whenNear(root.current, contextSafe!(() => { undo = (() => {
      const el = root.current!;
      if (reduced()) return;
      const h = SplitText.create(el.querySelector("h2")!, { type: "lines", linesClass: "line-mask", mask: "lines" });
      gsap.from(h.lines, { yPercent: 105, duration: 1.2, stagger: 0.08, scrollTrigger: { trigger: el.querySelector(".body"), start: "top 75%" } });
      gsap.from(el.querySelectorAll(".card"), { y: 34, autoAlpha: 0, duration: 0.9, stagger: 0.12, scrollTrigger: { trigger: el.querySelector(".cards"), start: "top 80%" } });
      const tl = gsap.timeline({ scrollTrigger: { trigger: el.querySelector(".earn"), start: "top 78%" } });
      tl.from(el.querySelectorAll(".earn .node"), { autoAlpha: 0, scale: 0.92, transformOrigin: "50% 50%", duration: 0.6, stagger: 0.18 })
        .from(el.querySelectorAll(".earn .wire"), { drawSVG: "0%", duration: 0.9, ease: "power2.inOut", stagger: 0.1 }, 0.2)
        .from(el.querySelectorAll(".earn .pulse"), { autoAlpha: 0, duration: 0.3 }, 1);
    })(); }));
    return () => { cancel(); if (typeof undo === "function") undo(); };
  }, []);
  return (
    <section className="users reg" ref={root} id="who">
      <Reg />
      <div className="wrap sh"><div className="m lime" data-scr>[06]</div><div className="m mute" data-scr>Who it&apos;s for</div><div className="m mute" style={{ gridColumn: "5 / 7" }} data-scr>Pay per decision. No seats, no subscriptions.</div></div>
      <div className="wrap body">
        <h2 className="disp">For anyone who lets an agent <span className="lime">[touch money]</span>.</h2>
      </div>
      <div className="wrap cards">
        {WHO.map((w) => (
          <div className="card" key={w.k}>
            <div className="m lime">{w.k}</div>
            <h3>{w.h}</h3>
            <p>{w.p}</p>
            <div className="stat"><b>{w.b}</b><span className="m mute">{w.s}</span></div>
          </div>
        ))}
      </div>
      <div className="wrap">
        <div className="earn">
          <div className="txt">
            <div className="m lime">How Fusebox earns</div>
            <p>Each fuse charges a small fee every time it checks a payment, in USD₮0, in the same call as the payment. The fuse&apos;s designer gets 90%. Fusebox keeps 10%, and the contract caps that share at 20%.</p>
            <p className="m mute" style={{ marginTop: 16 }}>Revenue grows with the payments agents make, not with seats.</p>
          </div>
          <svg viewBox="0 0 760 230" className="flow" role="img" aria-label="A wallet pays a fee per check: 90% to the fuse's designer, 10% to Fusebox">
            <path className="wire" d="M232 115 H330 C380 115 380 52 430 52 H500" />
            <path className="wire" d="M232 115 H330 C380 115 380 178 430 178 H500" />
            <path className="pulse" d="M232 115 H330 C380 115 380 52 430 52 H500" />
            <path className="pulse" d="M232 115 H330 C380 115 380 178 430 178 H500" />
            <g className="node"><rect x="2" y="72" width="230" height="86" /><text x="20" y="104" className="t1">WALLET</text><text x="20" y="128" className="t2">PAYS A FEE PER CHECK</text><text x="20" y="146" className="t2">0.0045 USD₮0 ON ATLAS</text></g>
            <g className="node hot"><rect x="500" y="14" width="256" height="76" /><text x="518" y="44" className="t1">DESIGNERS · 90%</text><text x="518" y="68" className="t2">TO WHOEVER HOLDS THE CIRCUIT NFT</text></g>
            <g className="node"><rect x="500" y="140" width="256" height="76" /><text x="518" y="170" className="t1">FUSEBOX · 10%</text><text x="518" y="194" className="t2">CAPPED AT 20% IN THE CONTRACT</text></g>
          </svg>
          <div className="flow-m m" aria-hidden="true">
            <div className="n"><b>Wallet</b>Pays a fee per check · 0.0045 USD₮0 on Atlas</div>
            <div className="arr">↓</div>
            <div className="n hot"><b>Designers · 90%</b>To whoever holds the circuit NFT</div>
            <div className="n"><b>Fusebox · 10%</b>Capped at 20% in the contract</div>
          </div>
        </div>
      </div>
    </section>
  );
}
