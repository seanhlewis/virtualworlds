/* Academic page behaviour: carousel, lazy video playback, 3D replay launcher. */
(() => {
  const load = v => { if (!v.src && v.dataset.src) { v.src = v.dataset.src; v.preload = 'auto'; } };

  // walk-in carousel (bulma-carousel, as in the Nerfies template)
  if (window.bulmaCarousel) bulmaCarousel.attach('#walkin-carousel', { slidesToScroll: 1, slidesToShow: innerWidth < 769 ? 1 : 2, loop: true, autoplay: false, infinite: true });

  // play videos only while visible
  const io = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target; if (e.isIntersecting) { load(v); v.play().catch(() => {}); } else v.pause();
  }), { threshold: .25 });
  document.querySelectorAll('video[data-src]').forEach(v => io.observe(v));

  // interactive 3D walk-ins (viser recordings, EgoMo3R-style viewer in interactive/): start as soon as the section scrolls into view.
  // The previous first-person replay (replay/versions/v014w_walkins_20261002/viewer) is kept unchanged.
  const launch = document.getElementById('launch');
  if (launch) {
    const start = () => {
      const dark = document.documentElement.classList.contains('dark') || /index_dark/.test(location.pathname);
      const f = document.createElement('iframe'); f.title = 'Interactive 3D walk-ins'; f.allow = 'fullscreen; autoplay';
      f.src = 'interactive/index.html?seq=0&embed' + (dark ? '&dark' : '');
      launch.classList.add('live'); launch.replaceChildren(f);
    };
    const lio = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { lio.disconnect(); start(); } }, { rootMargin: '200px 0px', threshold: .01 });
    lio.observe(launch);
  }
})();
