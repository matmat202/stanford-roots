/* Pure logic for "Born elsewhere": roots.json -> numbers for the prose and per-chapter
 * particle slots. No DOM, no GL, so node can test it (test/story.test.mjs).
 *
 * One particle is one person, in the same slot in every chapter, so each dot that flies
 * from a birthplace to a column is that person. A layout is N slots of
 * [x, y, colour, alpha] in plot space: x, y in 0..1, y up. */

export const US = 'Q30';

// A person row in roots.json: [qid, name, desc, born, place, countries, x, y, url, states, sitelinks]
export const born = (p) => p[3];
export const abroad = (p) => p[5].length > 0 && !p[5].includes(US);

/* Sports careers, read from the one-line Wikidata description. Crude on purpose and
 * pinned by test: it decides the chapter's claim, so what it catches must be checkable. */
const SPORT = /\b(player|swimmer|athlete|rower|runner|golfer|tennis|volleyball|water polo|soccer|basketball|baseball|football|fencer|olympi|gymnast|coach|cyclist|triathlete|diver|sprinter|hurdler|jumper|thrower|skier|wrestler|boxer|athletics|softball|lacrosse|hockey|quarterback|linebacker|climber|martial artist)/i;
const NOT_SPORT = /\b(chess|poker|video game|bridge player|go player|esports)/i;
export const athlete = (p) => SPORT.test(p[2] || '') && !NOT_SPORT.test(p[2] || '');

/* Birth-year columns: the thin early decades pooled, the thin last ones pooled. */
export const BINS = [
  { lo: -Infinity, hi: 1900, label: 'before 1900', short: '<1900' },
  ...[1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980].map((y) => ({ lo: y, hi: y + 10, label: `${y}s`, short: `${y}s` })),
  { lo: 1990, hi: Infinity, label: '1990 and after', short: '1990+' },
];
export const binOf = (p) => (born(p) == null ? -1 : BINS.findIndex((b) => born(p) >= b.lo && born(p) < b.hi));
export const binByLabel = (label) => {
  const i = BINS.findIndex((b) => b.label === label || b.short === label);
  if (i < 0) throw new Error(`no bin ${label}`);
  return i;
};

/* Per bin: n, abroad, athletes, and abroad among non-athletes. */
export function bins(people) {
  const out = BINS.map((b) => ({ ...b, n: 0, abroad: 0, ath: 0, athUS: 0, na: 0, naAbroad: 0 }));
  for (const p of people) {
    const i = binOf(p);
    if (i < 0) continue;
    const b = out[i], a = abroad(p);
    b.n++; b.abroad += a;
    if (athlete(p)) { b.ath++; b.athUS += p[5].includes(US); } else { b.na++; b.naAbroad += a; }
  }
  return out;
}

export const share = (b) => (b.n ? b.abroad / b.n : 0);
export const shareNA = (b) => (b.na ? b.naAbroad / b.na : 0);
export const athShare = (b) => (b.n ? b.ath / b.n : 0);

/* Countries of birth for people born abroad in [lo, hi). Someone with two birth
 * countries counts once in each, as on the map. */
export function topCountries(people, lo, hi) {
  const c = new Map();
  let n = 0;
  for (const p of people) {
    if (born(p) == null || born(p) < lo || born(p) >= hi || !abroad(p)) continue;
    n++;
    for (const q of p[5]) c.set(q, (c.get(q) || 0) + 1);
  }
  return { n, ranked: [...c.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)) };
}

/* Colours are palette indices (story.js): 0 ink, 1 abroad, 2 US, 3 athlete, 5 grey. */
export const C = { ink: 0, abroad: 1, us: 2, ath: 3, grey: 5 };

const mulberry = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* The fitted map box inside a plot of aspect a = w/h, the way SVG's default
 * preserveAspectRatio ("xMidYMid meet") fits the viewBox — so the outlines drawn as SVG
 * and the dots drawn in GL land on each other. Returns x0, y0, w, h in plot fractions. */
export function mapBox(view, a) {
  const m = view[0] / view[1];
  return a > m ? { x0: (1 - m / a) / 2, y0: 0, w: m / a, h: 1 } : { x0: 0, y0: (1 - a / m) / 2, w: 1, h: a / m };
}

/* Everyone at their birthplace. `show(p)` -> false fades that person out where they
 * stand; `colour(p)` picks the palette entry. People with no point drop below the plot. */
export function map(people, view, a, { show = () => true, colour = (p) => (abroad(p) ? C.abroad : C.us) } = {}) {
  const box = mapBox(view, a), rnd = mulberry(3);
  const slots = new Float32Array(people.length * 4);
  let shown = 0;
  people.forEach((p, i) => {
    if (p[6] == null) { slots.set([rnd(), -0.05, C.grey, 0], i * 4); return; }
    const x = box.x0 + (p[6] / view[0]) * box.w;
    const y = 1 - (box.y0 + (p[7] / view[1]) * box.h);
    const s = show(p);
    shown += s;
    slots.set([x, y, colour(p), s ? 0.85 : 0], i * 4);
  });
  return { kind: 'map', slots, shown, box };
}

/* A free-floating field: the opening. */
export function field(people) {
  const rnd = mulberry(7), slots = new Float32Array(people.length * 4);
  people.forEach((_, i) => slots.set([rnd(), rnd() * 0.9 + 0.05, C.ink, 0.8], i * 4));
  return { kind: 'field', slots };
}

/* Unit columns by birth bin: one dot per person, stacked abroad-first from the baseline.
 *   stretch: each column fills the full height, so its abroad part reads as a share
 *   drop(p): true -> the person leaves the chart (falls out below it)
 *   colour(p): palette entry
 * The grid is `per` dots wide, chosen so a cell is as square as it can be in a plot of
 * aspect a while the tallest column fits. `cell` is a cell's width as a plot fraction. */
export function columns(people, a, { stretch = false, drop = () => false, colour = (p) => (abroad(p) ? C.abroad : C.us) } = {}) {
  const K = BINS.length, colW = 1 / K, barW = colW * 0.78, top = 0.9;
  const groups = BINS.map(() => []);
  people.forEach((p, i) => {
    const b = binOf(p);
    if (b >= 0 && !drop(p)) groups[b].push(i);
  });
  // stack order, bottom up: abroad non-athletes, abroad athletes, US athletes, US others —
  // so the athletes sit together on the abroad/US boundary when they are coloured in
  const rank = (p) => (abroad(p) ? (athlete(p) ? 1 : 0) : athlete(p) ? 2 : 3);
  for (const g of groups) g.sort((x, y) => rank(people[x]) - rank(people[y]) || x - y);
  const max = Math.max(...groups.map((g) => g.length));
  let per = 1, best = Infinity;
  for (let k = 1; k <= 60; k++) {
    const cw = (barW / k) * a, ch = top / Math.ceil(max / k); // both in plot-height units
    const off = Math.abs(Math.log(cw / ch));
    if (off < best) { best = off; per = k; }
  }
  const rowsMax = Math.ceil(max / per), dyCount = top / rowsMax;
  const slots = new Float32Array(people.length * 4), rnd = mulberry(5);
  const placed = new Set();
  groups.forEach((g, b) => {
    const rows = Math.ceil(g.length / per), dy = stretch ? top / rows : dyCount;
    const x0 = b * colW + (colW - barW) / 2;
    g.forEach((i, j) => {
      const r = Math.floor(j / per), c = j % per;
      slots.set([x0 + (c + 0.5) * (barW / per), (r + 0.5) * dy, colour(people[i]), 1], i * 4);
      placed.add(i);
    });
  });
  people.forEach((p, i) => {
    if (placed.has(i)) return;
    const b = binOf(p);
    const x = b >= 0 ? b * colW + colW / 2 + (rnd() - 0.5) * barW : rnd();
    slots.set([x, -0.06, colour(p), 0], i * 4);
  });
  return { kind: 'columns', slots, per, cell: barW / per, counts: groups.map((g) => g.length), stretch };
}
