import {
  P, BREAKS, binOf, binLabel, filterPeople, sortPeople, personUrl, isWikipedia, centroid,
  encodeState, decodeState, lifeLine, otherView, pct, overRepresented, ratioLabel,
  US, overRepresentedStates, STATE_BREAKS,
  RADII, DEFAULT_KM, N, matchPlaces, placeLabel, placeByLabel, nearPeople, nearest, kmLabel, project,
} from './roots-logic.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const PAGE = 60;
let D = null;
let byQ = new Map();
const cache = {};
const FILES = { studied: 'data/roots.json', worked: 'data/faculty.json' };
const VERB = { studied: 'studied', worked: 'worked' };
const state = { view: 'studied', country: null, st: null, q: '', sort: 'old', shown: PAGE, near: null, km: DEFAULT_KM };
// The "Born near" gazetteer (1.2 MB gzipped), fetched the first time anyone types a town.
let nearDoc = null;
let ND = null;
// US state outlines, fetched the first time anyone picks the US (108 KB nobody else pays).
let usGeo = null;
let stName = new Map();

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

const hoverDefault = () => (state.near
  ? `Showing everyone born within ${state.km} km of ${state.near.label}. Clear the box to go back.`
  : state.country
    ? `Showing ${byQ.get(state.country).name}. Tap it again, or pick “Everywhere”, to clear.`
    : 'Tap a country, or type a hometown below.');

function drawSelection() {
  for (const n of document.querySelectorAll('#map [data-q]')) n.classList.toggle('sel', n.dataset.q === state.country);
  const g = document.getElementById('pts');
  g.replaceChildren();
  if (state.country) {
    const seen = new Set();
    for (const p of D.people) {
      if (p[P.X] == null || !p[P.CS].includes(state.country)) continue;
      if (state.st && !(p[P.ST] || []).includes(state.st)) continue; // a state narrows the dots too
      const key = `${p[P.X]},${p[P.Y]}`;
      if (seen.has(key)) continue; // one dot per birthplace, not one per person
      seen.add(key);
      g.append(el('circle', { cx: p[P.X], cy: p[P.Y], r: 1.8, class: 'pt' }));
    }
    // Bring the selected outline above its neighbours so its stroke is not cut off.
    const sel = document.querySelector(`#map path[data-q="${state.country}"]`);
    if (sel) g.before(sel);
  } else if (state.near && ND) {
    const seen = new Set();
    for (const { p } of nearList()) {
      const b = ND.born[p[P.Q]];
      const key = `${b[0]},${b[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const [x, y] = project(b[1], b[0]);
      g.append(el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 1.8, class: 'pt' }));
    }
    const [hx, hy] = project(state.near.lon, state.near.lat);
    // The radius drawn to scale where it can be seen (200 km is ~6 px on this map).
    const rpx = Math.abs(project(state.near.lon, state.near.lat + state.km / 111.2)[1] - hy);
    if (rpx > 5) g.append(el('circle', { cx: hx.toFixed(1), cy: hy.toFixed(1), r: rpx.toFixed(1), class: 'ring' }));
    g.append(el('circle', { cx: hx.toFixed(1), cy: hy.toFixed(1), r: 4, class: 'home' }));
  }
  $('hover').textContent = hoverDefault();
}

// Everyone matching the search born within the radius, nearest first, as { p, d }.
function nearList() {
  return nearPeople(filterPeople(D.people, { q: state.q }), ND.born, [state.near.lat, state.near.lon], state.km);
}

function drawList() {
  if (state.near && ND) { drawNearList(); return; }
  $('sort').disabled = false;
  const list = sortPeople(filterPeople(D.people, state), state.sort);
  const c = state.country && byQ.get(state.country);
  const where = state.st ? stName.get(state.st) : c && c.name;
  $('listTitle').textContent = where ? `Born in ${where}` : 'Born everywhere';
  $('listCount').textContent = `${fmt(list.length)} ${list.length === 1 ? 'person' : 'people'}`;
  const ol = $('people');
  ol.replaceChildren();
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = state.q ? `Nobody matches “${state.q}”${where ? ` in ${where}` : ''}.` : 'Nobody recorded.';
    ol.append(li);
  }
  for (const p of list.slice(0, state.shown)) ol.append(personItem(p));
  const more = $('more');
  more.hidden = list.length <= state.shown;
  more.textContent = `Show more (${fmt(list.length - state.shown)} left)`;
}

function personItem(p, d = null) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.className = 'nm'; a.href = personUrl(p[P.URL]); a.target = '_blank'; a.rel = 'noopener';
  a.textContent = p[P.NAME];
  const src = document.createElement('span');
  src.className = 'src'; src.textContent = isWikipedia(p[P.URL]) ? 'Wikipedia' : 'Wikidata';
  li.append(a, src);
  if (p[P.DESC]) { const dv = document.createElement('div'); dv.className = 'd'; dv.textContent = p[P.DESC]; li.append(dv); }
  const l = document.createElement('div'); l.className = 'l'; l.textContent = lifeLine(p);
  if (d != null) { const k = document.createElement('span'); k.className = 'km'; k.textContent = ` · ${kmLabel(d)} away`; l.append(k); }
  li.append(l);
  return li;
}

// The list for a hometown: nearest first, so the sort menu sits out. Nobody in range
// still answers the question: the one person born nearest, however far.
function drawNearList() {
  $('sort').disabled = true;
  const list = nearList();
  $('listTitle').textContent = `Born within ${state.km} km of ${state.near.label}`;
  $('listCount').textContent = `${fmt(list.length)} ${list.length === 1 ? 'person' : 'people'}`;
  const ol = $('people');
  ol.replaceChildren();
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    const best = nearest(filterPeople(D.people, { q: state.q }), ND.born, [state.near.lat, state.near.lon]);
    li.textContent = `Nobody who ${VERB[state.view]} here${state.q ? ` and matches “${state.q}”` : ''} was born within ${state.km} km.` +
      (best ? ` The nearest, ${kmLabel(best.d)} away:` : '');
    ol.append(li);
    if (best) ol.append(personItem(best.p, best.d));
  }
  for (const { p, d } of list.slice(0, state.shown)) ol.append(personItem(p, d));
  const more = $('more');
  more.hidden = list.length <= state.shown;
  more.textContent = `Show more (${fmt(list.length - state.shown)} left)`;
}

function sync() {
  history.replaceState(null, '', location.pathname + encodeState(state));
  $('country').value = state.country || '';
  $('km').value = String(state.km);
  if (usGeo) $('state').value = state.st || '';
  $('sort').value = state.sort;
  if ($('q').value !== state.q) $('q').value = state.q;
}

function select(q) {
  if (q) clearNear();
  state.country = q;
  if (q !== US) state.st = null;
  state.shown = PAGE;
  sync(); drawSelection(); drawList(); drawUS();
}

function selectState(s) {
  state.st = s;
  state.shown = PAGE;
  sync(); drawSelection(); drawStateSelection(); drawList();
}

async function loadNear() {
  nearDoc ||= fetch('data/near.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  try { ND = await nearDoc; return ND; }
  catch (e) { nearDoc = null; throw e; }
}

function clearNear() {
  state.near = null;
  $('near').value = '';
  closeOpts();
}

function pickPlace(pl) {
  state.near = { label: placeLabel(ND, pl), lat: pl[N.LAT], lon: pl[N.LON] };
  state.country = null; state.st = null;
  state.shown = PAGE;
  $('near').value = state.near.label;
  closeOpts();
  sync(); drawSelection(); drawList(); drawUS();
}

let opts = [], active = -1;
function closeOpts() {
  opts = []; active = -1;
  $('nearList').hidden = true;
  $('near').setAttribute('aria-expanded', 'false');
  $('near').removeAttribute('aria-activedescendant');
}
function drawOpts() {
  const ul = $('nearList');
  ul.replaceChildren();
  opts.forEach((pl, i) => {
    const li = document.createElement('li');
    li.id = `opt${i}`; li.setAttribute('role', 'option'); li.dataset.i = i;
    li.setAttribute('aria-selected', String(i === active));
    li.textContent = placeLabel(ND, pl);
    ul.append(li);
  });
  if (!opts.length) {
    const li = document.createElement('li'); li.className = 'none';
    li.textContent = 'No town by that name. Try a bigger place nearby, or add “, country”.';
    ul.append(li);
  }
  ul.hidden = false;
  $('near').setAttribute('aria-expanded', 'true');
  if (active >= 0) { $('near').setAttribute('aria-activedescendant', `opt${active}`); $(`opt${active}`).scrollIntoView({ block: 'nearest' }); }
  else $('near').removeAttribute('aria-activedescendant');
}

async function onNearInput() {
  const v = $('near').value;
  if (!v.trim()) {
    closeOpts();
    if (state.near) { state.near = null; state.shown = PAGE; sync(); drawSelection(); drawList(); }
    return;
  }
  try { await loadNear(); }
  catch { opts = []; $('nearList').hidden = false; $('nearList').textContent = 'Could not load the list of towns. Try reloading.'; return; }
  if ($('near').value !== v) return; // typed on while loading
  opts = matchPlaces(ND, v); active = opts.length ? 0 : -1;
  drawOpts();
}

function wireNear() {
  const box = $('near');
  box.addEventListener('focus', () => { loadNear().catch(() => {}); });
  box.addEventListener('input', onNearInput);
  box.addEventListener('keydown', (e) => {
    if ($('nearList').hidden) { if (e.key === 'ArrowDown' && box.value.trim()) { onNearInput(); e.preventDefault(); } return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!opts.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length;
      drawOpts(); e.preventDefault();
    } else if (e.key === 'Enter') {
      if (active >= 0 && opts[active]) pickPlace(opts[active]);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      closeOpts();
      if (state.near) box.value = state.near.label;
      e.preventDefault();
    }
  });
  box.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement === box) return;
    closeOpts();
    if (state.near && box.value.trim()) box.value = state.near.label; // a half-typed edit does not stick
  }, 150));
  $('nearList').addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the box
  $('nearList').addEventListener('click', (e) => {
    const i = e.target.closest('li[data-i]')?.dataset.i;
    if (i != null && opts[i]) pickPlace(opts[i]);
  });
  $('km').addEventListener('change', () => {
    state.km = Number($('km').value) || DEFAULT_KM;
    state.shown = PAGE;
    sync(); drawSelection(); drawList();
  });
}

async function loadUS() {
  usGeo ||= fetch('data/us-states.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  try { const g = await usGeo; stName = new Map(g.states.map((s) => [s.q, s.name])); return g; }
  catch (e) { usGeo = null; throw e; }
}

// "California: 1,204 people · 31.8% of the US-born who studied here, 13.5% of those who worked here"
function compareState(q) {
  const n = D.states.n[q] || 0, there = D.alt.states.n[q] || 0;
  return `${stName.get(q)}: ${fmt(n)} ${n === 1 ? 'person' : 'people'} · ${pct(n, D.states.us)} of the US-born who ` +
    `${VERB[state.view]} here, ${pct(there, D.alt.states.us)} of those who ${VERB[otherView(state.view)]} here`;
}
const usHoverDefault = () => (state.st
  ? `Showing ${stName.get(state.st)}. Tap it again, or pick “All states”, to clear.`
  : 'Tap a state.');

// The second map, shown only with the US chosen. Redrawn on every view switch, since the
// counts are per view; the outlines are fetched once.
async function drawUS() {
  const box = $('us');
  if (state.country !== US) { box.hidden = true; return; }
  let g;
  try { g = await loadUS(); }
  catch { box.hidden = false; $('usmap').textContent = 'Could not load the state outlines. Try reloading.'; return; }
  if (state.country !== US) return; // changed while loading
  box.hidden = false;
  if (state.st && !(D.states.n[state.st] > 0)) state.st = null;
  const [vx, vy, vw, vh] = g.view;
  const svg = el('svg', { viewBox: `${vx} ${vy} ${vw} ${vh}`, role: 'img',
    'aria-label': `Map of US states shaded by how many US-born people who ${VERB[state.view]} at Stanford were born in each` });
  for (const s of g.states) {
    const n = D.states.n[s.q] || 0;
    const p = n
      ? el('path', { d: s.d, class: 'c', fill: `var(--b${binOf(n, STATE_BREAKS)})`, 'data-s': s.q })
      : el('path', { d: s.d, class: 'c e' });
    const t = el('title'); t.textContent = `${s.name}: ${fmt(n)}`; p.append(t);
    svg.append(p);
  }
  svg.addEventListener('click', (e) => {
    const q = e.target.closest('[data-s]')?.dataset.s;
    if (q) selectState(state.st === q ? null : q);
  });
  svg.addEventListener('pointerover', (e) => {
    const q = e.target.closest('[data-s]')?.dataset.s;
    if (q) $('usHover').textContent = compareState(q);
  });
  svg.addEventListener('pointerleave', () => { $('usHover').textContent = usHoverDefault(); });
  $('usmap').replaceChildren(svg);
  const lg = $('usLegend');
  lg.replaceChildren();
  STATE_BREAKS.forEach((_, i) => {
    const k = document.createElement('span');
    k.className = 'k';
    k.innerHTML = `<span class="sw" style="background:var(--b${i})"></span>`;
    k.append(binLabel(i, STATE_BREAKS));
    lg.append(k);
  });

  $('usTitle').textContent = `Born in the United States, by state: ${fmt(D.states.us)} who ${VERB[state.view]} here`;
  const sel = $('state');
  sel.replaceChildren();
  const all = document.createElement('option'); all.value = ''; all.textContent = `All states (${fmt(D.states.us)})`;
  sel.append(all);
  const ranked = g.states.filter((s) => D.states.n[s.q]).sort((a, b) => D.states.n[b.q] - D.states.n[a.q] || (a.name < b.name ? -1 : 1));
  for (const s of ranked) {
    const o = document.createElement('option'); o.value = s.q; o.textContent = `${s.name} (${fmt(D.states.n[s.q])})`; sel.append(o);
  }

  const o = overRepresentedStates(D, stName);
  const p = $('usContrast');
  p.replaceChildren();
  if (o.length) {
    const b = document.createElement('b');
    b.textContent = `More common among the US-born who ${VERB[state.view]} here than those who ${VERB[otherView(state.view)]} here: `;
    p.append(b);
    o.forEach((x, i) => {
      const a = document.createElement('button');
      a.type = 'button'; a.className = 'chip'; a.dataset.s = x.q;
      a.textContent = `${x.name} ${ratioLabel(x.ratio, VERB[otherView(state.view)])}`;
      a.title = compareState(x.q);
      p.append(a);
      if (i < o.length - 1) p.append(' ');
    });
  }
  const none = D.states.us - D.states.with_state;
  $('usNote').textContent = none
    ? `${fmt(none)} of them have no state on Wikidata: born “in the United States”, or in Puerto Rico, Guam or American Samoa. ` +
      'They are in the US list but on no state.'
    : '';

  const t = document.createElement('table');
  t.innerHTML = `<tr><th>State</th><th class="r">People</th><th class="r">Share of US-born</th>` +
    `<th class="r">Share of US-born who ${VERB[otherView(state.view)]} here</th></tr>`;
  for (const s of ranked) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.textContent = s.name;
    const n = document.createElement('td'); n.className = 'r'; n.textContent = fmt(D.states.n[s.q]);
    const s1 = document.createElement('td'); s1.className = 'r'; s1.textContent = pct(D.states.n[s.q], D.states.us);
    const s2 = document.createElement('td'); s2.className = 'r'; s2.textContent = pct(D.alt.states.n[s.q] || 0, D.alt.states.us);
    tr.append(td, n, s1, s2); t.append(tr);
  }
  $('usTable').replaceChildren(t);
  sync(); drawSelection(); drawStateSelection(); drawList();
}

function drawStateSelection() {
  for (const n of document.querySelectorAll('#usmap [data-s]')) n.classList.toggle('sel', n.dataset.s === state.st);
  const sel = document.querySelector(`#usmap path[data-s="${state.st}"]`);
  if (sel) sel.parentNode.append(sel); // above its neighbours, so the outline is whole
  $('usHover').textContent = usHoverDefault();
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
  const all = document.createElement('option'); all.value = ''; all.textContent = 'Everywhere';
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
  drawViewControls(); drawMap(); drawContrast(); drawTable(); sync(); drawSelection(); drawList(); drawUS();
  return true;
}

async function main() {
  // The country in the URL is checked against the view the URL names, so ?v=worked&c=...
  // keeps a country only that view has.
  const want = decodeState(location.search, new Set()).view;
  let doc;
  try { doc = await load(want); }
  catch { $('sub').textContent = 'Could not load the data. Try reloading.'; return; }
  Object.assign(state, decodeState(location.search, new Set(doc.countries.map((c) => c.q)),
    new Set(Object.keys(doc.states.n))));
  const { nearLabel } = state;
  delete state.nearLabel;
  await show(want);
  wireNear();
  if (nearLabel) {
    $('near').value = nearLabel;
    try {
      await loadNear();
      const pl = placeByLabel(ND, nearLabel);
      if (pl) pickPlace(pl); else onNearInput(); // an unknown town opens its suggestions instead
    } catch { /* the box says why when it is next used */ }
  }
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
  $('state').addEventListener('change', () => selectState($('state').value || null));
  $('usContrast').addEventListener('click', (e) => {
    const q = e.target.closest('button[data-s]')?.dataset.s;
    if (q) selectState(q);
  });
  $('sort').addEventListener('change', () => { state.sort = $('sort').value; state.shown = PAGE; sync(); drawList(); });
  let t;
  $('q').addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = $('q').value.slice(0, 80); state.shown = PAGE; sync(); drawList(); }, 120);
  });
  $('more').addEventListener('click', () => { state.shown += PAGE * 2; drawList(); });
}

main();
