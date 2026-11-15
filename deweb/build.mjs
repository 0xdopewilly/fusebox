// Builds dist/index.html: one self-contained page (CSS, JS, fonts and art inlined) for DeWEB.
// Fails if anything in it would count as an off-chain reference under TapeKit's purity scan (SPEC §8).
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = (p) => new URL(`./src/${p}`, import.meta.url);
const b64 = (p, type) => `data:${type};base64,${readFileSync(src(p)).toString("base64")}`;
const fill = (text, map) => Object.entries(map).reduce((t, [k, v]) => t.split(k).join(v), text);

const js = (await build({ entryPoints: [fileURLToPath(src("app.ts"))], bundle: true, minify: true, format: "iife", target: "es2020", platform: "browser", write: false, legalComments: "none" })).outputFiles[0].text;
const css = fill(readFileSync(src("style.css"), "utf8"), {
  __FONT_ARCHIVO__: b64("fonts/archivo-800.woff2", "font/woff2"),
  __FONT_GEIST__: b64("fonts/geist.woff2", "font/woff2"),
  __FONT_MONO500__: b64("fonts/geist-mono-500.woff2", "font/woff2"),
  __FONT_MONO650__: b64("fonts/geist-mono-650.woff2", "font/woff2"),
}).replace(/\/\*(?!CSS)[\s\S]*?\*\//g, "").replace(/\s*\n\s*/g, "\n");
const html = fill(readFileSync(src("page.html"), "utf8"), {
  __IMG_INTACT__: b64("fuse-intact.png", "image/png"),
  __IMG_BLOWN__: b64("fuse-blown.png", "image/png"),
  "/*CSS*/": css,
  "/*JS*/": js.replace(/<\/script/gi, "<\\/script"),
});

// TapeKit kernel/src/purity.js, verbatim regexes: attributes, srcset, CSS url() and @import, meta refresh.
const RES = [
  /\b(?:src|href|action|poster|data|formaction|background)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
  /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi,
  /@import\s+(?:"([^"]*)"|'([^']*)')/gi,
  /<meta[^>]+http-equiv\s*=\s*["']?refresh[^>]*content\s*=\s*["'][^"']*url=([^"'>\s]+)/gi,
];
const external = [];
for (const re of RES) for (const m of html.matchAll(re)) {
  const v = (m[1] ?? m[2] ?? m[3] ?? "").trim();
  for (const c of re.source.startsWith("\\bsrcset") ? v.split(",").map((s) => s.trim().split(/\s+/)[0]) : [v]) if (/^(?:https?|wss?|ftp):/i.test(c) || c.startsWith("//")) external.push(c);
}
if (external.length) { console.error("Off-chain references found:", external); process.exit(1); }

mkdirSync(new URL("./dist/", import.meta.url), { recursive: true });
const bytes = Buffer.from(html, "utf8");
writeFileSync(new URL("./dist/index.html", import.meta.url), bytes);
console.log(`dist/index.html  ${bytes.length} bytes  ${Math.ceil(bytes.length / 24000)} chunks  js ${js.length}  css ${css.length}`);
console.log(`sha256 0x${createHash("sha256").update(bytes).digest("hex")}`);
console.log("purity: no off-chain references");
