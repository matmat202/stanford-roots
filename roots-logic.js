/* Pure logic for Stanford Roots: bins, search, sorting, URL state. No DOM, so node can
 * test it (site/roots-logic.test.mjs). A person is the array build.py writes:
 *   [qid, name, description, bornYear|null, birthplace, [countryQid...], x|null, y|null, url,
 *    [usStateQid...]]
 * The states are empty for anyone not counted in the US, and for the ~2% of the US-born
 * whose birthplace Wikidata does not place in a state (bare "United States", Puerto Rico).
 */
export const P = { Q: 0, NAME: 1, DESC: 2, BORN: 3, PLACE: 4, CS: 5, X: 6, Y: 7, URL: 8, ST: 9 };
export const US = 'Q30';

// Class breaks for the map. Counts run from 1 to ~3,800 (the US), so they are log-ish:
// a linear scale would paint the US dark and every other country the same pale shade.
export const BREAKS = [1, 3, 10, 30, 100];
// States run 1 to ~1,200 (California) and most sit at 25-100, which the country breaks
// would paint all one dark shade. One scale for both views, as on the world map.
export const STATE_BREAKS = [1, 10, 25, 50, 150];
export function binOf(n, breaks = BREAKS) {
  if (!(n >= 1)) return -1;
  let b = 0;
  for (let i = 0; i < breaks.length; i++) if (n >= breaks[i]) b = i;
  return b;
}
export function binLabel(i, breaks = BREAKS) {
  const lo = breaks[i], hi = breaks[i + 1];
  if (hi == null) return `${lo}+`;
  return hi - 1 === lo ? `${lo}` : `${lo}–${hi - 1}`;
}

// Case- and accent-insensitive: "jose" finds "José", "sao paulo" finds "São Paulo".
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();

/* Everyone matching a country (null = everywhere), a US state (only with the US chosen)
 * and a free-text query over name, description and birthplace. Every word of the query
 * must match somewhere. */
export function filterPeople(people, { country = null, st = null, q = '' } = {}) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (country !== US) st = null;
  return people.filter((p) => {
    if (country && !p[P.CS].includes(country)) return false;
    if (st && !(p[P.ST] || []).includes(st)) return false;
    if (!words.length) return true;
    const hay = fold(`${p[P.NAME]} ${p[P.DESC]} ${p[P.PLACE]}`);
    return words.every((w) => hay.includes(w));
  });
}

// Unknown birth years always sort last, whichever direction is asked for.
export function sortPeople(list, mode = 'old') {
  const byName = (a, b) => fold(a[P.NAME]).localeCompare(fold(b[P.NAME])) || (a[P.Q] < b[P.Q] ? -1 : 1);
  const out = [...list];
  if (mode === 'az') return out.sort(byName);
  const dir = mode === 'new' ? -1 : 1;
  return out.sort((a, b) => {
    const ya = a[P.BORN], yb = b[P.BORN];
    if (ya == null && yb == null) return byName(a, b);
    if (ya == null) return 1;
    if (yb == null) return -1;
    return (ya - yb) * dir || byName(a, b);
  });
}

export const personUrl = (u) => (u.startsWith('w:') ? `https://en.wikipedia.org/wiki/${u.slice(2)}` : u);
export const isWikipedia = (u) => u.startsWith('w:');

// Where to put a marker for a country too small for the 110m map (Singapore, Malta):
// the mean of its people's birthplaces. Null if none of them has a point.
export function centroid(people, country) {
  let sx = 0, sy = 0, n = 0;
  for (const p of people) {
    if (p[P.X] == null || !p[P.CS].includes(country)) continue;
    sx += p[P.X]; sy += p[P.Y]; n++;
  }
  return n ? [sx / n, sy / n] : null;
}

/* Two views of the map: who studied at Stanford (P69) and who worked there (P108). Each
 * data file carries the other view's counts as `alt`, so a country can be compared across
 * views without loading both files. */
export const VIEWS = ['studied', 'worked'];
export const otherView = (v) => (v === 'worked' ? 'studied' : 'worked');

// "5.5%"; a non-zero share too small for one decimal says so rather than printing 0.0%.
export function pct(n, total) {
  if (!total || !n) return '0%';
  const x = (100 * n) / total;
  return x < 0.05 ? '<0.1%' : `${x.toFixed(1)}%`;
}

/* Countries whose share of this view beats their share of the other one, biggest ratio
 * first. `min` people in this view keeps 2-against-1 noise out of the headline; a country
 * the other view has nobody from ranks first, as `ratio: Infinity`. */
export function overRepresented(doc, opts) {
  return rankOver(doc.countries, doc.people.length, doc.alt.n, doc.alt.people, opts);
}
/* The same within the US: a state's share of the US-born in this view against its share
 * in the other. `names` is QID -> name, from us-states.json. */
export function overRepresentedStates(doc, names, opts) {
  const items = Object.entries(doc.states.n).map(([q, n]) => ({ q, n, name: names.get(q) || q }));
  return rankOver(items, doc.states.us, doc.alt.states.n, doc.alt.states.us, opts);
}
function rankOver(items, total, altN, altTotal, { min = 10, top = 5 } = {}) {
  const out = [];
  for (const c of items) {
    if (c.n < min) continue;
    const there = altN[c.q] || 0;
    const ratio = there ? (c.n / total) / (there / altTotal) : Infinity;
    if (ratio > 1) out.push({ q: c.q, name: c.name, n: c.n, there, ratio });
  }
  out.sort((a, b) => b.ratio - a.ratio || b.n - a.n || (a.name < b.name ? -1 : 1));
  return out.slice(0, top);
}
export const ratioLabel = (r, other = 'studied') => (r === Infinity ? `none who ${other} here` : `${r.toFixed(1)}×`);

/* "Born near": a typed hometown -> a point -> everyone born within a radius of it.
 * near.json (build.py) is [name, cc, admin1 index, lat, lon, ascii?] per place, most
 * populous first, plus born: QID -> [lat, lon]. The country search above matches a
 * birthplace's label, so a town nobody was born in exactly finds no one; measured
 * 2026-10-26, 30 km finds a median of 3 people where the label finds 1. */
export const RADII = [25, 50, 100, 200];
export const DEFAULT_KM = 50;
export const N = { NAME: 0, CC: 1, A1: 2, LAT: 3, LON: 4, ASCII: 5 };

export function distKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

// US postal codes, so "springfield, il" works the way Americans write it.
const USPS = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'Washington, D.C.', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii',
  ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };

let regions = null;
export function countryName(cc) {
  if (!cc) return '';
  try { regions ||= new Intl.DisplayNames(['en'], { type: 'region' }); return regions.of(cc) || cc; }
  catch { return cc; }
}

// "Springfield, Illinois, United States"; a birthplace GeoNames could not place is its name.
export function placeLabel(nd, pl) {
  return [pl[N.NAME], nd.a1[pl[N.A1]] || '', countryName(pl[N.CC])].filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i).join(', ');
}

// Folded names, built once per near.json: 70k folds per keystroke would be felt on a phone.
const folded = new WeakMap();
function index(nd) {
  let ix = folded.get(nd);
  if (!ix) {
    ix = { name: nd.places.map((p) => fold(p[N.NAME])), ascii: nd.places.map((p) => fold(p[N.ASCII] || '')),
      a1: nd.a1.map(fold) };
    folded.set(nd, ix);
  }
  return ix;
}

/* Places for a typed hometown, best first: exact names before prefixes, then by size
 * (the file's order). "town, region" narrows by admin1 name, US postal code, country code
 * or country name, each matched as a prefix after folding. */
export function matchPlaces(nd, q, limit = 8) {
  const [rawName, ...rest] = String(q ?? '').split(',');
  const n = fold(rawName).trim().replace(/\s+/g, ' ');
  const r = fold(rest.join(',')).trim().replace(/\s+/g, ' ');
  if (!n) return [];
  // Some names have a comma of their own ("Washington, D.C."): the whole query as a name
  // counts as exact too.
  const whole = r ? fold(String(q)).trim().replace(/\s+/g, ' ') : null;
  const ix = index(nd);
  const qual = (i) => {
    if (!r) return true;
    const pl = nd.places[i];
    const a1 = ix.a1[pl[N.A1]];
    const cc = (pl[N.CC] || '').toLowerCase();
    const us = cc === 'us' && USPS[r.replace(/\./g, '').toUpperCase()];
    return (a1 && a1.startsWith(r)) || cc === r || fold(countryName(pl[N.CC])).startsWith(r)
      || (us && fold(us) === a1) || (r === 'usa' && cc === 'us') || (r === 'uk' && cc === 'gb');
  };
  const exact = [], pre = [];
  for (let i = 0; i < nd.places.length; i++) {
    const a = ix.name[i], b = ix.ascii[i];
    if (whole && (a === whole || b === whole)) exact.push(i);
    else if (a === n || b === n) { if (qual(i)) exact.push(i); }
    else if (pre.length < 2 * limit && (a.startsWith(n) || (b && b.startsWith(n))) && qual(i)) pre.push(i);
  }
  // Two entries can read the same (São Paulo the city, and a birthplace Wikidata puts at
  // the state's centre). A picker cannot tell them apart, so the bigger one stands for both.
  const out = [], seen = new Set();
  for (const i of [...exact, ...pre]) {
    const l = fold(placeLabel(nd, nd.places[i]));
    if (seen.has(l)) continue;
    seen.add(l); out.push(nd.places[i]);
    if (out.length === limit) break;
  }
  return out;
}

// A label from the URL back to its place: the label must match one exactly, or nothing.
export function placeByLabel(nd, label) {
  const want = fold(label).trim();
  if (!want) return null;
  // Only the town part is searched: the rest of a label ("Illinois, United States") is
  // not a qualifier matchPlaces understands, and the full label is compared after.
  for (const pl of matchPlaces(nd, want.split(',')[0], 1000)) if (fold(placeLabel(nd, pl)) === want) return pl;
  return null;
}

/* Everyone in `people` born within `km` of [lat, lon], nearest first (then by name), as
 * { p, d }. Someone with no birth point is never near anything. */
export function nearPeople(people, born, at, km) {
  const out = [];
  for (const p of people) {
    const b = born[p[P.Q]];
    if (!b) continue;
    const d = distKm(at[0], at[1], b[0], b[1]);
    if (d <= km) out.push({ p, d });
  }
  return out.sort((a, b) => a.d - b.d || fold(a.p[P.NAME]).localeCompare(fold(b.p[P.NAME])) || (a.p[P.Q] < b.p[P.Q] ? -1 : 1));
}

// The one nearest person, for "nobody within 50 km; the closest is 140 km away".
export function nearest(people, born, at) {
  let best = null;
  for (const p of people) {
    const b = born[p[P.Q]];
    if (!b) continue;
    const d = distKm(at[0], at[1], b[0], b[1]);
    if (!best || d < best.d) best = { p, d };
  }
  return best;
}

export const kmLabel = (d) => (d < 1 ? 'under 1 km' : `${Math.round(d)} km`);

// The page's Equal Earth projection (build.py's project()), so the chosen hometown can be
// marked on the map. Same constants, same 960-wide canvas.
export function project(lon, lat) {
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  const XMAX = 2.70663, YMAX = 1.31731, W = 960;
  const l = (lon * Math.PI) / 180, t = Math.asin(M * Math.sin((lat * Math.PI) / 180));
  const t2 = t * t, t6 = t2 * t2 * t2;
  const x = (l * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  const s = W / (2 * XMAX);
  return [(x + XMAX) * s, (YMAX - y) * s];
}

// ?v=worked&c=Q30&s=Q99&q=physicist&sort=new&near=Lagos, Lagos, Nigeria&km=100. Unknown
// values fall back rather than throw; a state is kept only under the US, and a hometown
// replaces any country (the page never shows both).
const SORTS = ['old', 'new', 'az'];
export function encodeState({ view, country, st, q, sort, near, km }) {
  const p = new URLSearchParams();
  if (view === 'worked') p.set('v', 'worked');
  if (near) {
    p.set('near', near.label);
    if (km && km !== DEFAULT_KM) p.set('km', String(km));
  } else {
    if (country) p.set('c', country);
    if (st && country === US) p.set('s', st);
  }
  if (q && q.trim()) p.set('q', q.trim());
  if (sort && sort !== 'old') p.set('sort', sort);
  const s = p.toString();
  return s ? `?${s}` : '';
}
export function decodeState(search, knownCountries, knownStates = new Set()) {
  const p = new URLSearchParams(search || '');
  const c = p.get('c');
  const s = p.get('s');
  const sort = p.get('sort');
  const nearLabel = (p.get('near') || '').slice(0, 120).trim();
  const km = Number(p.get('km'));
  const country = !nearLabel && c && knownCountries.has(c) ? c : null;
  return {
    view: p.get('v') === 'worked' ? 'worked' : 'studied',
    country,
    st: country === US && s && knownStates.has(s) ? s : null,
    q: (p.get('q') || '').slice(0, 80),
    sort: SORTS.includes(sort) ? sort : 'old',
    nearLabel,
    km: RADII.includes(km) ? km : DEFAULT_KM,
  };
}

export function lifeLine(p) {
  const bits = [];
  if (p[P.BORN] != null) bits.push(`b. ${p[P.BORN]}`);
  if (p[P.PLACE]) bits.push(p[P.PLACE]);
  return bits.join(' · ');
}
