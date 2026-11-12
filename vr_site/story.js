/* Scroll-driven 3D story: The Black Cat as a point cloud; real crowd, stop field, goal belief, simulated crowd. */
import * as THREE from '../replay/vendor/three.module.js';

const LIGHT = new URLSearchParams(location.search).has('light');           // opt-in light render mode (academic figures)
if (LIGHT) document.documentElement.classList.add('light');
const TEASER = new URLSearchParams(location.search).has('teaser');         // teaser-video text style (top-left, sans)
const CAPTURE0 = new URLSearchParams(location.search).has('capture');
const EXTRAS = TEASER || !CAPTURE0;                                       // v0.9.8: the live story gets the teaser's text, labels and finale
if (TEASER) { document.documentElement.classList.add('teaser'); document.querySelectorAll('[data-teaser]').forEach(e => { e.textContent = e.dataset.teaser; }); }
if (EXTRAS) document.querySelectorAll('[data-teaser-html]').forEach(e => { e.innerHTML = e.dataset.teaserHtml; });
const REAL = new THREE.Color(LIGHT ? '#b5660b' : '#f2c27b'), SIM = new THREE.Color(LIGHT ? '#2c64cf' : '#8ab4ff');
const BLEND = LIGHT ? THREE.NormalBlending : THREE.AdditiveBlending;
const INK = new THREE.Color(LIGHT ? '#55585e' : '#c9ccd2');                  // neutral movement colour (finale, before comparison)
const section = document.getElementById('story');
const canvas = document.getElementById('scene');
const beats = [...section.querySelectorAll('.beat')];
const rail = [...section.querySelectorAll('.rail i')];
const hudTime = section.querySelector('[data-hud="time"]');
const hudLegend = section.querySelectorAll('[data-hud-key]');
const loading = section.querySelector('.story-loading');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const win = (p, a, b, f = .025) => ss(a - f, a + f, p) * (1 - ss(b - f, b + f, p));   // 0→1→0 over [a,b]

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setClearColor(LIGHT ? 0xffffff : 0x050506, 1);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(LIGHT ? 0xffffff : 0x050506, 70, 190);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);

async function bin(url) { return new Int16Array(await (await fetch(url)).arrayBuffer()); }
const S = await (await fetch('media/scene/scene.json')).json();
const [walls, floors, realQ, simQ] = await Promise.all(['walls', 'floors', 'crowd_real', 'crowd_predicted'].map(n => bin(`media/scene/${n}.i16`)));
loading?.classList.add('done');

/* ---------- building point cloud ---------- */
function cloud(q, color, alpha, size) {
  const pos = new Float32Array(q.length); for (let i = 0; i < q.length; i++) pos[i] = q[i] / 100;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uSize: { value: size }, uDim: { value: 1 }, uPx: { value: 1 }, uBuild: { value: 0 } },
    vertexShader: `uniform float uSize; uniform float uPx; uniform float uBuild; varying float vH; varying float vD; varying float vB;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      void main(){
        float r = h(position), r2 = h(position.zxy + 3.1), r3 = h(position.yzx + 7.7);
        float k = clamp(uBuild * 1.7 - r * .7, 0., 1.); k = 1. - pow(1. - k, 3.);     // staggered ease-out
        vec3 dir = normalize(vec3(r2 - .5, r3 * .9 + .1, r - .5) + 1e-3);
        vec3 p = mix(position + dir * (28. + 40. * r3) + vec3(0., 18., 0.), position, k);
        vec4 mv = modelViewMatrix * vec4(p,1.); vH = position.y; vD = -mv.z; vB = k;
        gl_PointSize = uSize * uPx * (60. / -mv.z) * (1. + (1. - k) * 1.5); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; uniform float uDim; varying float vH; varying float vD; varying float vB;
      void main(){ vec2 c = gl_PointCoord-.5; if(dot(c,c)>.25) discard;
      float lift = .72 + .38*smoothstep(-5.,9.,vH); float fog = 1. - smoothstep(90.,190.,vD);
      gl_FragColor = vec4(uColor*lift, uAlpha*uDim*fog*(.15 + .85*vB)); }`,
  });
  const p = new THREE.Points(g, m); scene.add(p); return p;
}
const wallPts = LIGHT ? cloud(walls, '#2a2d33', .7, 1.2) : cloud(walls, '#e4e6ea', .62, 1.3);
const floorPts = LIGHT ? cloud(floors, '#a7adb5', .32, 1.05) : cloud(floors, '#868b93', .30, 1.15);
const buildStart = performance.now();

/* ---------- crowds: time-coded trail segments + live heads ---------- */
const ribbonRes = { value: new THREE.Vector2(1, 1) };
function crowd(Q, meta, color, predAt = null) {
  const { T, N } = meta; const seg = [], tt = [], pp = [];
  const at = (t, n) => { const o = (t * N + n) * 3; return Q[o] <= -32767 ? null : [Q[o] / 100, Q[o + 1] / 100 + .15, Q[o + 2] / 100]; };
  for (let n = 0; n < N; n++) for (let t = 1; t < T; t++) {
    const o = (t * N + n) * 3; if (Q[o] === -32767) continue;
    const a = at(t - 1, n), b = at(t, n); if (!a || !b) continue;
    seg.push(...a, ...b); tt.push(t - 1, t); if (predAt) pp.push(predAt(a[0], a[2]), predAt(b[0], b[2]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3)); g.setAttribute('t', new THREE.Float32BufferAttribute(tt, 1));
  if (!predAt) for (let i = 0; i < tt.length; i++) pp.push(0);
  g.setAttribute('aP', new THREE.Float32BufferAttribute(pp, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: BLEND,
    uniforms: { uNow: { value: 0 }, uColor: { value: color }, uColB: { value: SIM }, uMix: { value: 0 }, uOn: { value: 0 }, uKeep: { value: .07 } },
    vertexShader: `attribute float t; attribute float aP; varying float vT; varying float vP; void main(){ vT = t; vP = aP; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uNow; uniform vec3 uColor; uniform vec3 uColB; uniform float uMix; uniform float uOn; uniform float uKeep; varying float vT; varying float vP;
      void main(){ if (vT > uNow) discard; float age = uNow - vT; float a = uKeep + .9*exp(-age/14.);
      gl_FragColor = vec4(mix(uColor, uColB, clamp(uMix * vP, 0., 1.)), a*uOn); }`,
  });
  let lines;
  if (!LIGHT) lines = new THREE.LineSegments(g, m);
  else {
    // light mode: 1 px GL lines vanish on white, so draw each segment as a screen-space ribbon of fixed pixel width
    const n = seg.length / 6, A = new Float32Array(n * 12), B = new Float32Array(n * 12), side = new Float32Array(n * 4), end = new Float32Array(n * 4), tv = new Float32Array(n * 4), pv = new Float32Array(n * 4), idx = new Uint32Array(n * 6);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) {
        for (let c = 0; c < 3; c++) { A[(i * 4 + k) * 3 + c] = seg[i * 6 + c]; B[(i * 4 + k) * 3 + c] = seg[i * 6 + 3 + c]; }
        side[i * 4 + k] = k % 2 ? 1 : -1; end[i * 4 + k] = k < 2 ? 0 : 1; tv[i * 4 + k] = tt[i * 2 + (k < 2 ? 0 : 1)]; pv[i * 4 + k] = pp[i * 2 + (k < 2 ? 0 : 1)];
      }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(A, 3)); rg.setAttribute('aB', new THREE.BufferAttribute(B, 3));
    rg.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); rg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    rg.setAttribute('t', new THREE.BufferAttribute(tv, 1)); rg.setAttribute('aP', new THREE.BufferAttribute(pv, 1)); rg.setIndex(new THREE.BufferAttribute(idx, 1));
    Object.assign(m.uniforms, { uRes: ribbonRes, uWidth: { value: 2.4 } });
    m.vertexShader = `attribute vec3 aB; attribute float aSide; attribute float aEnd; attribute float t; attribute float aP; uniform vec2 uRes; uniform float uWidth; varying float vT; varying float vP;
      void main(){ vT = t; vP = aP; vec4 ca = projectionMatrix*modelViewMatrix*vec4(position,1.); vec4 cb = projectionMatrix*modelViewMatrix*vec4(aB,1.);
        vec2 d = (cb.xy/cb.w - ca.xy/ca.w) * uRes; vec2 nrm = length(d) > 1e-5 ? normalize(vec2(-d.y, d.x)) : vec2(0.,1.);
        vec4 c = mix(ca, cb, aEnd); c.xy += nrm * aSide * uWidth / uRes * c.w; gl_Position = c; }`;
    m.side = THREE.DoubleSide;
    lines = new THREE.Mesh(rg, m); lines.frustumCulled = false;
  }
  scene.add(lines);
  const hp = new Float32Array(N * 3); const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  const hm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: BLEND,
    uniforms: { uColor: { value: color }, uOn: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `uniform float uPx; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = uPx*(${LIGHT ? '16. + 520.' : '8. + 260.'}/-mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOn; void main(){ float d = length(gl_PointCoord-.5);
      float core = smoothstep(.16,.10,d); float glow = smoothstep(.5,.0,d)*.55; gl_FragColor = vec4(mix(uColor, vec3(${LIGHT ? '0.' : '1.'}), core*${LIGHT ? '.25' : '.55'}), (core+glow*${LIGHT ? '.6' : '1.'})*uOn); }`,
  });
  const heads = new THREE.Points(hg, hm); scene.add(heads);
  function update(now) {
    m.uniforms.uNow.value = now;
    const i = Math.floor(now), f = now - i; let k = 0;
    for (let n = 0; n < N; n++) {
      const a = at(Math.min(i, T - 1), n), b = at(Math.min(i + 1, T - 1), n);
      if (a && b && Q[((Math.min(i + 1, T - 1)) * N + n) * 3] !== -32767) { hp[k++] = a[0] + (b[0] - a[0]) * f; hp[k++] = a[1] + (b[1] - a[1]) * f; hp[k++] = a[2] + (b[2] - a[2]) * f; }
      else if (a) { hp[k++] = a[0]; hp[k++] = a[1]; hp[k++] = a[2]; }
    }
    hg.setDrawRange(0, k / 3); hg.attributes.position.needsUpdate = true;
  }
  return { lines, heads, update, set(on) { m.uniforms.uOn.value = on; hm.uniforms.uOn.value = on; lines.visible = heads.visible = on > .002; }, T };
}
const real = crowd(realQ, S.crowd.real, REAL);
const sim = crowd(simQ, S.crowd.predicted, SIM);

/* ---------- stop field: columns that morph between the two disjoint halves ---------- */
const F = S.field; const nF = F.x.length;
const colGeo = new THREE.BoxGeometry(.72, 1, .72); colGeo.translate(0, .5, 0);
const colMat = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0 });
const cols = new THREE.InstancedMesh(colGeo, colMat, nF); scene.add(cols);
const ramp = LIGHT ? (v => new THREE.Color('#f1e2c6').lerp(new THREE.Color('#a8620a'), Math.pow(v, .9)))
                   : (v => new THREE.Color().setRGB(.10 + .85 * v ** .9, .09 + .67 * v ** 1.15, .09 + .40 * v ** 1.7));
for (let i = 0; i < nF; i++) cols.setColorAt(i, ramp(Math.max(F.a[i], F.b[i])));
const dummy = new THREE.Object3D();
function setField(grow, mixB) {
  for (let i = 0; i < nF; i++) {
    const v = F.a[i] + (F.b[i] - F.a[i]) * mixB, h = (.02 + Math.pow(v, 2.6) * 5.2) * grow;
    dummy.position.set(F.x[i], 0, F.z[i]); dummy.scale.set(1, h, 1); dummy.updateMatrix(); cols.setMatrixAt(i, dummy.matrix);
  }
  cols.instanceMatrix.needsUpdate = true; colMat.opacity = Math.min(.94, grow * 1.3); cols.visible = grow > .002;
}
scene.add(new THREE.AmbientLight(0xffffff, .55));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-30, 60, 25); scene.add(sun);

/* ---------- goal belief for one walk ---------- */
const G = S.goalExample;
const gGeo = new THREE.CylinderGeometry(.2, .2, 1, 10); gGeo.translate(0, .5, 0);
const gMat = new THREE.MeshBasicMaterial({ color: SIM, transparent: true, opacity: 0, blending: BLEND, depthWrite: false });
const belief = new THREE.InstancedMesh(gGeo, gMat, G.cells.length); scene.add(belief);
const pathGeo = new THREE.BufferGeometry(); const pathPos = new Float32Array(G.path.length * 3 + 3);
pathGeo.setAttribute('position', new THREE.BufferAttribute(pathPos, 3));
const pathLine = new THREE.Line(pathGeo, new THREE.LineBasicMaterial({ color: REAL, transparent: true, opacity: 0 })); scene.add(pathLine);
const walker = new THREE.Mesh(new THREE.SphereGeometry(.42, 20, 14), new THREE.MeshBasicMaterial({ color: LIGHT ? 0x1d1d1f : 0xffffff, transparent: true, opacity: 0 })); scene.add(walker);
const goalCell = G.cells[G.goal];
const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, .07, 8, 48), new THREE.MeshBasicMaterial({ color: REAL, transparent: true, opacity: 0 }));
ring.rotation.x = Math.PI / 2; ring.position.set(goalCell[0], goalCell[1] + .1, goalCell[2]); scene.add(ring);
function setGoal(on, wt) {
  const T = G.times; let j = 0; while (j < T.length - 2 && T[j + 1] <= wt) j++;
  const a = clamp((wt - T[j]) / (T[j + 1] - T[j]));
  for (let i = 0; i < G.cells.length; i++) {
    const p = Math.exp(Math.log(G.post[j][i] + 1e-6) * (1 - a) + Math.log(G.post[j + 1][i] + 1e-6) * a);
    const h = Math.sqrt(p) * 14 * on, w = p < 6e-4 ? 0 : 1; const c = G.cells[i];
    dummy.position.set(c[0], c[1], c[2]); dummy.scale.set(w, Math.max(h, .001), w); dummy.updateMatrix(); belief.setMatrixAt(i, dummy.matrix);
  }
  belief.instanceMatrix.needsUpdate = true; gMat.opacity = (LIGHT ? .8 : .55) * on; belief.visible = on > .002;
  let k = 0, last = null;
  for (const [t, x, y, z] of G.path) { if (t > wt) break; pathPos[k++] = x; pathPos[k++] = y + .2; pathPos[k++] = z; last = [x, y, z]; }
  const nx = G.path.find(r => r[0] > wt);
  if (last && nx) { const pv = G.path[k / 3 - 1]; const f = clamp((wt - pv[0]) / (nx[0] - pv[0])); last = [last[0] + (nx[1] - last[0]) * f, last[1] + (nx[2] - last[1]) * f, last[2] + (nx[3] - last[2]) * f]; pathPos[k++] = last[0]; pathPos[k++] = last[1] + .2; pathPos[k++] = last[2]; }
  pathGeo.setDrawRange(0, k / 3); pathGeo.attributes.position.needsUpdate = true;
  pathLine.material.opacity = on; walker.material.opacity = on; ring.material.opacity = on * (.6 + .4 * Math.sin(performance.now() / 300));
  if (last) walker.position.set(last[0], last[1] + .45, last[2]);
}

/* ---------- camera choreography ---------- */
const st = G.path[0], gc = goalCell, mid = [(st[1] + gc[0]) / 2, (st[2] + gc[1]) / 2, (st[3] + gc[2]) / 2];
const K = [ // [progress, position, target]
  [0.00, [50, 36, 58], [0, -1.5, 0]],
  [0.10, [46, 36, 52], [0, -1, 0]],
  [0.24, [26, 46, 40], [0, 0, -2]],
  [0.38, [2, 82, 20], [0, 0, 0]],
  [0.47, [-50, 60, 70], [0, -2, 0]],
  [0.56, [-62, 50, 44], [0, -2, 0]],
  [0.60, [-62, 50, 44], [0, -2, 0]],
  [0.63, [mid[0] + 24, mid[1] + 34, mid[2] + 30], mid],
  [0.73, [mid[0] + 16, mid[1] + 28, mid[2] + 26], mid],
  [0.80, [44, 40, -40], [0, 0, 0]],
  [0.92, [36, 50, -46], [0, 0, 0]],
  [1.00, [0, 105, 62], [0, 0, 0]],
  // teaser finale (progress 1 → 2): the four held-out worlds, laid out as tiles
  [1.08, [0, 112, 70], [0, -6, 2]],
  [1.30, [0, 100, 64], [0, -6, 2]],
  [2.00, [0, 94, 60], [0, -6, 2]],
];
const v3 = a => new THREE.Vector3(...a);
// teaser: one smooth spline through the opening keyframes (hero -> walk-in -> corridors), so the camera never pauses at a beat
const OPEN = TEASER ? (() => { const pk = K.filter(k => k[0] <= .38);
  return { ps: pk.map(k => k[0]), pos: new THREE.CatmullRomCurve3(pk.map(k => v3(k[1])), false, 'centripetal'), tgt: new THREE.CatmullRomCurve3(pk.map(k => v3(k[2])), false, 'centripetal') }; })() : null;
function camAt(p) {
  if (OPEN && p < OPEN.ps[OPEN.ps.length - 1]) {
    let i = 0; while (i < OPEN.ps.length - 2 && OPEN.ps[i + 1] <= p) i++;
    const u = (i + (p - OPEN.ps[i]) / (OPEN.ps[i + 1] - OPEN.ps[i])) / (OPEN.ps.length - 1);
    return [OPEN.pos.getPoint(u), OPEN.tgt.getPoint(u)];
  }
  let i = 0; while (i < K.length - 2 && K[i + 1][0] <= p) i++;
  const [p0, a0, t0] = K[i], [p1, a1, t1] = K[i + 1]; const f = ss(p0, p1, p);
  return [v3(a0).lerp(v3(a1), f), v3(t0).lerp(v3(t1), f)];
}

/* ---------- teaser extras: semantic place labels + held-out worlds finale ---------- */
const places = [], tiles = []; let labelLayer = null;
if (EXTRAS) {
  const [PL, HO] = await Promise.all([fetch('media/scene/places.json').then(r => r.json()), fetch('media/scene/heldout.json').then(r => r.json())]);
  labelLayer = document.createElement('div'); labelLayer.className = 'place-labels'; canvas.parentElement.insertBefore(labelLayer, canvas.nextSibling);
  const mk = (html, cls = '') => { const d = document.createElement('div'); d.className = `place ${cls}`; d.innerHTML = `<span>${html}</span><i></i>`; labelLayer.appendChild(d); return d; };
  for (const p of PL) places.push({ el: mk(p.name), pos: new THREE.Vector3(p.pos[0], p.pos[1] + 1.2, p.pos[2]) });
  // held-out worlds: each world's own geometry + 20 minutes of REAL recorded movement (raw telemetry, 1 Hz), no names
  const TILE = 36, layout = [[-40, 8], [0, 8], [40, 8]];
  for (const [k, w] of HO.worlds.entries()) {
    const q = await bin(`media/scene/heldout_${w.world}.i16`);
    const grp = new THREE.Group(); grp.scale.setScalar(TILE / w.span); grp.position.set(layout[k][0], 0, layout[k][1]); scene.add(grp);
    const wp = cloud(q.subarray(0, w.nWall * 3), LIGHT ? '#2a2d33' : '#e4e6ea', .6, 1.0), up = cloud(q.subarray(w.nWall * 3), LIGHT ? '#a7adb5' : '#868b93', .28, .95);
    scene.remove(wp); scene.remove(up); grp.add(wp, up);
    for (const o of [wp, up]) { o.material.uniforms.uBuild.value = 1; o.material.uniforms.uDim.value = 0; o.visible = false; }
    const tq = await bin(`media/scene/tracks_${w.world}.i16`);
    // real movement in amber; where it passes through spots the scene-only model predicted (T1 pred_GO), it turns blue
    const pz = w.cells.map(a => a[4]).filter(v => v > 0).sort((x, y) => x - y), qt = f => pz[Math.floor(f * (pz.length - 1))];
    const lo = qt(.6), hi = qt(.9), key = (x, z) => Math.round(x / w.step) + ',' + Math.round(z / w.step), cellP = new Map();
    for (const a of w.cells) cellP.set(key(a[0], a[2]), Math.min(1, Math.max(0, (a[4] - lo) / (hi - lo))));
    const predAt = (x, z) => { let best = 0; for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) { const v = cellP.get(key(x + dx * w.step, z + dz * w.step)); if (v !== undefined) best = Math.max(best, v * (dx || dz ? .6 : 1)); } return best; };
    const col = REAL.clone();
    const c = crowd(tq, w.tracks, col, predAt); scene.remove(c.lines); scene.remove(c.heads); grp.add(c.lines, c.heads);
    c.set(0);
    tiles.push({ w, grp, wp, up, c, col });
  }
}
function setTiles(on, tNorm, m, all) {
  for (const t of tiles) {
    t.wp.visible = t.up.visible = on > .002; t.wp.material.uniforms.uDim.value = t.up.material.uniforms.uDim.value = on;
    t.c.set(on); t.c.update(tNorm * (t.c.T - 1)); t.c.lines.material.uniforms.uKeep.value = .14;
    t.c.lines.material.uniforms.uMix.value = m;                       // amber -> blue where the scene-only prediction expected people
    t.col.copy(REAL).lerp(SIM, all);                                   // then all of it (and the heads) turns blue: illustrative real -> predicted
  }
}
const _v = new THREE.Vector3();
function placeLabel(el, pos, o) {
  _v.copy(pos).project(camera); const vis = o > .01 && _v.z < 1;
  el.style.visibility = vis ? 'visible' : 'hidden'; if (!vis) return;
  el.style.opacity = o.toFixed(3);
  const x = (_v.x + 1) / 2 * canvas.clientWidth, y = (1 - _v.y) / 2 * canvas.clientHeight;
  el.style.left = `${x.toFixed(1)}px`; el.style.top = `${y.toFixed(1)}px`;
  for (const bt of beats) {                                            // never let a label sit on the visible headline
    if (+bt.style.opacity < .05) continue; const r = bt.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    if (x > r.left - c.left - 40 && x < r.right - c.left + 40 && y > r.top - c.top - 20 && y < r.bottom - c.top + 80) { el.style.visibility = 'hidden'; return; }
  }
}

/* ---------- scroll → state ---------- */
let target = 0, prog = 0, visible = true;
function measure() {
  const r = section.getBoundingClientRect(); const span = section.offsetHeight - innerHeight;
  const s = clamp(-r.top / span), A = 1150 / 1650;                       // story: first 1150vh = progress 0..1, last 500vh = finale 1..2
  target = s < A ? s / A : 1 + (s - A) / (1 - A);
}
addEventListener('scroll', measure, { passive: true });
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(section);
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; ribbonRes.value.set(w * dpr, h * dpr);
  camera.fov = w < 700 ? 52 : 38; camera.updateProjectionMatrix();
  for (const o of [wallPts, floorPts, real.heads, sim.heads, ...tiles.map(t => t.c.heads)]) o.material.uniforms.uPx.value = dpr * (w < 700 ? .8 : 1);
}
addEventListener('resize', resize); resize(); measure();

const fmt = s => { s = Math.floor(s); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const CAPTURE = new URLSearchParams(location.search).has('capture');
function frame(now, fixedP) {
  if (fixedP === undefined) { requestAnimationFrame(frame); if (!visible) return; prog += (target - prog) * (reduce ? 1 : .085); }
  else prog = fixedP;
  const p = prog;
  // chapters
  const realOn = win(p, .10, .43), simOn = win(p, .76, .97);
  const realT = clamp((p - .10) / (.36 - .10)) * (real.T - 1);
  const simT = clamp((p - .78) / (.95 - .78)) * (sim.T - 1);
  real.set(realOn); real.update(realT);
  sim.set(simOn); sim.update(simT);
  real.lines.material.uniforms.uKeep.value = .05 + .10 * ss(.24, .38, p);
  setField(win(p, .41, .575), ss(.50, .55, p));
  setGoal(win(p, .60, .76), clamp((p - .62) / (.73 - .62)) * 8);
  const bcOut = 1 - ss(1.0, 1.08, p);                                   // Black Cat fades out for the finale
  const dimB = (1 - .45 * win(p, .41, .76)) * bcOut; wallPts.material.uniforms.uDim.value = dimB; floorPts.material.uniforms.uDim.value = dimB;
  wallPts.visible = floorPts.visible = bcOut > .002;
  if (EXTRAS) {
    setTiles(ss(1.06, 1.14, p), clamp((p - 1.1) / (2.0 - 1.1)), ss(1.5, 1.72, p), ss(1.62, 1.84, p));
  }
  const build = reduce ? 1 : clamp((now - buildStart) / 2600);
  wallPts.material.uniforms.uBuild.value = floorPts.material.uniforms.uBuild.value = build;
  // camera with a slow idle drift in the opening
  const [pos, tgt] = camAt(p);
  if (!reduce) {
    const hero = 1 - ss(.0, .12, p);
    if (!TEASER) { const a = now / 9000 * hero; pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(a) * .25); }   // no idle orbit in the teaser
    const dolly = 1 - ss(0, 1, (now - buildStart) / 4200);                          // ease in from further out on load
    pos.sub(tgt).multiplyScalar(1 + .55 * dolly * hero).add(tgt);
  }
  if (!TEASER && p > 1) {                                                 // story finale: pull back so all three worlds clear the text column
    const k = ss(1.0, 1.1, p); pos.sub(tgt).multiplyScalar(1 + .45 * k).add(tgt); pos.x -= 14 * k; tgt.x -= 14 * k; }
  camera.position.copy(pos); camera.lookAt(tgt);
  if (EXTRAS) {                                                          // labels follow the camera of this frame
    camera.updateMatrixWorld();
    const lo = win(p, .60, .985, .015);
    for (const pl of places) placeLabel(pl.el, pl.pos, lo);
  }
  // overlay
  beats.forEach(b => { const o = win(p, +b.dataset.in, +b.dataset.out, TEASER ? .007 : .018); b.style.opacity = o.toFixed(3); b.style.setProperty('--ty', TEASER ? '0px' : `${((1 - o) * 18).toFixed(1)}px`); b.style.visibility = o < .01 ? 'hidden' : 'visible'; });
  const chap = [.10, .24, .41, .50, .60, .76, .9].filter(x => p >= x - .01).length;
  rail.forEach((d, i) => d.classList.toggle('on', i < chap));
  if (realOn > .3) hudTime.textContent = `${fmt(1200 + realT)} · real`;
  else if (simOn > .3) hudTime.textContent = `${fmt(1200 + simT)} · simulated`;
  else hudTime.textContent = '';
  hudLegend.forEach(l => l.classList.toggle('on', (l.dataset.hudKey === 'real' ? realOn : simOn) > .3));
  renderer.render(scene, camera);
}
if (CAPTURE) {
  // deterministic teaser capture: render one frame at scroll progress p and clock t (seconds since load)
  document.documentElement.classList.add('capture');
  if (new URLSearchParams(location.search).has('notext')) document.documentElement.classList.add('notext');
  window.storyRender = (p, t) => { frame(buildStart + t * 1000, p); return true; };
  window.storyReady = true;
} else requestAnimationFrame(frame);
