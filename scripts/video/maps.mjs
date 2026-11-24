// Map cards for the daily video: OpenStreetMap tiles (cached in
// scripts/video/tiles so repeat renders don't download them again), red
// route/work-zone lines and pins. Every card carries the required
// "© OpenStreetMap contributors" credit.
import fs from "node:fs";
import path from "node:path";

const UA = { "User-Agent": "waynesville-news-video/1.0 (+https://waynesville.news)" };
export const MAP_W = 720, MAP_H = 600;

const wx = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const wy = (lat, z) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z;
};

async function tile(dir, z, x, y) {
  const name = `${z}-${x}-${y}.png`;
  const f = path.join(dir, name);
  if (!fs.existsSync(f)) {
    const r = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, { headers: UA });
    if (!r.ok) throw new Error(`tile ${name}: HTTP ${r.status}`);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    await new Promise((res) => setTimeout(res, 150)); // stay well inside OSM's tile policy
  }
  return `tiles/${name}`;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// spec: { fit: [[lon,lat],...], pins: [{lon,lat,label,home?,side?,r,o?}], lines: [{coords,r,o?,dur?}],
//         pad?, maxZoom? }  r/o = sentence index / fraction at which the item appears.
export async function buildMap(spec, tilesDir) {
  fs.mkdirSync(tilesDir, { recursive: true });
  const pts = spec.fit;
  const PAD = spec.pad ?? 90;
  const ext = (z) => {
    const xs = pts.map((p) => wx(p[0], z)), ys = pts.map((p) => wy(p[1], z));
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  };
  let z = spec.maxZoom ?? 14;
  while (z > 3) {
    const [a, b, c, d] = ext(z);
    if (b - a <= MAP_W - 2 * PAD && d - c <= MAP_H - 2 * PAD) break;
    z--;
  }
  const [a, b, c, d] = ext(z);
  const ox = (a + b) / 2 - MAP_W / 2, oy = (c + d) / 2 - MAP_H / 2;
  const P = ([lon, lat]) => [wx(lon, z) - ox, wy(lat, z) - oy];
  let imgs = "";
  for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + MAP_W) / 256); tx++)
    for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + MAP_H) / 256); ty++)
      imgs += `<img src="${await tile(tilesDir, z, tx, ty)}" style="left:${(tx * 256 - ox).toFixed(1)}px;top:${(ty * 256 - oy).toFixed(1)}px">`;
  let svg = "";
  for (const l of spec.lines ?? []) {
    const dd = l.coords.map((p, i) => (i ? "L" : "M") + P(p).map((v) => v.toFixed(1)).join(" ")).join("");
    svg += `<path d="${dd}" class="casing" pathLength="1"/><path d="${dd}" class="line draw" pathLength="1" data-r="${l.r}" data-o="${l.o ?? 0}"${l.t != null ? ` data-t="${l.t.toFixed(2)}"` : ""} data-dur="${l.dur ?? 2.5}"/>`;
  }
  let pins = "";
  const boxes = []; // placed label boxes, to keep labels from overlapping
  const boxFor = (x, y, side, label) => {
    const w = 12 * label.length + 28, h = 36;
    return side === "r" ? [x + 20, y - 19, w, h] : side === "l" ? [x - 20 - w, y - 19, w, h] : [x - w / 2, y + 18, w, h];
  };
  const hits = (b) => b[0] < 4 || b[0] + b[2] > MAP_W - 4 || b[1] < 4 || b[1] + b[3] > MAP_H - 30 ||
    boxes.some((o) => b[0] < o[0] + o[2] && o[0] < b[0] + b[2] && b[1] < o[1] + o[3] && o[1] < b[1] + b[3]);
  for (const p of spec.pins ?? []) {
    const [x, y] = P([p.lon, p.lat]);
    let side = p.side ?? (x > MAP_W * 0.6 ? "l" : "r");
    if (p.label) {
      const order = [side, side === "r" ? "l" : "r", "b"];
      side = order.find((s) => !hits(boxFor(x, y, s, p.label))) ?? side;
      boxes.push(boxFor(x, y, side, p.label));
    }
    pins += `<div class="pin ${p.home ? "home" : ""} it" data-r="${p.r}" data-o="${p.o ?? 0}"${p.t != null ? ` data-t="${p.t.toFixed(2)}"` : ""} style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px"><i></i>${p.label ? `<span class="${side}">${esc(p.label)}</span>` : ""}</div>`;
  }
  // slow push-in toward what the story is about: the non-home pins and lines
  const focus = [...(spec.pins ?? []).filter((p) => !p.home).map((p) => P([p.lon, p.lat])), ...(spec.lines ?? []).flatMap((l) => [P(l.coords[0]), P(l.coords[l.coords.length - 1])])];
  const fx = focus.length ? focus.reduce((a, q) => a + q[0], 0) / focus.length : MAP_W / 2;
  const fy = focus.length ? focus.reduce((a, q) => a + q[1], 0) / focus.length : MAP_H / 2;
  const origin = `${Math.min(85, Math.max(15, (fx / MAP_W) * 100)).toFixed(1)}% ${Math.min(85, Math.max(15, (fy / MAP_H) * 100)).toFixed(1)}%`;
  return `<div class="map"><div class="mapin" style="transform-origin:${origin}"><div class="tiles">${imgs}</div><svg width="${MAP_W}" height="${MAP_H}">${svg}</svg>${pins}</div><div class="attr">© OpenStreetMap contributors</div></div>`;
}

// Live S.R./U.S. work-zone outlines from ODOT's keyless OHGO feed, for the
// roads.json items the brief lists. Returns [] on any failure.
export async function workZoneLines(routeNames) {
  try {
    const r = await fetch("https://api.ohgo.com/construction", { headers: UA });
    if (!r.ok) return [];
    const items = await r.json();
    const out = [];
    for (const it of Array.isArray(items) ? items : []) {
      if (!routeNames.includes(it.RouteName)) continue;
      for (const l of it.WorkZoneLines ?? []) if (l.Polyline?.length > 1) out.push(l.Polyline);
      if (out.length) break; // one direction is enough
    }
    return out;
  } catch {
    return [];
  }
}

// Driving route between two [lon, lat] points from the public OSRM demo server,
// as a list of [lon, lat]. Returns null on any failure (the map then shows
// pins only).
export async function drivingRoute(from, to) {
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`, { headers: UA });
    if (!r.ok) return null;
    const j = await r.json();
    const c = j.routes?.[0]?.geometry?.coordinates;
    return Array.isArray(c) && c.length > 1 ? c : null;
  } catch {
    return null;
  }
}
