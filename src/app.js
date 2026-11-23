// EU VAT Landscape: loads data/vat_rates_eu_2026.csv and renders a one-screen dashboard.
// No build step and no dependencies: plain JavaScript and SVG.

const DATA_URL = 'data/vat_rates_eu_2026.csv';
const EU_MIN_STANDARD = 15; // EU VAT Directive minimum standard rate (%)
const SVG_NS = 'http://www.w3.org/2000/svg';

const fmtPct = (v) => (v == null ? '—' : `${+v.toFixed(2)}%`);
const fmtEur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

/** Parse the simple CSV used by this project (no quoted commas). */
function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    const row = Object.fromEntries(cols.map((c, i) => [c, cells[i] === '' || cells[i] === undefined ? null : cells[i].trim()]));
    row.standard = Number(row.standard);
    row.super_reduced = row.super_reduced == null ? null : Number(row.super_reduced);
    row.parking = row.parking == null ? null : Number(row.parking);
    row.reducedList = row.reduced ? row.reduced.split('/').map((x) => Number(x.trim())) : [];
    return row;
  });
}

/** Headline figures derived from the rows. */
function summarise(rows) {
  const max = rows.reduce((a, b) => (b.standard > a.standard ? b : a));
  const min = rows.reduce((a, b) => (b.standard < a.standard ? b : a));
  const avg = rows.reduce((s, r) => s + r.standard, 0) / rows.length;
  const tiers = rows.reduce((n, r) => {
    const set = new Set([r.standard, ...r.reducedList, r.super_reduced, r.parking].filter((x) => x != null));
    return n + set.size;
  }, 0);
  return { max, min, avg, tiers, spread: max.standard - min.standard };
}

function el(tag, attrs = {}, text) {
  const node = tag.startsWith('svg:') ? document.createElementNS(SVG_NS, tag.slice(4)) : document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (text != null) node.textContent = text;
  return node;
}

function renderHeadline(s) {
  const lede = document.getElementById('lede');
  lede.textContent = '';
  const parts = [
    ['Standard VAT runs from '], [fmtPct(s.min.standard), 1], [` in ${s.min.country} to `],
    [fmtPct(s.max.standard), 1], [` in ${s.max.country}, so the same net price can land `],
    [`${+s.spread.toFixed(2)} points`, 1], [' apart at checkout.'],
  ];
  parts.forEach(([t, bold]) => lede.append(el(bold ? 'b' : 'span', {}, t)));
  document.getElementById('kpi-avg').textContent = fmtPct(Math.round(s.avg * 10) / 10);
  document.getElementById('kpi-max').textContent = fmtPct(s.max.standard);
  document.getElementById('kpi-max-c').textContent = s.max.country;
  document.getElementById('kpi-min').textContent = fmtPct(s.min.standard);
  document.getElementById('kpi-min-c').textContent = s.min.country;
  document.getElementById('kpi-tiers').textContent = String(s.tiers);
}

/** Horizontal bar chart that scales to the height of its container. */
function renderChart(rows, s, onSelect) {
  const box = document.getElementById('chart');
  box.textContent = '';
  const W = box.clientWidth || 600;
  const H = Math.max(box.clientHeight, 300);
  const data = [...rows].sort((a, b) => b.standard - a.standard || a.country.localeCompare(b.country));
  const top = 18, bottom = 4, right = 44;
  const rowH = (H - top - bottom) / data.length;

  const svg = el('svg:svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Bar chart of standard VAT rates in 27 EU countries, highest to lowest' });
  box.append(svg);

  // Measure the widest country label to set the left margin.
  const probe = el('svg:text', {}, 'Netherlands');
  svg.append(probe);
  const left = Math.ceil(Math.max(...data.map((d) => { probe.textContent = d.country; return probe.getComputedTextLength(); }))) + 10;
  probe.remove();

  const xMax = 30;
  const x = (v) => left + (v / xMax) * (W - left - right);
  [0, 10, 20, 30].forEach((t) => {
    svg.append(el('svg:line', { class: 'grid-line', x1: x(t), x2: x(t), y1: top - 4, y2: H - bottom }));
    svg.append(el('svg:text', { x: x(t), y: 11, 'text-anchor': 'middle' }, `${t}%`));
  });

  const tip = el('div', { class: 'tip', hidden: '' });
  box.append(tip);
  const barH = Math.max(6, Math.min(16, rowH * 0.62));

  data.forEach((d, i) => {
    const cy = top + i * rowH + rowH / 2;
    svg.append(el('svg:text', { x: left - 8, y: cy + 4, 'text-anchor': 'end' }, d.country));
    const isHi = d.standard === s.max.standard || d.standard === s.min.standard;
    const bar = el('svg:rect', {
      class: `bar${isHi ? ' hi' : ''}`, x: x(0), y: cy - barH / 2, width: Math.max(1, x(d.standard) - x(0)), height: barH, rx: 3,
      tabindex: '0', 'data-code': d.code, 'aria-label': `${d.country}: ${fmtPct(d.standard)}`,
    });
    const show = (ev) => {
      const r = box.getBoundingClientRect();
      const px = ev.clientX ? ev.clientX - r.left : x(d.standard);
      const py = ev.clientY ? ev.clientY - r.top : cy;
      tip.textContent = `${d.country} (${d.code}) · standard ${fmtPct(d.standard)} · reduced ${d.reduced ?? '—'}`;
      tip.hidden = false;
      tip.style.left = `${Math.min(px + 12, W - tip.offsetWidth - 4)}px`;
      tip.style.top = `${Math.max(0, py - 34)}px`;
    };
    bar.addEventListener('pointermove', show);
    bar.addEventListener('focus', show);
    bar.addEventListener('pointerleave', () => { tip.hidden = true; });
    bar.addEventListener('blur', () => { tip.hidden = true; });
    bar.addEventListener('click', () => onSelect(d.code));
    svg.append(bar);
    svg.append(el('svg:text', { class: 'val', x: x(d.standard) + 5, y: cy + 4 }, fmtPct(d.standard)));
  });

  svg.append(el('svg:line', { class: 'ref-line', x1: x(EU_MIN_STANDARD), x2: x(EU_MIN_STANDARD), y1: top - 4, y2: H - bottom }));
}

function rowsInto(dl, items) {
  dl.textContent = '';
  items.forEach(([k, v, cls]) => {
    const row = el('div', { class: `row${cls ? ` ${cls}` : ''}` });
    row.append(el('dt', {}, k), el('dd', {}, v));
    dl.append(row);
  });
}

function renderCalc(s) {
  const net = parseFloat(document.getElementById('net').value);
  const dl = document.getElementById('calc');
  if (!(net >= 0)) { rowsInto(dl, [['Enter a net price', '—']]); return; }
  const lo = net * (1 + s.min.standard / 100);
  const hi = net * (1 + s.max.standard / 100);
  rowsInto(dl, [
    [`${s.min.country} (${fmtPct(s.min.standard)})`, fmtEur.format(lo)],
    [`${s.max.country} (${fmtPct(s.max.standard)})`, fmtEur.format(hi)],
    ['Gap per order', fmtEur.format(hi - lo), 'gap'],
  ]);
}

function renderLookup(rows, code) {
  const r = rows.find((x) => x.code === code) || rows[0];
  document.getElementById('country').value = r.code;
  document.querySelectorAll('.chart .bar').forEach((b) => b.classList.toggle('sel', b.dataset.code === r.code));
  rowsInto(document.getElementById('lookup'), [
    ['Standard', fmtPct(r.standard)],
    ['Reduced', r.reducedList.length ? r.reducedList.map(fmtPct).join(' · ') : '—'],
    ['Super-reduced', fmtPct(r.super_reduced)],
    ['Parking', fmtPct(r.parking)],
  ]);
}

async function main() {
  let rows;
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = parseCsv(await res.text());
  } catch (err) {
    document.getElementById('lede').textContent =
      'Could not load the VAT data. If you opened this file directly, run a local server (see README).';
    console.error(err);
    return;
  }

  const s = summarise(rows);
  renderHeadline(s);

  const select = document.getElementById('country');
  [...rows].sort((a, b) => a.country.localeCompare(b.country))
    .forEach((r) => select.append(new Option(`${r.country} (${r.code})`, r.code)));

  let selected = 'DE';
  const pick = (code) => { selected = code; renderLookup(rows, code); };
  const drawChart = () => { renderChart(rows, s, pick); renderLookup(rows, selected); };

  drawChart();
  renderCalc(s);
  document.getElementById('net').addEventListener('input', () => renderCalc(s));
  select.addEventListener('change', () => pick(select.value));
  new ResizeObserver(() => drawChart()).observe(document.getElementById('chart'));
}

main();
