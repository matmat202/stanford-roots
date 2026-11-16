/* The scrolling story: each <section class="step"> names a layout in data-kind; as the
 * reader scrolls from one step to the next, every person's dot flies from the old layout
 * to the new one. Numbers in the prose are not typed in: a <b data-fact="..."> is filled
 * from roots.json, so the text cannot drift from the chart. */
import { BINS, US, C, abroad, athlete, born, bins, binByLabel, share, shareNA, athShare, topCountries, map, field, columns } from './layout.js';
import { createPoints } from './gl.js';

// 0 ink, 1 abroad (cardinal), 2 US (slate teal), 3 athlete (gold), 4 unused, 5 grey
const PAL = [[0.11, 0.1, 0.09], [0.55, 0.08, 0.08], [0.2, 0.43, 0.5], [0.78, 0.55, 0.05], [0.38, 0.3, 0.55], [0.55, 0.53, 0.5]];

const pct = (v) => `${Math.round(v * 100)}%`;
const fmt = (n) => n.toLocaleString('en-US');

/* "share:1960s" -> "37%". Unknown kinds throw: a typo must not render as blank. */
export function fact(D, spec) {
  const P = D.people, B = bins(P);
  const [kind, ...a] = spec.split(':');
  const name = (q) => (D.countries.find((c) => c.q === q) || { name: q }).name;
  switch (kind) {
    case 'people': return fmt(P.length);
    case 'with-year': return fmt(P.filter((p) => born(p) != null).length);
    case 'us': return fmt(P.filter((p) => p[5].includes(US)).length);
    case 'us-pct': return pct(P.filter((p) => p[5].includes(US)).length / P.length);
    case 'abroad': return fmt(P.filter(abroad).length);
    case 'countries': return fmt(D.countries.filter((c) => c.q !== US).length);
    case 'n': return fmt(B[binByLabel(a[0])].n);
    case 'peak-bin': return B.reduce((m, b) => (b.n > m.n ? b : m)).label;
    case 'share': return pct(share(B[binByLabel(a[0])]));
    case 'share-na': return pct(shareNA(B[binByLabel(a[0])]));
    case 'ath': return pct(athShare(B[binByLabel(a[0])]));
    case 'ath-max': return pct(Math.max(...B.filter((b) => b.hi <= +a[0]).map(athShare)));
    case 'ath-n': return fmt(P.filter(athlete).length);
    case 'abroad-n': return fmt(topCountries(P, +a[0], +a[1]).n);
    case 'top': return name(topCountries(P, +a[0], +a[1]).ranked[+a[2] - 1][0]);
    case 'cnt': return fmt((topCountries(P, +a[0], +a[1]).ranked.find(([q]) => q === a[2]) || [0, 0])[1]);
    case 'rank': return String(topCountries(P, +a[0], +a[1]).ranked.findIndex(([q]) => q === a[2]) + 1);
    default: throw new Error(`unknown fact ${spec}`);
  }
}

/* data-kind -> layout. Map kinds take an optional data-born="lo-hi" filter. */
export function layoutFor(step, D, aspect) {
  const P = D.people, kind = step.dataset.kind;
  const [lo, hi] = (step.dataset.born || '-9999-9999').split(/(?<=\d)-/).map(Number);
  switch (kind) {
    case 'field': return field(P);
    case 'map': return map(P, D.view, aspect);
    case 'map-era': return map(P, D.view, aspect, {
      show: (p) => abroad(p) && born(p) != null && born(p) >= lo && born(p) < hi,
      colour: () => C.abroad,
    });
    case 'counts': return columns(P, aspect);
    case 'share': return columns(P, aspect, { stretch: true });
    case 'athletes': return columns(P, aspect, { stretch: true, colour: (p) => (athlete(p) ? C.ath : abroad(p) ? C.abroad : C.us) });
    case 'no-athletes': return columns(P, aspect, { stretch: true, drop: athlete });
    default: throw new Error(`unknown layout ${kind}`);
  }
}

const SVGNS = 'http://www.w3.org/2000/svg';
function drawOutlines(svgHost, D) {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${D.view[0]} ${D.view[1]}`);
  for (const c of [...D.empty, ...D.countries]) {
    if (!c.d) continue;
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', c.d);
    svg.append(p);
  }
  svgHost.append(svg);
}

async function main() {
  const D = await (await fetch('../data/roots.json')).json();
  for (const el of document.querySelectorAll('[data-fact]')) el.textContent = fact(D, el.dataset.fact);
  const B = bins(D.people);

  const steps = [...document.querySelectorAll('.step')];
  const canvas = document.getElementById('gl');
  const plot = document.getElementById('plot');
  const axes = document.getElementById('axes');
  const outlines = document.getElementById('outlines');
  drawOutlines(outlines, D);

  let layouts = [];
  const relayout = () => {
    const a = plot.clientWidth / Math.max(1, plot.clientHeight);
    layouts = steps.map((s) => layoutFor(s, D, a));
    window.__story = { people: D.people.length, layouts: layouts.map((l) => ({ kind: l.kind, shown: l.shown, counts: l.counts })) };
  };
  relayout();

  const pts = createPoints(canvas, D.people.length, PAL);
  if (!pts) { document.body.classList.add('nogl'); return; }
  const dpr = Math.min(2, devicePixelRatio || 1);
  let shown = -1;
  const resize = () => {
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    relayout();
    shown = -1;
  };
  resize();
  addEventListener('resize', resize);

  // Same scroll model as daily-story: the step whose top has crossed mid-viewport is
  // "from", and t runs 0 -> 1 as the next step's top rises from the bottom to the middle.
  const progress = () => {
    const line = innerHeight * 0.5;
    let i = 0;
    for (let k = 0; k < steps.length; k++) if (steps[k].getBoundingClientRect().top < line) i = k;
    const next = steps[i + 1];
    if (!next) return { i, t: 0 };
    const top = next.getBoundingClientRect().top;
    return { i, t: Math.min(1, Math.max(0, 1 - (top - line) / (innerHeight - line))) };
  };

  const drawAxes = (lay, step) => {
    const html = [];
    if (lay.kind === 'columns') {
      const K = BINS.length, narrow = plot.clientWidth < 600;
      const kind = step.dataset.kind;
      BINS.forEach((b, i) => {
        const x = ((i + 0.5) / K) * 100;
        html.push(`<span class="tick" style="left:${x}%">${narrow ? b.short.replace(/^(\d\d)(\d\d)s$/, "'$2s") : b.short}</span>`);
        const v = kind === 'counts' ? fmt(B[i].n)
          : kind === 'no-athletes' ? pct(shareNA(B[i]))
          : kind === 'athletes' ? pct(athShare(B[i])) : pct(share(B[i]));
        html.push(`<span class="val${kind === 'athletes' ? ' ath' : ''}" style="left:${x}%">${v}</span>`);
      });
      const unit = kind === 'counts' ? 'one dot = one person, by decade of birth'
        : kind === 'athletes' ? 'gold = a sports career · % = athletes in that column'
        : kind === 'no-athletes' ? 'athletes removed · % = born abroad'
        : 'each column stretched to 100% · % = born abroad';
      html.push(`<span class="unit">${unit}</span>`);
    }
    axes.innerHTML = html.join('');
  };

  const isMap = (l) => l.kind === 'map';
  const t0 = performance.now();
  const frame = () => {
    const { i, t } = progress();
    const j = Math.min(i + 1, steps.length - 1);
    const A = layouts[i], Bl = layouts[j];
    pts.set(A.slots, Bl.slots);
    const cur = t > 0.5 ? j : i;
    if (cur !== shown) {
      shown = cur;
      drawAxes(layouts[cur], steps[cur]);
      document.body.dataset.step = cur;
    }
    axes.style.opacity = String(Math.abs(t - 0.5) * 2);
    outlines.style.opacity = String((isMap(A) ? 1 - t : 0) + (isMap(Bl) ? t : 0));
    const r = plot.getBoundingClientRect();
    // dot size eases between the two layouts' natural sizes
    const sz = (l) => (l.kind === 'columns' ? Math.max(2, l.cell * r.width * 0.86) : l.kind === 'field' ? Math.max(3, r.width / 190) : Math.max(2.4, r.width / 240));
    const size = sz(A) + (sz(Bl) - sz(A)) * t;
    pts.draw({ t, time: (performance.now() - t0) / 1000, size, rect: [r.left, r.top, r.width, r.height], dpr });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') main().catch((e) => {
  document.body.classList.add('failed');
  document.getElementById('err').textContent = String(e.message || e);
  console.error(e);
});
