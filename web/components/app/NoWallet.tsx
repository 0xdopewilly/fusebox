/** Shown where a Connect button would be when the browser has no wallet at all. */
export default function NoWallet() {
  return <p className="m mute nowallet">No wallet in this browser. <a className="lime" href="https://web3.okx.com/download" target="_blank" rel="noreferrer">Get OKX Wallet ↗</a> or open Fusebox in its built-in browser.</p>;
}
