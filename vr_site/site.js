/* Page behaviour outside the 3D story: nav, reveals, gallery, replay launcher, synced viewer, lightbox, cite. */
(() => {
  const load = v => { if (!v.src && v.dataset.src) { v.src = v.dataset.src; v.preload = 'auto'; } };

  /* nav turns solid once the hero title has scrolled away */
  const nav = document.querySelector('.nav');
  const onScroll = () => nav.classList.toggle('solid', scrollY > innerHeight * .6);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* gentle reveal */
  const ro = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(el => ro.observe(el));

  /* gallery: play in view, click to enlarge */
  const io = new IntersectionObserver(es => es.forEach(e => { const v = e.target.querySelector('video'); if (e.isIntersecting) { load(v); v.play().catch(() => {}); } else v.pause(); }), { threshold: .4 });
  document.querySelectorAll('.media-card').forEach(card => {
    io.observe(card);
    const open = () => openLightbox(Object.assign(document.createElement('video'), { src: card.querySelector('video').dataset.src, controls: true, autoplay: true, muted: true, loop: true, playsInline: true }));
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });

  /* interactive replay: load only on request (it is ~230 MB) */
  const launch = document.getElementById('launch');
  document.getElementById('launch-btn')?.addEventListener('click', () => {
    const f = document.createElement('iframe'); f.title = 'Interactive first-person replay'; f.allow = 'fullscreen';
    f.src = 'replay/versions/v014w_walkins_20261002/viewer/egonav_walkin_replay.html?clip=bc_bar_counter';
    launch.classList.add('live'); launch.appendChild(f);
    // restyle the viewer's debug HUD into a minimal player bar (same origin; the viewer file itself stays untouched)
    f.addEventListener('load', () => {
      const doc = f.contentDocument; if (!doc) return;
      const st = doc.createElement('style');
      st.textContent = `
        .egonav-hud { left: 50% !important; right: auto !important; bottom: 22px !important; transform: translateX(-50%);
          width: min(560px, calc(100vw - 32px)) !important; padding: 8px 10px 8px 8px !important; border: 1px solid rgba(255,255,255,.12) !important;
          border-radius: 999px !important; background: rgba(20,20,22,.72) !important; backdrop-filter: saturate(160%) blur(18px) !important;
          font: 500 12px/1 Inter, system-ui, -apple-system, "Segoe UI", sans-serif !important; color: #c7c7cc !important; }
        .egonav-hud > strong, .egonav-hud > br { display: none !important; }
        .egonav-hud > #egonavState { display: none !important; }
        .egonav-hud.loading > #egonavState { display: block !important; padding: 6px 12px; color: #8e8e93; }
        .egonav-controls { margin: 0 !important; gap: 14px !important; grid-template-columns: auto 1fr auto !important; }
        #egonavPlay { height: 34px; padding: 0 18px; border: 0; border-radius: 999px; background: #f5f5f7; color: #050506; font: 500 13px Inter, system-ui, sans-serif; cursor: pointer; text-transform: capitalize; }
        #egonavPlay:hover { background: #fff; }
        #egonavTime { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 4px; background: rgba(255,255,255,.18); outline: none; }
        #egonavTime::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #f5f5f7; box-shadow: 0 0 0 4px rgba(245,245,247,.15); cursor: ew-resize; }
        #egonavTime::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: #f5f5f7; }
        #egonavOut { min-width: 64px; padding-right: 8px; color: #8e8e93; font-variant-numeric: tabular-nums; text-align: right; }`;
      doc.head.appendChild(st);
      const hud = doc.getElementById('egonavHud');
      const tick = () => { const s = doc.getElementById('egonavState'); hud?.classList.toggle('loading', !doc.body.dataset.egonavReady); if (!doc.body.dataset.egonavReady) setTimeout(tick, 300); };
      tick();
    });
  });

  /* synced real/simulated viewer */
  const gp = document.getElementById('gp'); const vids = [...gp.querySelectorAll('video')];
  const lead = () => gp.querySelector('video.on');
  setInterval(() => { const l = lead(); if (!l.paused) vids.forEach(v => { if (v !== l && Math.abs(v.currentTime - l.currentTime) > .2) v.currentTime = l.currentTime; }); }, 1000);
  document.querySelectorAll('[data-sync="gp"] button').forEach(b => b.addEventListener('click', () => {
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    const t = lead().currentTime; vids.forEach(v => { v.classList.toggle('on', v.dataset.key === b.dataset.key); v.currentTime = t; });
  }));
  new IntersectionObserver(([e]) => { if (e.isIntersecting) { vids.forEach(load); const t = lead().currentTime; vids.forEach(v => { v.currentTime = t; v.play().catch(() => {}); }); } else vids.forEach(v => v.pause()); }, { threshold: .25 }).observe(gp);

  /* lightbox */
  const lb = document.createElement('dialog'); lb.className = 'lightbox'; lb.innerHTML = '<div class="sheet"></div>'; document.body.appendChild(lb);
  const sheet = lb.querySelector('.sheet');
  function openLightbox(node) { sheet.replaceChildren(node); document.body.classList.add('lb-open'); lb.showModal(); }
  lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
  lb.addEventListener('close', () => { sheet.replaceChildren(); document.body.classList.remove('lb-open'); });
  document.querySelectorAll('.plot img').forEach(img => img.addEventListener('click', () => openLightbox(Object.assign(new Image(), { src: img.src, alt: img.alt }))));

  /* cite */
  const cite = document.getElementById('cite-toggle'), panel = document.getElementById('citation-panel');
  cite.addEventListener('click', () => { panel.hidden = !panel.hidden; cite.setAttribute('aria-expanded', String(!panel.hidden)); });
})();
