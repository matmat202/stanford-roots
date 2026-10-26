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

// ?v=worked&c=Q30&s=Q99&q=physicist&sort=new. Unknown values fall back rather than throw;
// a state is kept only under the US.
const SORTS = ['old', 'new', 'az'];
export function encodeState({ view, country, st, q, sort }) {
  const p = new URLSearchParams();
  if (view === 'worked') p.set('v', 'worked');
  if (country) p.set('c', country);
  if (st && country === US) p.set('s', st);
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
  const country = c && knownCountries.has(c) ? c : null;
  return {
    view: p.get('v') === 'worked' ? 'worked' : 'studied',
    country,
    st: country === US && s && knownStates.has(s) ? s : null,
    q: (p.get('q') || '').slice(0, 80),
    sort: SORTS.includes(sort) ? sort : 'old',
  };
}

export function lifeLine(p) {
  const bits = [];
  if (p[P.BORN] != null) bits.push(`b. ${p[P.BORN]}`);
  if (p[P.PLACE]) bits.push(p[P.PLACE]);
  return bits.join(' · ');
}
