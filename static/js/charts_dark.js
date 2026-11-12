/* Dark-theme copy for the academic page (index_dark.html). Native SVG result charts: draw on scroll, CI bands, hover crosshair. Data: media/charts.json */
(async () => {
  const D = await (await fetch('media/charts.json')).json();
  const NS = 'http://www.w3.org/2000/svg';
  const C = { real: '#f2c27b', sim: '#8ab4ff', ink: '#c7c7cc', grey: '#5a5a60', dim: '#4f6896', mid: '#7c7f86', low: '#46484d' };
  const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent?.appendChild(e); return e; };
  const pct = v => `${Math.round(v * 100)}%`;

  function lineChart(host, { series, xlog = false, xTicks, yMax, yMin = 0, yTicks, xLabel, yFmt = pct, xFmt = String, title, tipHead }) {
    const narrow = innerWidth < 600, W = narrow ? 360 : 520, H = narrow ? 280 : 330, m = { l: 42, r: narrow ? 48 : 64, t: title ? 34 : 14, b: 46 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': title || xLabel }, host);
    const xs = series.flatMap(s => s.pts.map(p => p[0])); const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const fx = v => m.l + (xlog ? (Math.log(v) - Math.log(x0)) / (Math.log(x1) - Math.log(x0)) : (v - x0) / (x1 - x0)) * (W - m.l - m.r);
    const fy = v => H - m.b - (v - yMin) / (yMax - yMin) * (H - m.t - m.b);
    if (title) el('text', { x: m.l, y: 16, class: 'c-title' }, svg).textContent = title;
    for (const t of yTicks) { el('line', { x1: m.l, x2: W - m.r + 8, y1: fy(t), y2: fy(t), class: 'c-grid' }, svg); el('text', { x: m.l - 10, y: fy(t) + 4, class: 'c-tick', 'text-anchor': 'end' }, svg).textContent = yFmt(t); }
    for (const t of xTicks) el('text', { x: fx(t), y: H - m.b + 20, class: 'c-tick', 'text-anchor': 'middle' }, svg).textContent = xFmt(t);
    el('text', { x: (m.l + W - m.r) / 2, y: H - 8, class: 'c-axis', 'text-anchor': 'middle' }, svg).textContent = xLabel;
    const paths = [];
    for (const s of series) {
      const g = el('g', { class: 'c-series' }, svg);
      if (s.pts[0].length > 2) {
        const up = s.pts.map(p => `${fx(p[0])},${fy(p[3])}`), dn = s.pts.slice().reverse().map(p => `${fx(p[0])},${fy(p[2])}`);
        el('polygon', { points: [...up, ...dn].join(' '), fill: s.color, class: 'c-band' }, g);
      }
      const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${fx(p[0]).toFixed(1)},${fy(p[1]).toFixed(1)}`).join('');
      const path = el('path', { d, stroke: s.color, class: 'c-line' + (s.faint ? ' faint' : '') }, g); paths.push(path);
      s.pts.forEach(p => el('circle', { cx: fx(p[0]), cy: fy(p[1]), r: 2.6, fill: s.color, class: 'c-dot' }, g));
      const last = s.pts[s.pts.length - 1];
      el('text', { x: fx(last[0]) + 9, y: fy(last[1]) + 4, fill: s.color, class: 'c-end' }, g).textContent = s.end ?? yFmt(last[1]);
    }
    // hover crosshair
    const hair = el('g', { class: 'c-hair' }, svg); const vl = el('line', { y1: m.t, y2: H - m.b, class: 'c-vline' }, hair);
    const tip = el('g', {}, hair); const box = el('rect', { rx: 6, class: 'c-tipbox' }, tip); const tt = el('text', { class: 'c-tip' }, tip);
    const xsU = [...new Set(xs)].sort((a, b) => a - b);
    svg.addEventListener('pointermove', e => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse());
      let best = xsU[0]; for (const v of xsU) if (Math.abs(fx(v) - q.x) < Math.abs(fx(best) - q.x)) best = v;
      const X = fx(best); vl.setAttribute('x1', X); vl.setAttribute('x2', X);
      tt.replaceChildren(); let i = 0;
      const head = el('tspan', { x: 0, dy: 0, class: 'c-tip-h' }, tt); head.textContent = tipHead ? tipHead(best) : xFmt(best);
      for (const s of series) { const p = s.pts.find(p => p[0] === best); if (!p) continue; const ts = el('tspan', { x: 0, dy: 17, fill: s.color }, tt); ts.textContent = `${s.name}  ${yFmt(p[1])}`; i++; }
      const bb = tt.getBBox(); const bx = X + 14 + bb.width + 20 > W ? X - bb.width - 34 : X + 14;
      tt.setAttribute('transform', `translate(${bx + 10},${m.t + 18})`); box.setAttribute('x', bx); box.setAttribute('y', m.t); box.setAttribute('width', bb.width + 20); box.setAttribute('height', bb.height + 14);
      hair.classList.add('on');
    });
    svg.addEventListener('pointerleave', () => hair.classList.remove('on'));
    paths.forEach(p => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; });
    return svg;
  }

  function barChart(host, groups) {
    const narrow = innerWidth < 600, W = narrow ? 520 : 1040, H = narrow ? 340 : 360, m = { l: 40, r: 8, t: 20, b: 54 }, yMax = .7;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': 'Error in share standing alone' }, host);
    const fy = v => H - m.b - v / yMax * (H - m.t - m.b);
    for (const t of [0, .2, .4, .6]) { el('line', { x1: m.l, x2: W - m.r, y1: fy(t), y2: fy(t), class: 'c-grid' }, svg); el('text', { x: m.l - 10, y: fy(t) + 4, class: 'c-tick', 'text-anchor': 'end' }, svg).textContent = t.toFixed(1); }
    const n = groups.reduce((a, g) => a + g.arms.length, 0), gap = narrow ? 22 : 46, bw = (W - m.l - m.r - gap * (groups.length - 1) - 30) / n;
    let x = m.l + 20; let k = 0;
    for (const g of groups) {
      const x0 = x;
      for (const [label, v, color] of g.arms) {
        const h = fy(0) - fy(v);
        const r = el('rect', { x: x + 3, y: fy(v), width: bw - 6, height: h, rx: 4, fill: color, class: 'c-bar' }, svg); r.style.transitionDelay = `${k++ * 70}ms`;
        el('text', { x: x + bw / 2, y: fy(v) - 9, class: 'c-val', 'text-anchor': 'middle' }, svg).textContent = narrow ? v.toFixed(2).replace(/^0/, '') : v.toFixed(2);
        x += bw;
      }
      el('text', { x: (x0 + x) / 2, y: H - m.b + 24, class: 'c-group', 'text-anchor': 'middle' }, svg).textContent = g.name;
      el('text', { x: (x0 + x) / 2, y: H - m.b + 42, class: 'c-tick', 'text-anchor': 'middle' }, svg).textContent = g.sub;
      x += gap;
    }
    return svg;
  }

  const H = D.hitk, nameOf = { nearest_popular: ['Nearest popular spot', C.real], popularity: ['Most popular spots', C.ink], uniform: ['Chance', C.grey] };
  const hk = document.querySelector('[data-chart="hitk"]');
  if (hk) for (const [w, label] of [['Black Cat', 'Bar scene'], ['Furry', 'Hangout scene']]) lineChart(hk.appendChild(Object.assign(document.createElement('div'), { className: 'chart-cell' })), { tipHead: v => `${v} guess${v > 1 ? 'es' : ''}`,
    title: label, xlog: true, xTicks: [1, 2, 5, 10, 20, 50], yMax: .8, yTicks: [0, .2, .4, .6, .8], xLabel: 'Guesses per walk',
    series: Object.entries(H[w]).map(([k, pts]) => ({ name: nameOf[k][0], color: nameOf[k][1], pts, faint: k === 'uniform' })),
  });
  const cl = document.querySelector('[data-chart="closed"]');
  if (cl) {
    const arm = { 'goal sim (person or place goal)': C.sim, 'goal sim, no social inputs': C.dim, '3.4M-param next-step transformer': C.mid, null: C.low };
    barChart(cl, D.closed.map(g => ({ name: ({ 'Black Cat': 'Bar scene', 'Furry': 'Hangout scene', 'GreatPug': 'Pub scene' })[g.world.split(' (')[0]] || 'Scene', sub: g.world.includes('zero-shot') ? 'zero-shot' : 'trained here', arms: g.arms.map(([v, e]) => [v, e, arm[v]]) })));
  }
  const gf = document.querySelector('[data-chart="goal"]');
  if (gf) lineChart(gf, { xTicks: [0, 2, 4, 6, 8], yMax: .45, yTicks: [0, .1, .2, .3, .4], xLabel: 'Seconds since the walk began', xFmt: v => `${v}s`, tipHead: v => `After ${v} s`,
    series: [{ name: 'Goal filter', color: C.sim, pts: D.goal.filter }, { name: 'Popularity prior', color: C.grey, pts: D.goal.prior, faint: true }] });
  const sp = document.querySelector('[data-chart="stay"]');
  if (sp) lineChart(sp, { xlog: true, xTicks: [1, 2, 5, 10, 20, 30], yMin: .5, yMax: 1, yTicks: [.5, .6, .7, .8, .9, 1], xLabel: 'Window length, seconds', tipHead: v => `${v}-second windows`,
    series: [{ name: 'Moving under 0.5 m', color: C.real, pts: D.stay }] });

  // draw when scrolled into view
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('drawn'); io.unobserve(e.target); } }), { threshold: .35 });
  document.querySelectorAll('[data-chart]').forEach(c => io.observe(c));
})();
