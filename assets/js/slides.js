/* BDMA — minimal slide deck engine.
   Markup contract: a `.deck` container holding `section.slide` elements.
   Keyboard: ← → Space Home End. Also supports click zones, swipe and `?s=` deep links. */
(function () {
  var slides, index = 0, counter, fill, hint;

  function show(i) {
    if (!slides.length) return;
    index = Math.max(0, Math.min(i, slides.length - 1));
    slides.forEach(function (s, n) { s.classList.toggle('active', n === index); });
    if (counter) counter.textContent = (index + 1) + ' / ' + slides.length;
    if (fill) fill.style.width = ((index + 1) / slides.length * 100) + '%';
    var active = slides[index];
    if (active) active.scrollTop = 0;
    try {
      history.replaceState(null, '', location.pathname + '?s=' + (index + 1) + location.hash);
    } catch (e) { /* file:// protocol */ }
  }

  function next() { show(index + 1); }
  function prev() { show(index - 1); }

  function init() {
    slides = Array.prototype.slice.call(document.querySelectorAll('.deck .slide'));
    counter = document.getElementById('slideCounter');
    fill = document.getElementById('progressFill');
    hint = document.querySelector('.deck-hint');
    if (!slides.length) return;

    var start = parseInt(new URLSearchParams(location.search).get('s'), 10);
    show(isNaN(start) ? 0 : start - 1);

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
      else if (e.key === 'Home') { e.preventDefault(); show(0); }
      else if (e.key === 'End') { e.preventDefault(); show(slides.length - 1); }
      else if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); }
    });

    var prevZone = document.querySelector('.nav-zone.prev');
    var nextZone = document.querySelector('.nav-zone.next');
    if (prevZone) prevZone.addEventListener('click', prev);
    if (nextZone) nextZone.addEventListener('click', next);

    var startX = null;
    document.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 60) { dx < 0 ? next() : prev(); }
      startX = null;
    }, { passive: true });

    if (hint) setTimeout(function () { hint.style.display = 'none'; }, 4000);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () { /* denied */ });
  }
  window.toggleFullscreen = toggleFullscreen;
  window.deckNext = next;
  window.deckPrev = prev;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
