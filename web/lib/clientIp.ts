/**
 * The key a per-visitor rate limit counts under: the client's IPv4 address, or its IPv6 /64 (one home or phone gets
 * a whole /64, so counting single IPv6 addresses would hand out endless fresh limits). Vercel sets x-forwarded-for
 * itself, so a client can't choose it.
 */
export function ipKey(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!ip) return "local";
  if (!ip.includes(":")) return ip;
  const [head] = ip.split("%");
  const parts = head.includes("::")
    ? (() => { const [l, r] = head.split("::"); const a = l ? l.split(":") : [], b = r ? r.split(":") : []; return [...a, ...Array(8 - a.length - b.length).fill("0"), ...b]; })()
    : head.split(":");
  return `${parts.slice(0, 4).map((p) => p.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
