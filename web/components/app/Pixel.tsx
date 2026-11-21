/** Dot-matrix pictograms, drawn like the netlist art: 7×7 cells, one rect per lit cell. */
const G = {
  mine: [".#####.", ".......", "#######", "#.....#", "#...###", "#.....#", "#######"],
  new: ["...#...", "...#...", "...#...", "#######", "...#...", "...#...", "...#..."],
  approve: [".......", "......#", ".....#.", "#...#..", ".#.#...", "..#....", "......."],
  studio: ["####...", "#...#..", "#....#.", "#....##", "#....#.", "#...#..", "####..."],
  sim: [".......", "###....", "#.#....", "#.#.###", "#.#.#.#", "#.###.#", "......#"],
  rob: ["...#...", ".#####.", ".#...#.", "###.###", ".#...#.", ".#####.", "...#..."],
  x402: ["..###..", ".#...#.", "#..#..#", "#.###.#", "#..#..#", ".#...#.", "..###.."],
  status: [".......", "..#....", "..#....", ".#.#..#", "#..#.#.", "...##..", "......."],
  copy: ["####...", "#..#...", "#.#####", "###...#", "..#...#", "..#...#", "..#####"],
  stop: ["..###..", ".#...#.", "#....##", "#...#.#", "#..#..#", ".##...#", "..###.."],
  ext: ["..#####", ".....##", "....#.#", "...#..#", "..#....", ".#.....", "#......"],
  docs: ["#######", ".......", "#####..", ".......", "######.", ".......", "####..."],
  key: [".###...", "#...#..", "#...#..", ".###...", "..#....", "..###..", "..#.#.."],
  coin: ["..###..", ".#####.", "##...##", "##.####", "##...##", ".#####.", "..###.."],
  bell: ["...#...", "..###..", ".#####.", ".#####.", ".#####.", "#######", "...#..."],
} as const;
export type GlyphName = keyof typeof G;

function cells(rows: readonly string[], size: number) {
  const c = size / rows.length;
  const out: React.ReactNode[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") out.push(<rect key={`${x}-${y}`} x={x * c} y={y * c} width={c - 0.6} height={c - 0.6} />); }));
  return out;
}

export function Glyph({ name, size = 18, color = "var(--lime)" }: { name: GlyphName; size?: number; color?: string }) {
  return <svg className="px" width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill={color} shapeRendering="crispEdges" aria-hidden="true">{cells(G[name], size)}</svg>;
}

/** A fuse plate for an address: a mirrored 8×8 dither seeded by its hex, so each account has its own mark. */
export function Plate({ address, size = 44, color = "var(--lime)" }: { address: string; size?: number; color?: string }) {
  const n = [...address.toLowerCase().replace(/^0x/, "")].map((h) => parseInt(h, 16) || 0);
  const rows = Array.from({ length: 8 }, (_, y) => {
    const half = Array.from({ length: 4 }, (_, x) => ((n[(y * 4 + x) % n.length] + y + x) % 3 === 0 ? "#" : "."));
    return [...half, ...half.slice().reverse()].join("");
  });
  return <svg className="px" width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill={color} shapeRendering="crispEdges" aria-hidden="true">{cells(rows, size)}</svg>;
}
