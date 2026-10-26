import {
  P, BREAKS, binOf, binLabel, filterPeople, sortPeople, personUrl, isWikipedia, centroid,
  encodeState, decodeState, lifeLine, otherView, pct, overRepresented, ratioLabel,
} from './roots-logic.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const PAGE = 60;
let D = null;
let byQ = new Map();
const cache = {};
const FILES = { studied: 'data/roots.json', worked: 'data/faculty.json' };
const VERB = { studied: 'studied', worked: 'worked' };
const state = { view: 'studied', country: null, q: '', sort: 'old', shown: PAGE };

const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const fmt = (n) => n.toLocaleString('en-US');

function drawMap() {
  const [w, h] = D.view;
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img',
    'aria-label': `World map shaded by how many people who ${VERB[state.view]} at Stanford were born in each country` });
  for (const c of D.empty) svg.append(el('path', { d: c.d, class: 'c e' }));
  const tiny = [];
  for (const c of D.countries) {
    if (c.d) {
      const p = el('path', { d: c.d, class: 'c', fill: `var(--b${binOf(c.n)})`, 'data-q': c.q });
      const t = el('title'); t.textContent = `${c.name}: ${fmt(c.n)}`; p.append(t);
      svg.append(p);
    } else {
      const at = centroid(D.people, c.q);
      if (at) tiny.push({ c, at });
    }
  }
  // Countries too small for the 110m outlines get a marker, or Singapore (24 people)
  // would be the one place on the list you could not find on the map.
  for (const { c, at } of tiny) {
    const m = el('circle', { cx: at[0].toFixed(1), cy: at[1].toFixed(1), r: 4, class: 'tiny', fill: `var(--b${binOf(c.n)})`, 'data-q': c.q });
    const t = el('title'); t.textContent = `${c.name}: ${fmt(c.n)}`; m.append(t);
    svg.append(m);
  }
  svg.append(el('g', { id: 'pts' }));
  svg.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]')?.dataset.q;
    if (q) select(state.country === q ? null : q);
  });
  svg.addEventListener('pointerover', (e) => {
    const q = e.target.closest('[data-q]')?.dataset.q;
    if (q) $('hover').textContent = compare(byQ.get(q));
  });
  svg.addEventListener('pointerleave', () => { $('hover').textContent = hoverDefault(); });
  $('map').replaceChildren(svg);

  const lg = $('legend');
  lg.replaceChildren();
  BREAKS.forEach((_, i) => {
    const k = document.createElement('span');
    k.className = 'k';
    k.innerHTML = `<span class="sw" style="background:var(--b${i})"></span>`;
    k.append(binLabel(i));
    lg.append(k);
  });
  const k = document.createElement('span');
  k.className = 'k';
  k.innerHTML = '<span class="sw" style="background:var(--none)"></span>';
  k.append('none recorded');
  lg.append(k);
  const kd = document.createElement('span');
  kd.className = 'k';
  kd.innerHTML = '<span class="dotk"></span>';
  kd.append('birthplaces in the chosen country');
  lg.append(kd);
}

// "Germany: 104 people · 5.9% of those who worked here, 1.7% of those who studied here"
function compare(c) {
  const there = D.alt.n[c.q] || 0;
  return `${c.name}: ${fmt(c.n)} ${c.n === 1 ? 'person' : 'people'} · ${pct(c.n, D.people.length)} of those who ` +
    `${VERB[state.view]} here, ${pct(there, D.alt.people)} of those who ${VERB[otherView(state.view)]} here`;
}

function drawContrast() {
  const o = overRepresented(D);
  const p = $('contrast');
  p.replaceChildren();
  if (!o.length) return;
  const b = document.createElement('b');
  b.textContent = `More common among those who ${VERB[state.view]} here than those who ${VERB[otherView(state.view)]} here: `;
  p.append(b);
  o.forEach((x, i) => {
    const a = document.createElement('button');
    a.type = 'button'; a.className = 'chip'; a.dataset.q = x.q;
    a.textContent = `${x.name} ${ratioLabel(x.ratio, VERB[otherView(state.view)])}`;
    a.title = compare(byQ.get(x.q));
    p.append(a);
    if (i < o.length - 1) p.append(' ');
  });
}

const hoverDefault = () => (state.country
  ? `Showing ${byQ.get(state.country).name}. Tap it again, or pick “Everywhere”, to clear.`
  : 'Tap a country.');

function drawSelection() {
  for (const n of document.querySelectorAll('#map [data-q]')) n.classList.toggle('sel', n.dataset.q === state.country);
  const g = document.getElementById('pts');
  g.replaceChildren();
  if (state.country) {
    const seen = new Set();
    for (const p of D.people) {
      if (p[P.X] == null || !p[P.CS].includes(state.country)) continue;
      const key = `${p[P.X]},${p[P.Y]}`;
      if (seen.has(key)) continue; // one dot per birthplace, not one per person
      seen.add(key);
      g.append(el('circle', { cx: p[P.X], cy: p[P.Y], r: 1.8, class: 'pt' }));
    }
    // Bring the selected outline above its neighbours so its stroke is not cut off.
    const sel = document.querySelector(`#map path[data-q="${state.country}"]`);
    if (sel) g.before(sel);
  }
  $('hover').textContent = hoverDefault();
}

function drawList() {
  const list = sortPeople(filterPeople(D.people, state), state.sort);
  const c = state.country && byQ.get(state.country);
  $('listTitle').textContent = c ? `Born in ${c.name}` : 'Born everywhere';
  $('listCount').textContent = `${fmt(list.length)} ${list.length === 1 ? 'person' : 'people'}`;
  const ol = $('people');
  ol.replaceChildren();
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = state.q ? `Nobody matches “${state.q}”${c ? ` in ${c.name}` : ''}.` : 'Nobody recorded.';
    ol.append(li);
  }
  for (const p of list.slice(0, state.shown)) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'nm'; a.href = personUrl(p[P.URL]); a.target = '_blank'; a.rel = 'noopener';
    a.textContent = p[P.NAME];
    const src = document.createElement('span');
    src.className = 'src'; src.textContent = isWikipedia(p[P.URL]) ? 'Wikipedia' : 'Wikidata';
    li.append(a, src);
    if (p[P.DESC]) { const d = document.createElement('div'); d.className = 'd'; d.textContent = p[P.DESC]; li.append(d); }
    const l = document.createElement('div'); l.className = 'l'; l.textContent = lifeLine(p); li.append(l);
    ol.append(li);
  }
  const more = $('more');
  more.hidden = list.length <= state.shown;
  more.textContent = `Show more (${fmt(list.length - state.shown)} left)`;
}

function sync() {
  history.replaceState(null, '', location.pathname + encodeState(state));
  $('country').value = state.country || '';
  $('sort').value = state.sort;
  if ($('q').value !== state.q) $('q').value = state.q;
}

function select(q) {
  state.country = q;
  state.shown = PAGE;
  sync(); drawSelection(); drawList();
}

function drawTable() {
  const t = document.createElement('table');
  t.innerHTML = `<tr><th>Country</th><th class="r">People</th><th class="r">Share</th>` +
    `<th class="r">Share of those who ${VERB[otherView(state.view)]} here</th><th>On the map</th></tr>`;
  for (const c of D.countries) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.textContent = c.name;
    const n = document.createElement('td'); n.className = 'r'; n.textContent = fmt(c.n);
    const s1 = document.createElement('td'); s1.className = 'r'; s1.textContent = pct(c.n, D.people.length);
    const s2 = document.createElement('td'); s2.className = 'r'; s2.textContent = pct(D.alt.n[c.q] || 0, D.alt.people);
    const m = document.createElement('td'); m.textContent = c.d ? 'outline' : 'marker or off-map';
    tr.append(td, n, s1, s2, m); t.append(tr);
  }
  $('table').replaceChildren(t);
}

function drawViewControls() {
  for (const b of document.querySelectorAll('#views button')) b.setAttribute('aria-pressed', String(b.dataset.v === state.view));
  const n = fmt(D.people.length);
  $('sub').textContent = state.view === 'worked'
    ? `Where ${n} people Wikidata lists as having worked at Stanford were born: ${D.countries.length} countries. ` +
      'Mostly professors and researchers, but coaches and administrators count too. Tap a country to meet them.'
    : `Where ${n} people Wikidata lists as educated at Stanford were born: ` +
      `${D.countries.length} countries. Tap one to meet everyone from it.`;
  const sel = $('country');
  sel.replaceChildren();
  const all = document.createElement('option'); all.value = ''; all.textContent = `Everywhere (${n})`;
  sel.append(all);
  for (const c of D.countries) {
    const o = document.createElement('option'); o.value = c.q; o.textContent = `${c.name} (${fmt(c.n)})`; sel.append(o);
  }
}

async function load(view) {
  cache[view] ||= fetch(FILES[view]).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  try { return await cache[view]; } catch (e) { delete cache[view]; throw e; }
}

// Swap the whole page to one view. A country the new view has nobody from is dropped
// rather than left selected on an empty list.
async function show(view) {
  let doc;
  try { doc = await load(view); }
  catch { $('sub').textContent = 'Could not load the data. Try reloading.'; return false; }
  D = doc; state.view = view;
  byQ = new Map(D.countries.map((c) => [c.q, c]));
  if (state.country && !byQ.has(state.country)) state.country = null;
  state.shown = PAGE;
  drawViewControls(); drawMap(); drawContrast(); drawTable(); sync(); drawSelection(); drawList();
  return true;
}

async function main() {
  // The country in the URL is checked against the view the URL names, so ?v=worked&c=...
  // keeps a country only that view has.
  const want = decodeState(location.search, new Set()).view;
  let doc;
  try { doc = await load(want); }
  catch { $('sub').textContent = 'Could not load the data. Try reloading.'; return; }
  Object.assign(state, decodeState(location.search, new Set(doc.countries.map((c) => c.q))));
  await show(want);
  const sel = $('country');
  $('views').addEventListener('click', (e) => {
    const v = e.target.closest('button[data-v]')?.dataset.v;
    if (v && v !== state.view) show(v);
  });
  $('contrast').addEventListener('click', (e) => {
    const q = e.target.closest('button[data-q]')?.dataset.q;
    if (q) select(q);
  });
  sel.addEventListener('change', () => select(sel.value || null));
  $('sort').addEventListener('change', () => { state.sort = $('sort').value; state.shown = PAGE; sync(); drawList(); });
  let t;
  $('q').addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = $('q').value.slice(0, 80); state.shown = PAGE; sync(); drawList(); }, 120);
  });
  $('more').addEventListener('click', () => { state.shown += PAGE * 2; drawList(); });
}

main();
