import Link from "next/link";
import SiteHeader from "@/components/site/SiteHeader";
import { T } from "@/lib/i18n";

export const metadata = { title: "Not found · Fusebox" };

/** A wrong address trips the fuse: the 404 is a blown cartridge. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <main className="nf wrap" id="main">
        <div className="m"><span className="red">[404]</span> <span className="mute"><T en="No page at this address" zh="此地址没有页面" /></span></div>
        <h1 className="disp"><T en={<>Fuse <span className="red">[blown]</span>.</>} zh={<>保险丝 <span className="red">[已熔断]</span>。</>} /></h1>
        <T en={<img src="/fuse-blown.png" width={1539} height={729} alt="A blown fuse" />} zh={<img src="/fuse-blown.png" width={1539} height={729} alt="一个已熔断的保险丝" />} />
        <p><T en="Like a payment to a stranger, this address tripped the breaker. Nothing moved. Pick a line that holds:" zh="就像一笔付给陌生地址的付款，这个地址触发了 Breaker。资金没有移动。换一条走得通的线路：" /></p>
        <T
          en={
            <nav className="nf-links m" aria-label="Where to next">
              <Link className="btn lime" href="/"><span>Fusebox home</span> <span className="k">→</span></Link>
              <Link className="btn" href="/app"><span>Open the app</span> <span className="k">→</span></Link>
              <Link className="btn" href="/docs"><span>Docs</span> <span className="k">→</span></Link>
              <Link className="btn" href="/app/try"><span>Try to scam it</span> <span className="k">→</span></Link>
            </nav>
          }
          zh={
            <nav className="nf-links m" aria-label="接下来去哪">
              <Link className="btn lime" href="/"><span>Fusebox 首页</span> <span className="k">→</span></Link>
              <Link className="btn" href="/app"><span>打开应用</span> <span className="k">→</span></Link>
              <Link className="btn" href="/docs"><span>文档</span> <span className="k">→</span></Link>
              <Link className="btn" href="/app/try"><span>试着骗它</span> <span className="k">→</span></Link>
            </nav>
          }
        />
      </main>
    </>
  );
}
