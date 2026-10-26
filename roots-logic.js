/* Pure logic for Stanford Roots: bins, search, sorting, URL state. No DOM, so node can
 * test it (site/roots-logic.test.mjs). A person is the array build.py writes:
 *   [qid, name, description, bornYear|null, birthplace, [countryQid...], x|null, y|null, url]
 */
export const P = { Q: 0, NAME: 1, DESC: 2, BORN: 3, PLACE: 4, CS: 5, X: 6, Y: 7, URL: 8 };

// Class breaks for the map. Counts run from 1 to ~3,800 (the US), so they are log-ish:
// a linear scale would paint the US dark and every other country the same pale shade.
export const BREAKS = [1, 3, 10, 30, 100];
export function binOf(n) {
  if (!(n >= 1)) return -1;
  let b = 0;
  for (let i = 0; i < BREAKS.length; i++) if (n >= BREAKS[i]) b = i;
  return b;
}
export function binLabel(i) {
  const lo = BREAKS[i], hi = BREAKS[i + 1];
  if (hi == null) return `${lo}+`;
  return hi - 1 === lo ? `${lo}` : `${lo}–${hi - 1}`;
}

// Case- and accent-insensitive: "jose" finds "José", "sao paulo" finds "São Paulo".
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();

/* Everyone matching a country (null = everywhere) and a free-text query over name,
 * description and birthplace. Every word of the query must match somewhere. */
export function filterPeople(people, { country = null, q = '' } = {}) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return people.filter((p) => {
    if (country && !p[P.CS].includes(country)) return false;
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

// ?c=Q668&q=physicist&sort=new. Unknown values fall back rather than throw.
const SORTS = ['old', 'new', 'az'];
export function encodeState({ country, q, sort }) {
  const p = new URLSearchParams();
  if (country) p.set('c', country);
  if (q && q.trim()) p.set('q', q.trim());
  if (sort && sort !== 'old') p.set('sort', sort);
  const s = p.toString();
  return s ? `?${s}` : '';
}
export function decodeState(search, knownCountries) {
  const p = new URLSearchParams(search || '');
  const c = p.get('c');
  const sort = p.get('sort');
  return {
    country: c && knownCountries.has(c) ? c : null,
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
