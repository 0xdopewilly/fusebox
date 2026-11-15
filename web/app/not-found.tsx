import Link from "next/link";
import SiteHeader from "@/components/site/SiteHeader";

export const metadata = { title: "Not found · Fusebox" };

/** A wrong address trips the fuse: the 404 is a blown cartridge. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <main className="nf wrap">
        <div className="m"><span className="red">[404]</span> <span className="mute">No page at this address</span></div>
        <h1 className="disp">Fuse <span className="red">[blown]</span>.</h1>
        <img src="/fuse-blown.png" width={1539} height={729} alt="A blown fuse" />
        <p>Like a payment to a stranger, this address tripped the breaker. Nothing moved. Pick a line that holds:</p>
        <nav className="nf-links m">
          <Link className="btn lime" href="/"><span>Fusebox home</span> <span className="k">→</span></Link>
          <Link className="btn" href="/app"><span>Open the app</span> <span className="k">→</span></Link>
          <Link className="btn" href="/docs"><span>Docs</span> <span className="k">→</span></Link>
          <Link className="btn" href="/app/try"><span>Try to scam it</span> <span className="k">→</span></Link>
        </nav>
      </main>
    </>
  );
}
