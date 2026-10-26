import {
  P, BREAKS, binOf, binLabel, filterPeople, sortPeople, personUrl, isWikipedia, centroid,
  encodeState, decodeState, lifeLine,
} from './roots-logic.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const PAGE = 60;
let D = null;
let byQ = new Map();
const state = { country: null, q: '', sort: 'old', shown: PAGE };

const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const fmt = (n) => n.toLocaleString('en-US');

function drawMap() {
  const [w, h] = D.view;
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img',
    'aria-label': `World map shaded by how many Stanford-educated people were born in each country` });
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
    if (q) $('hover').textContent = `${byQ.get(q).name}: ${fmt(byQ.get(q).n)} ${byQ.get(q).n === 1 ? 'person' : 'people'}`;
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
  t.innerHTML = '<tr><th>Country</th><th class="r">People</th><th>On the map</th></tr>';
  for (const c of D.countries) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.textContent = c.name;
    const n = document.createElement('td'); n.className = 'r'; n.textContent = fmt(c.n);
    const m = document.createElement('td'); m.textContent = c.d ? 'outline' : 'marker or off-map';
    tr.append(td, n, m); t.append(tr);
  }
  $('table').replaceChildren(t);
}

async function main() {
  try { D = await (await fetch('data/roots.json')).json(); }
  catch { $('sub').textContent = 'Could not load the data. Try reloading.'; return; }
  byQ = new Map(D.countries.map((c) => [c.q, c]));
  $('sub').textContent = `Where ${fmt(D.people.length)} people Wikidata lists as educated at Stanford were born: ` +
    `${D.countries.length} countries. Tap one to meet everyone from it.`;
  const sel = $('country');
  const all = document.createElement('option'); all.value = ''; all.textContent = `Everywhere (${fmt(D.people.length)})`;
  sel.append(all);
  for (const c of D.countries) {
    const o = document.createElement('option'); o.value = c.q; o.textContent = `${c.name} (${fmt(c.n)})`; sel.append(o);
  }
  Object.assign(state, decodeState(location.search, new Set(byQ.keys())));
  drawMap(); drawTable(); sync(); drawSelection(); drawList();
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
