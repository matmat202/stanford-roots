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
ok('sort does not mutate', people[0][1] === 'José Álvarez');

// --- urls, centroid, state ----------------------------------------------------------
eq('wikipedia shorthand expands', L.personUrl('w:Jawed_Karim'), 'https://en.wikipedia.org/wiki/Jawed_Karim');
eq('wikidata url passes through', L.personUrl('https://www.wikidata.org/wiki/Q1'), 'https://www.wikidata.org/wiki/Q1');
eq('centroid', L.centroid([mk('a', 'a', '', 1, '', ['X']), [...mk('b', 'b', '', 1, '', ['X']).slice(0, 6), 3, 5, 'w:b']], 'X'), [2, 3]);
eq('centroid ignores pointless people', L.centroid([[...mk('a', 'a', '', 1, '', ['X']).slice(0, 6), null, null, 'w:a']], 'X'), null);
const known = new Set(['Q30', 'Q668']);
eq('state encodes', L.encodeState({ country: 'Q668', q: ' physicist ', sort: 'new' }), '?c=Q668&q=physicist&sort=new');
eq('default state is empty', L.encodeState({ country: null, q: '', sort: 'old' }), '');
eq('state round-trips', L.decodeState(L.encodeState({ country: 'Q668', q: 'a b', sort: 'az' }), known), { view: 'studied', country: 'Q668', st: null, q: 'a b', sort: 'az' });
eq('worked view encodes first', L.encodeState({ view: 'worked', country: 'Q668', q: '', sort: 'old' }), '?v=worked&c=Q668');
eq('studied view is the default and stays out of the url', L.encodeState({ view: 'studied', country: null, q: '', sort: 'old' }), '');
eq('worked view round-trips', L.decodeState('?v=worked', known).view, 'worked');
eq('unknown view falls back', L.decodeState('?v=evil', known).view, 'studied');
eq('other view', [L.otherView('studied'), L.otherView('worked')], ['worked', 'studied']);
eq('unknown country ignored', L.decodeState('?c=Q999999', known).country, null);
eq('unknown sort falls back', L.decodeState('?sort=evil', known).sort, 'old');
eq('life line', L.lifeLine(people[0]), 'b. 1950 · São Paulo');
eq('life line without year', L.lifeLine(people[2]), 'Taipei');

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

console.log(`${fail ? 'FAILED' : 'ok'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
