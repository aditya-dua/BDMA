/* Shared dark/light theme toggle. Persisted under the `bdma-theme` key. */
(function () {
  var KEY = 'bdma-theme';

  function paint(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var icon = document.getElementById('themeIcon');
    var label = document.getElementById('themeLabel');
    // The button offers the *other* theme, so the label is inverted.
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    if (label) label.textContent = theme === 'dark' ? 'Light' : 'Dark';
    document.dispatchEvent(new CustomEvent('bdma:themechange', { detail: { theme: theme } }));
  }

  window.toggleTheme = function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
    paint(next);
  };

  var saved;
  try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
  var initial = saved || 'dark';
  document.documentElement.setAttribute('data-theme', initial);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { paint(initial); });
  } else {
    paint(initial);
  }
})();
