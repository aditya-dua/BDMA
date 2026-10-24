/* BDMA — live filter for the command reference page. */

(function () {
  'use strict';

  function boot() {
    var input = document.getElementById('cmdSearch');
    var count = document.getElementById('cmdCount');
    if (!input) return;

    var groups = Array.prototype.slice.call(document.querySelectorAll('.cmd-group'));
    var rows = Array.prototype.slice.call(document.querySelectorAll('.cmd-row')).map(function (row) {
      return { node: row, text: row.textContent.toLowerCase() };
    });
    var empty = document.getElementById('cmdEmpty');
    var total = rows.length;

    function apply() {
      var q = input.value.trim().toLowerCase();
      var terms = q ? q.split(/\s+/) : [];
      var shown = 0;

      rows.forEach(function (r) {
        var hit = terms.every(function (t) { return r.text.indexOf(t) !== -1; });
        r.node.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });

      // Hide a section header once every command under it is filtered out.
      groups.forEach(function (g) {
        var visible = Array.prototype.slice.call(g.querySelectorAll('.cmd-row'))
          .some(function (n) { return n.style.display !== 'none'; });
        g.style.display = visible ? '' : 'none';
      });

      if (empty) empty.style.display = shown === 0 ? '' : 'none';
      if (count) {
        count.textContent = terms.length === 0
          ? total + ' commands'
          : shown + ' of ' + total + ' commands match \u201C' + input.value.trim() + '\u201D';
      }
    }

    input.addEventListener('input', apply);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; apply(); }
    });
    apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
