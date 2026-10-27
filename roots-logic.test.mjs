// node site/roots-logic.test.mjs — the page's pure logic, plus the shipped data checked
// against the rules that read it. Exit 1 on any failure.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as L from './roots-logic.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// --- bins ---------------------------------------------------------------------------
eq('0 has no bin', L.binOf(0), -1);
eq('1 is the first bin', L.binOf(1), 0);
eq('2 is still the first bin', L.binOf(2), 0);
eq('3 opens the second', L.binOf(3), 1);
eq('99 is in 30-99', L.binOf(99), 3);
eq('100 opens the top bin', L.binOf(100), 4);
eq('3800 is the top bin', L.binOf(3800), 4);
eq('bin labels', [0, 1, 2, 3, 4].map((i) => L.binLabel(i)), ['1–2', '3–9', '10–29', '30–99', '100+']);
eq('state bins', [0, 9, 10, 49, 50, 149, 150, 1204].map((n) => L.binOf(n, L.STATE_BREAKS)), [-1, 0, 1, 2, 3, 3, 4, 4]);
eq('state bin labels', [0, 1, 2, 3, 4].map((i) => L.binLabel(i, L.STATE_BREAKS)), ['1–9', '10–24', '25–49', '50–149', '150+']);

// --- search -------------------------------------------------------------------------
const mk = (q, name, desc, born, place, cs) => [q, name, desc, born, place, cs, 1, 1, 'w:' + name];
const people = [
  mk('Q1', 'José Álvarez', 'Chilean physicist', 1950, 'São Paulo', ['Q155']),
  mk('Q2', 'Ann Lee', 'American physicist', 1920, 'Ohio City', ['Q30']),
  mk('Q3', 'Bo Chen', 'engineer', null, 'Taipei', ['Q865']),
  mk('Q4', 'Ana Cohen', 'economist', 1980, 'Jerusalem', ['Q801', 'Q219060']),
  mk('Q5', 'Zed Zane', 'physicist', 1950, 'Lyon', ['Q142']),
];
const names = (l) => l.map((p) => p[1]);
eq('accent-insensitive name', names(L.filterPeople(people, { q: 'jose alvarez' })), ['José Álvarez']);
eq('accent-insensitive place', names(L.filterPeople(people, { q: 'sao paulo' })), ['José Álvarez']);
eq('every word must match', names(L.filterPeople(people, { q: 'physicist chilean' })), ['José Álvarez']);
eq('words match across fields', names(L.filterPeople(people, { q: 'ohio physicist' })), ['Ann Lee']);
eq('country filter', names(L.filterPeople(people, { country: 'Q30' })), ['Ann Lee']);
eq('two-country person is in both', [L.filterPeople(people, { country: 'Q801' }).length, L.filterPeople(people, { country: 'Q219060' }).length], [1, 1]);
eq('country and query combine', names(L.filterPeople(people, { country: 'Q142', q: 'physicist' })), ['Zed Zane']);
eq('empty query is everyone', L.filterPeople(people, {}).length, 5);
eq('whitespace query is everyone', L.filterPeople(people, { q: '   ' }).length, 5);
eq('no match is empty, not everyone', L.filterPeople(people, { q: 'zzzz' }).length, 0);

// --- sort (5 items, deliberately out of order: a 2-element sort hides comparator bugs)
eq('oldest first, ties by name, unknown last', names(L.sortPeople(people, 'old')), ['Ann Lee', 'José Álvarez', 'Zed Zane', 'Ana Cohen', 'Bo Chen']);
eq('newest first, unknown still last', names(L.sortPeople(people, 'new')), ['Ana Cohen', 'José Álvarez', 'Zed Zane', 'Ann Lee', 'Bo Chen']);
eq('a-z ignores accents', names(L.sortPeople(people, 'az')), ['Ana Cohen', 'Ann Lee', 'Bo Chen', 'José Álvarez', 'Zed Zane']);
{ // Three namesakes born the same year, out of order: the QID breaks the tie, so the list is stable.
  const twins = ['Q3', 'Q1', 'Q2'].map((q) => [q, 'Al', '', 1900, '', [], 0, 0, '', []]);
  eq('namesakes order by QID, in every sort', ['old', 'new', 'az'].map((m) => L.sortPeople(twins, m).map((p) => p[0])), [['Q1', 'Q2', 'Q3'], ['Q1', 'Q2', 'Q3'], ['Q1', 'Q2', 'Q3']]);
  const undated = ['Q3', 'Q1', 'Q2'].map((q) => [q, 'Al', '', null, '', [], 0, 0, '', []]);
  eq('undated namesakes too', L.sortPeople(undated, 'old').map((p) => p[0]), ['Q1', 'Q2', 'Q3']);
}
eq('fold keeps a zero', L.fold(0), '0');
eq('a bin of one number says the number', [L.binLabel(0, [1, 2, 5]), L.binLabel(1, [1, 2, 5]), L.binLabel(2, [1, 2, 5])], ['1', '2–4', '5+']);
ok('sort does not mutate', people[0][1] === 'José Álvarez');

// --- urls, centroid, state ----------------------------------------------------------
eq('wikipedia shorthand expands', L.personUrl('w:Jawed_Karim'), 'https://en.wikipedia.org/wiki/Jawed_Karim');
eq('wikidata url passes through', L.personUrl('https://www.wikidata.org/wiki/Q1'), 'https://www.wikidata.org/wiki/Q1');
eq('centroid', L.centroid([mk('a', 'a', '', 1, '', ['X']), [...mk('b', 'b', '', 1, '', ['X']).slice(0, 6), 3, 5, 'w:b']], 'X'), [2, 3]);
eq('centroid ignores pointless people', L.centroid([[...mk('a', 'a', '', 1, '', ['X']).slice(0, 6), null, null, 'w:a']], 'X'), null);
const known = new Set(['Q30', 'Q668']);
eq('state encodes', L.encodeState({ country: 'Q668', q: ' physicist ', sort: 'new' }), '?c=Q668&q=physicist&sort=new');
eq('default state is empty', L.encodeState({ country: null, q: '', sort: 'old' }), '');
eq('state round-trips', L.decodeState(L.encodeState({ country: 'Q668', q: 'a b', sort: 'az' }), known), { view: 'studied', country: 'Q668', st: null, q: 'a b', sort: 'az', nearLabel: '', km: 50 });
eq('worked view encodes first', L.encodeState({ view: 'worked', country: 'Q668', q: '', sort: 'old' }), '?v=worked&c=Q668');
eq('studied view is the default and stays out of the url', L.encodeState({ view: 'studied', country: null, q: '', sort: 'old' }), '');
eq('worked view round-trips', L.decodeState('?v=worked', known).view, 'worked');
eq('unknown view falls back', L.decodeState('?v=evil', known).view, 'studied');
eq('other view', [L.otherView('studied'), L.otherView('worked')], ['worked', 'studied']);
eq('unknown country ignored', L.decodeState('?c=Q999999', known).country, null);
eq('unknown sort falls back', L.decodeState('?sort=evil', known).sort, 'old');
eq('life line', L.lifeLine(people[0]), 'b. 1950 · São Paulo');
eq('life line without year', L.lifeLine(people[2]), 'Taipei');

// --- born near (a synthetic gazetteer, out of order where order matters) -----------
{
  const nd = { a1: ['', 'Illinois', 'Massachusetts', 'Missouri', 'Lagos'], places: [
    ['Lagos', 'NG', 4, 6.45, 3.39],
    ['Springfield', 'US', 3, 37.22, -93.3],
    ['Springfield', 'US', 2, 42.1, -72.59],
    ['Springfield', 'US', 1, 39.8, -89.64],
    ['Springdale', 'US', 3, 36.19, -94.13],
    ['São Paulo', 'BR', 0, -23.55, -46.64, 'Sao Paulo'],
    ['Lagos', 'PT', 0, 37.1, -8.67],
  ] };
  const lab = (l) => l.map((pl) => L.placeLabel(nd, pl));
  eq('exact names first, in file order (biggest first)', lab(L.matchPlaces(nd, 'springfield')).slice(0, 3),
    ['Springfield, Missouri, United States', 'Springfield, Massachusetts, United States', 'Springfield, Illinois, United States']);
  eq('a prefix comes after every exact match', lab(L.matchPlaces(nd, 'spring')).at(-1), 'Springdale, Missouri, United States');
  eq('"town, ST" narrows by postal code', lab(L.matchPlaces(nd, 'springfield, il')), ['Springfield, Illinois, United States']);
  eq('"town, state" narrows by admin1 prefix', lab(L.matchPlaces(nd, 'Springfield, mass')), ['Springfield, Massachusetts, United States']);
  eq('"town, country" narrows by country name', lab(L.matchPlaces(nd, 'lagos, portugal')), ['Lagos, Portugal']);
  eq('"town, cc" narrows by country code, and a region named like its town is said once', lab(L.matchPlaces(nd, 'lagos, ng')), ['Lagos, Nigeria']);
  eq('accents fold, and the ascii name matches', [lab(L.matchPlaces(nd, 'sao paulo')), lab(L.matchPlaces(nd, 'SÃO'))], [['São Paulo, Brazil'], ['São Paulo, Brazil']]);
  const dc = { a1: ['', 'Washington, D.C.'], places: [['Washington, D.C.', 'US', 0, 38.9, -77.04], ['Washington', 'US', 1, 38.9, -77.03]] };
  const labDc = (l) => l.map((pl) => L.placeLabel(dc, pl));
  eq('a name with its own comma is typed whole', labDc(L.matchPlaces(dc, 'washington, d.c.'))[0], 'Washington, D.C., United States');
  eq('"DC" and "D.C." are the same postal code', labDc(L.matchPlaces(dc, 'washington, dc')), ['Washington, Washington, D.C., United States']);
  eq('nothing typed is nothing', L.matchPlaces(nd, '  '), []);
  eq('"town, usa" means the US', lab(L.matchPlaces(nd, 'springfield, usa')).length, 3);
  const gb = { a1: ['', 'Ontario', 'England'], places: [['London', 'CA', 1, 42.98, -81.25], ['London', 'GB', 2, 51.5, -0.13]] };
  eq('"town, uk" means Great Britain', L.matchPlaces(gb, 'london, uk').map((pl) => L.placeLabel(gb, pl)), ['London, England, United Kingdom']);
  eq('a region nothing has finds nothing', L.matchPlaces(gb, 'london, narnia'), []);
  // ø does not fold apart, so "tromso" matches Tromsø only by its ascii name, and must still
  // rank as an exact match ahead of a bigger place it merely prefixes.
  const no = { a1: [''], places: [['Tromsøya', 'NO', 0, 69.66, 18.94, 'Tromsoya'], ['Tromsø', 'NO', 0, 69.65, 18.96, 'Tromso']] };
  eq('an exact ascii name is an exact match', L.matchPlaces(no, 'tromso').map((pl) => pl[0]), ['Tromsø', 'Tromsøya']);
  eq('a label round-trips to its place', L.placeByLabel(nd, 'Springfield, Illinois, United States')?.[3], 39.8);
  eq('an unknown label is no place', L.placeByLabel(nd, 'Springfield, Narnia'), null);
  const born = { Q1: [37.5, -122.2], Q2: [37.44, -122.14], Q3: [38.58, -121.49], Q4: [37.77, -122.42] };
  const ps = [mk('Q1', 'Cy', '', 1, '', []), mk('Q2', 'Al', '', 1, '', []), mk('Q3', 'Bo', '', 1, '', []), mk('Q4', 'Di', '', 1, '', []), mk('Q9', 'No', '', 1, '', [])];
  const pa = [37.44, -122.14];
  eq('near: within the radius, nearest first, no point means never near', L.nearPeople(ps, born, pa, 50).map((x) => x.p[1]), ['Al', 'Cy', 'Di']);
  eq('near: a wider radius reaches further', L.nearPeople(ps, born, pa, 200).length, 4);
  eq('nearest outside any radius', L.nearest(ps, born, [30, -122])?.p[1], 'Al');
  const same = [['Q1', 'Bo'], ['Q3', 'Al'], ['Q2', 'Al']].map(([q, n]) => mk(q, n, '', 1, '', []));
  const sameBorn = { Q1: [10, 10], Q2: [10, 10], Q3: [10, 10] };
  eq('near: one birthplace orders by name, then QID', L.nearPeople(same, sameBorn, [10, 10], 1).map((x) => x.p[0]), ['Q2', 'Q3', 'Q1']);
  eq('nearest breaks a tie the way the list does', L.nearest(same, sameBorn, [20, 20])?.p[0], 'Q2');
  eq('the default radius is one the page offers', L.RADII.includes(L.DEFAULT_KM), true);
  eq('nearest to a birth point is who was born there', L.nearest(ps, born, [37.77, -122.42])?.p[1], 'Di');
  ok('distance: Palo Alto to SF is ~45 km', Math.abs(L.distKm(37.44, -122.14, 37.77, -122.42) - 44.5) < 2, L.distKm(37.44, -122.14, 37.77, -122.42));
  // On a sphere of the mean Earth radius, 6,371 km: a degree of latitude is 111.195 km,
  // and the far side of the globe is half its circumference.
  eq('distance: a degree, and the antipode', [L.distKm(10, 20, 11, 20), L.distKm(0, 0, 0, 180)].map((v) => +v.toFixed(3)), [111.195, 20015.087]);
  eq('km labels at 1 km', [L.kmLabel(0.99), L.kmLabel(1)], ['under 1 km', '1 km']);
  eq('near: the radius itself is in', L.nearPeople(ps, born, born[ps[0][0]], 0).length >= 1, true);
  eq('km labels', [L.kmLabel(0.3), L.kmLabel(44.6)], ['under 1 km', '45 km']);
  eq('near encodes and replaces the country', L.encodeState({ country: 'Q30', st: 'Q99', near: { label: 'Lagos, Portugal' }, km: 100, q: '', sort: 'old' }), '?near=Lagos%2C+Portugal&km=100');
  eq('default radius stays out of the url', L.encodeState({ near: { label: 'X' }, km: 50 }), '?near=X');
  const dn = L.decodeState('?c=Q668&near=Lagos%2C+Portugal&km=100', known);
  eq('near decodes and wins over a country', [dn.nearLabel, dn.km, dn.country], ['Lagos, Portugal', 100, null]);
  eq('an unoffered radius falls back', L.decodeState('?near=X&km=7', known).km, 50);
  eq('every offered radius decodes', [25, 50, 100, 200].map((k) => L.decodeState(`?near=X&km=${k}`, known).km), [25, 50, 100, 200]);
  eq('typed text is cut: a hometown at 120, a search at 80', [L.decodeState('?near=' + 'n'.repeat(130), known).nearLabel.length, L.decodeState('?q=' + 'q'.repeat(90), known).q.length], [120, 80]);
  const [x, y] = L.project(0, 0);
  eq('projection centre is the canvas centre', [Math.round(x), Math.round(y)], [480, 234]);
  // Equal Earth's published extents (Šavrič, Patterson & Jenny 2018): x 2.70663 at ±180°,
  // y 1.31731 at the poles, on a 960-wide canvas.
  eq('projection edges are the canvas edges', [L.project(180, 0)[0], L.project(-180, 0)[0], L.project(0, 90)[1], L.project(0, -90)[1]].map((v) => +v.toFixed(1)),
    [960, 0, 0, +(960 * 1.31731 / 2.70663).toFixed(1)]); // YMAX is published to 5 places: the pole is 0.009 px off
}

// --- US states (four people, out of order; one with two states, one US-born with none)
{
  const ps = [
    [...mk('S1', 'Cal One', '', 1950, 'Fresno', ['Q30']), 'w:a', ['Q99']].filter((_, i) => i !== 8),
    [...mk('S2', 'Two State', '', 1900, 'Navajo Nation', ['Q30']), 'w:b', ['Q1588', 'Q829']].filter((_, i) => i !== 8),
    [...mk('S3', 'No State', '', 1960, 'United States', ['Q30']), 'w:c', []].filter((_, i) => i !== 8),
    [...mk('S4', 'Abroad', '', 1970, 'Lyon', ['Q142']), 'w:d', []].filter((_, i) => i !== 8),
  ];
  eq('state field sits at P.ST', ps.map((p) => p[L.P.ST]), [['Q99'], ['Q1588', 'Q829'], [], []]);
  eq('state filter', names(L.filterPeople(ps, { country: 'Q30', st: 'Q99' })), ['Cal One']);
  eq('a person in two states is in both', [L.filterPeople(ps, { country: 'Q30', st: 'Q1588' }).length, L.filterPeople(ps, { country: 'Q30', st: 'Q829' }).length], [1, 1]);
  eq('a state without the US is ignored', L.filterPeople(ps, { country: 'Q142', st: 'Q99' }).length, 1);
  eq('state and query combine', L.filterPeople(ps, { country: 'Q30', st: 'Q99', q: 'two' }).length, 0);
  const ks = new Set(['Q99']);
  eq('state encodes under the US', L.encodeState({ country: 'Q30', st: 'Q99', q: '', sort: 'old' }), '?c=Q30&s=Q99');
  eq('state dropped without the US', L.encodeState({ country: 'Q668', st: 'Q99', q: '', sort: 'old' }), '?c=Q668');
  eq('state round-trips', L.decodeState('?c=Q30&s=Q99', known, ks).st, 'Q99');
  eq('unknown state ignored', L.decodeState('?c=Q30&s=Q1', known, ks).st, null);
  eq('state without the US ignored on decode', L.decodeState('?c=Q668&s=Q99', known, ks).st, null);
  const doc = { states: { us: 100, n: { CA: 40, NY: 10, TX: 30, WY: 3, ME: 12 } }, alt: { states: { us: 200, n: { CA: 20, NY: 60, TX: 40, WY: 1 } } } };
  const nm = new Map([['CA', 'California'], ['NY', 'New York'], ['TX', 'Texas'], ['ME', 'Maine']]);
  const o = L.overRepresentedStates(doc, nm);
  eq('states over-represented: ratio order, none-elsewhere first, under-min and under-1 dropped', o.map((x) => x.q), ['ME', 'CA', 'TX']);
  eq('state ratio is share of US-born over share', o[1].ratio, 4);
  eq('state names come from the outlines file', o[1].name, 'California');
}

// --- shares and over-representation (4 countries, out of order) -----------------------
eq('pct', [L.pct(98, 1789), L.pct(0, 10), L.pct(1, 5000), L.pct(5, 0)], ['5.5%', '0%', '<0.1%', '0%']);
eq('pct at the 0.05% edge', L.pct(1, 2000), '0.1%');
eq('pct of an eighth', L.pct(1, 8), '12.5%');
{
  const doc = {
    people: { length: 100 },
    countries: [{ q: 'US', name: 'US', n: 60 }, { q: 'DE', name: 'DE', n: 10 }, { q: 'AT', name: 'AT', n: 12 }, { q: 'XX', name: 'XX', n: 3 }, { q: 'NO', name: 'NO', n: 15 }],
    alt: { people: 1000, n: { US: 800, DE: 20, AT: 60, XX: 1 } },
  };
  const o = L.overRepresented(doc);
  eq('over-represented: ratio order, none-elsewhere first, under-min and under-1 dropped', o.map((x) => x.q), ['NO', 'DE', 'AT']);
  eq('ratio is share over share', o[1].ratio, 5);
  eq('ratio labels', [L.ratioLabel(Infinity, 'worked'), L.ratioLabel(2)], ['none who worked here', '2.0×']);
  eq('top cuts', L.overRepresented(doc, { top: 1 }).length, 1);
  eq('nobody there is an infinite ratio', o[0].ratio, Infinity);
  eq('exactly the same share is not over', L.overRepresented({ people: { length: 100 }, countries: [{ q: 'A', name: 'A', n: 10 }, { q: 'B', name: 'B', n: 11 }], alt: { people: 100, n: { A: 10, B: 10 } } }).map((x) => x.q), ['B']);
  eq('five at most by default', L.overRepresented({ people: { length: 100 },
    countries: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((q, i) => ({ q, name: q, n: 10 + i })), alt: { people: 100, n: { A: 10, B: 1, C: 1, D: 1, E: 1, F: 1, G: 1 } } }).map((x) => x.q),
    ['G', 'F', 'E', 'D', 'C']);
  eq('equal ratios: more people first, then by name', L.overRepresented({ people: { length: 100 },
    countries: [{ q: 'Z', name: 'Zed', n: 20 }, { q: 'Y', name: 'Bee', n: 10 }, { q: 'X', name: 'Ay', n: 10 }], alt: { people: 100, n: { Z: 10, Y: 5, X: 5 } } }).map((x) => x.q),
    ['Z', 'X', 'Y']);
  eq('under ten people is noise', L.overRepresented({ people: { length: 100 }, countries: [{ q: 'A', name: 'A', n: 9 }, { q: 'B', name: 'B', n: 10 }], alt: { people: 100, n: {} } }).map((x) => x.q), ['B']);
}

// --- the shipped data ---------------------------------------------------------------
const here = fileURLToPath(new URL('.', import.meta.url));
const D = JSON.parse(readFileSync(here + 'data/roots.json', 'utf8'));
const F = JSON.parse(readFileSync(here + 'data/faculty.json', 'utf8'));
ok('thousands of people', D.people.length > 4500, D.people.length);
ok('over 100 countries', D.countries.length > 100);
eq('counts.people matches the list', D.counts.people, D.people.length);
const byQ = new Map(D.countries.map((c) => [c.q, c]));
let sumOk = true;
for (const c of D.countries) if (L.filterPeople(D.people, { country: c.q }).length !== c.n) sumOk = false;
ok('every country count equals its people', sumOk);
ok('every person has at least one known country', D.people.every((p) => p[5].length >= 1 && p[5].every((c) => byQ.has(c))));
ok('every person has a name and a url', D.people.every((p) => p[1] && /^(w:|https:\/\/www\.wikidata\.org\/wiki\/Q)/.test(p[8])));
ok('ids are unique', new Set(D.people.map((p) => p[0])).size === D.people.length);
const [vw, vh] = D.view;
ok('points sit inside the map', D.people.every((p) => p[6] == null || (p[6] >= 0 && p[6] <= vw && p[7] >= 0 && p[7] <= vh)));
eq('US is the biggest', D.countries[0].name, 'United States');
ok('historical states folded: no Pahlavi/Qajar Iran, German Reich, Qing', !D.countries.some((c) => /Pahlavi|Qajar|German Reich|Qing|Ming|Ohio/.test(c.name)));
ok('Iran is on the map', byQ.get('Q794') && byQ.get('Q794').d);
ok('Singapore is listed though off the 110m map', byQ.get('Q334') && !byQ.get('Q334').d && L.centroid(D.people, 'Q334'));
// A projection check with a known city: Palo Alto must land in California, west of the
// map's middle and in the northern half.
{
  const pa = D.people.filter((p) => p[4] === 'Palo Alto' && p[6] != null)[0];
  ok('Palo Alto projects into western North America', pa && pa[6] > vw * 0.1 && pa[6] < vw * 0.3 && pa[7] < vh * 0.4, JSON.stringify(pa && [pa[6], pa[7]]));
  const tokyo = D.people.filter((p) => p[4] === 'Tokyo' && p[6] != null)[0];
  ok('Tokyo projects east of Palo Alto and into Asia', tokyo && tokyo[6] > vw * 0.8, JSON.stringify(tokyo && [tokyo[6], tokyo[7]]));
}
eq('every person links to Wikidata or Wikipedia', D.people.filter((p) => !/^(https:\/\/www\.wikidata\.org\/wiki\/Q\d+|w:.+)$/.test(p[L.P.URL])).length, 0);
ok('every mapped country path is a closed path', D.countries.every((c) => c.d == null || /^M[\d.,L-]+Z/.test(c.d)));

// --- US states in the shipped data -----------------------------------------------------
const U = JSON.parse(readFileSync(here + 'data/us-states.json', 'utf8'));
const stNames = new Map(U.states.map((s) => [s.q, s.name]));
eq('50 states and D.C. outlined', U.states.length, 51);
ok('every state outline is a closed path inside its box', U.states.every((s) => /^(M[\d.,L-]+Z)+$/.test(s.d)
  && s.d.match(/-?[\d.]+/g).every((v, i) => +v >= U.view[i % 2] && +v <= U.view[i % 2] + U.view[2 + (i % 2)])));
for (const [name, X] of [['studied', D], ['worked', F]]) {
  let stOk = true;
  for (const [q, n] of Object.entries(X.states.n)) if (L.filterPeople(X.people, { country: L.US, st: q }).length !== n) stOk = false;
  ok(`${name}: every state count equals its people`, stOk);
  ok(`${name}: every state is a known outline`, Object.keys(X.states.n).every((q) => stNames.has(q)));
  ok(`${name}: only people counted in the US have a state`, X.people.every((p) => !p[9].length || p[5].includes(L.US)));
  eq(`${name}: states.us is the US count`, X.states.us, X.countries.find((c) => c.q === L.US).n);
  eq(`${name}: with_state counts people with one`, X.states.with_state, X.people.filter((p) => p[9].length).length);
  // Measured 2026-10-26: 98.1% of the US-born studied, 97.4% worked. A refetch that drops
  // below 95% has lost the P131 walk, not found a lot of unplaced people.
  ok(`${name}: over 95% of the US-born have a state`, X.states.with_state / X.states.us > 0.95, X.states.with_state / X.states.us);
}
eq('each file carries the other file\'s state counts', [D.alt.states, F.alt.states], [F.states, D.states]);
{
  const pa = D.people.find((p) => p[4] === 'Palo Alto');
  eq('Palo Alto is in California', pa && pa[9], ['Q99']);
}
// The finding, measured 2026-10-26: California is a third of the US-born who studied
// here but a seventh of those who worked here; New York is the reverse.
ok('California is over-represented among the US-born who studied here', L.overRepresentedStates(D, stNames).some((x) => x.q === 'Q99'));
ok('New York is over-represented among the US-born who worked here', L.overRepresentedStates(F, stNames, { top: 20 }).some((x) => x.q === 'Q1384'));

// --- the worked-here view, and the cross-links between the two files -------------------
ok('worked view: over a thousand people', F.people.length > 1000, F.people.length);
eq('views are labelled', [D.view_name, F.view_name], ['studied', 'worked']);
eq('worked view counts.people matches the list', F.counts.people, F.people.length);
{
  let fOk = true;
  for (const c of F.countries) if (L.filterPeople(F.people, { country: c.q }).length !== c.n) fOk = false;
  ok('worked view: every country count equals its people', fOk);
}
eq('each file carries the other file\'s total', [D.alt.people, F.alt.people], [F.people.length, D.people.length]);
ok('each file carries the other file\'s counts exactly',
  F.countries.every((c) => D.alt.n[c.q] === c.n) && D.countries.every((c) => F.alt.n[c.q] === c.n)
  && Object.keys(D.alt.n).length === F.countries.length && Object.keys(F.alt.n).length === D.countries.length);
eq('both views share one map', F.view, D.view);
// The finding the view exists to show, measured 2026-10-26: those who worked here were
// born abroad far more often than those who studied here, Germany most of all.
ok('worked view is less American than the studied view', F.countries[0].n / F.people.length < D.countries[0].n / D.people.length - 0.1);
ok('Germany is over-represented among those who worked here', L.overRepresented(F).some((x) => x.q === 'Q183' && x.ratio > 2));

// --- the shipped gazetteer ------------------------------------------------------------
{
  const N = JSON.parse(readFileSync(here + 'data/near.json', 'utf8'));
  eq('near.json counts its places', N.counts.places, N.places.length);
  eq('near.json counts its birth points', N.counts.born, Object.keys(N.born).length);
  eq('eight places at most for a typed town', L.matchPlaces(N, 'san').length, 8);
  // "The nearest, 140 km away:" names one person; widen the radius to 140 km and the list
  // must start with that same person.
  const towns = N.places.filter((_, i) => i % 53 === 0);
  const disagree = towns.filter((pl) => { const at = [pl[L.N.LAT], pl[L.N.LON]], b = L.nearest(D.people, N.born, at);
    return b && L.nearPeople(D.people, N.born, at, b.d + 1e-9)[0].p !== b.p; }).length;
  eq(`shipped: the nearest is who the widened list starts with (${towns.length} towns)`, disagree, 0);
  // The hometown marker is drawn with the page's project(); everyone's dot was drawn by
  // build.py's (P.X, P.Y, to 0.1 px from birth points kept to 0.01°). They must agree, or the
  // marker sits beside the town's own dots. Measured 2026-10-27: 0.066 px at worst over 4,787.
  let worstPx = 0, both = 0;
  for (const p of D.people) {
    const b = N.born[p[L.P.Q]];
    if (!b || p[L.P.X] == null) continue;
    both++;
    const [x, y] = L.project(b[1], b[0]);
    worstPx = Math.max(worstPx, Math.abs(x - p[L.P.X]), Math.abs(y - p[L.P.Y]));
  }
  ok('the marker lands on build.py\'s dots (0.1 px, 4,000+ people)', both > 4000 && worstPx < 0.1, `${both} people, ${worstPx} px`);
  // Everyone drawn as a dot on the map has a birth point, and nobody else does.
  const dotted = new Set([...D.people, ...F.people].filter((p) => p[L.P.X] != null).map((p) => p[L.P.Q]));
  ok('a birth point only for people with a map dot, less the vague ones', dotted.size === N.counts.born + N.counts.vague && Object.keys(N.born).every((q) => dotted.has(q)), `${dotted.size} vs ${N.counts.born}+${N.counts.vague}`);
  // "Austria" and "California" are points at their middle: never near anything.
  const vagueQ = D.people.filter((p) => p[L.P.PLACE] === 'Austria' || p[L.P.PLACE] === 'California');
  ok('a whole country or state as birthplace has no birth point', vagueQ.length > 5 && vagueQ.every((p) => !N.born[p[L.P.Q]]), vagueQ.length);
  ok('Singapore (a city-state) keeps its birth points', D.people.some((p) => p[L.P.PLACE] === 'Singapore' && N.born[p[L.P.Q]]));
  // The point of shipping birthplaces in the gazetteer: every one of them can be typed,
  // and typing it finds the person born there.
  let miss = [], tried = 0;
  for (const p of D.people) {
    const b = N.born[p[L.P.Q]];
    if (!b || !p[L.P.PLACE] || /^Q\d+$/.test(p[L.P.PLACE]) || tried >= 400) continue;
    tried++;
    const hit = L.matchPlaces(N, p[L.P.PLACE], 1000).some((pl) => L.distKm(pl[L.N.LAT], pl[L.N.LON], b[0], b[1]) <= 25);
    if (!hit) miss.push(p[L.P.PLACE]);
  }
  ok('400 birthplace labels each find a place within 25 km of the birth point', tried === 400 && !miss.length, miss.slice(0, 5).join('; '));
  const pa = L.matchPlaces(N, 'palo alto')[0];
  eq('Palo Alto is in California', L.placeLabel(N, pa), 'Palo Alto, California, United States');
  ok('dozens were born within 25 km of Palo Alto', L.nearPeople(D.people, N.born, [pa[L.N.LAT], pa[L.N.LON]], 25).length > 30);
  const sf = L.matchPlaces(N, 'springfield, il');
  eq('"springfield, il" puts Illinois first', L.placeLabel(N, sf[0]), 'Springfield, Illinois, United States');
  eq('a real label round-trips', L.placeByLabel(N, L.placeLabel(N, sf[0])), sf[0]);
  // The measured claim the feature rests on (2026-10-26): a radius finds people a label
  // search does not. Lagos, Portugal-sized towns aside, a town nobody was born in by name
  // still has neighbours.
  const town = L.matchPlaces(N, 'menlo park, california')[0];
  const byLabel = L.filterPeople(D.people, { q: 'menlo park' }).length;
  const byRadius = L.nearPeople(D.people, N.born, [town[L.N.LAT], town[L.N.LON]], 25).length;
  ok('within 25 km of Menlo Park finds more than its label does', byRadius > byLabel * 3, `${byRadius} vs ${byLabel}`);
}

console.log(`${fail ? 'FAILED' : 'ok'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
