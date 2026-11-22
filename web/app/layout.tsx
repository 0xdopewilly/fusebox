import type { Metadata, Viewport } from "next";
import { LangProvider } from "@/lib/i18n";
import { Archivo, Geist, Geist_Mono, Noto_Sans_SC } from "next/font/google";
import "lenis/dist/lenis.css";
import "./globals.css";
import SmoothScroll from "@/components/fx/SmoothScroll";
import Cursor from "@/components/fx/Cursor";

// Latin only is preloaded: the page is English and ₮ has its own tiny font (globals.css); latin-ext still loads on demand
const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--f-display", display: "swap" });
const sans = Geist({ subsets: ["latin"], variable: "--f-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap" });
// Chinese (the 中文 switch): Google slices it by character range, so English pages download none of it
const cjk = Noto_Sans_SC({ weight: ["400", "500", "700", "900"], subsets: ["latin"], variable: "--f-cjk", display: "swap", preload: false });

const DESC = "Built on TapeOut and X Layer: Fusebox wires an AI agent's wallet through small logic circuits taped out on TapeOut. A payment reaches the payee only if every fuse holds, and each fuse that checks it pays its designer.";
export const metadata: Metadata = {
  metadataBase: new URL("https://fusebox-xlayer.vercel.app"),
  title: "Fusebox · circuit fuses for AI agent wallets, built on TapeOut",
  description: DESC,
  openGraph: { title: "Fusebox · Your agent pays. TapeOut circuits decide.", description: DESC, url: "/", siteName: "Fusebox", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Fusebox: Your agent pays. Circuits decide." }], type: "website" },
  twitter: { card: "summary_large_image", site: "@fuseboxhq", creator: "@fuseboxhq", title: "Fusebox · Your agent pays. TapeOut circuits decide.", description: DESC, images: ["/og.png"] },
};
export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${sans.variable} ${mono.variable} ${cjk.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js');try{if(sessionStorage.getItem('fx-intro')||matchMedia('(max-width: 700px)').matches)document.documentElement.dataset.intro='skip'}catch(e){}" }} />
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <LangProvider>
          <SmoothScroll />
          <Cursor />
          {children}
        </LangProvider>
      </body>
    </html>
  );
}
