/*
 * Injects the aggregation pipeline behind each dashboard panel.
 *
 * Any element carrying data-pipeline="<key>" is filled from window.BDMA_PIPELINES.
 * Keeping the markup to a single attribute means the pipelines live in exactly one
 * place (assets/js/pipelines.js, which is generated and verified against the data)
 * and cannot drift from the chart they claim to produce.
 */
(function () {
  'use strict';

  var COLLECTION = 'bdma.rides';

  // Escape first, then highlight, so no user-visible text can inject markup.
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // One tokenizing pass with alternation. Chained .replace() calls would re-scan
  // the markup they just inserted and highlight the class names inside it.
  var TOKENS = /("\$[A-Za-z_][\w.]*")|("[^"]*")|(\$[A-Za-z]+)|(\b\d+(?:\.\d+)?\b)/g;

  function highlight(src) {
    return esc(src).replace(TOKENS, function (m, field, str, op, num) {
      if (field) return '<span class="f">' + field + '</span>';
      if (str) return '<span class="s">' + str + '</span>';
      if (op) return '<span class="k">' + op + '</span>';
      return '<span class="n">' + num + '</span>';
    });
  }

  function copyButton(text) {
    var b = document.createElement('button');
    b.className = 'pipe-copy';
    b.type = 'button';
    b.textContent = 'Copy';
    b.addEventListener('click', function () {
      var full = 'db.rides.aggregate(' + text + ')';
      var done = function () {
        b.textContent = 'Copied';
        b.classList.add('done');
        setTimeout(function () {
          b.textContent = 'Copy';
          b.classList.remove('done');
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(full).then(done, function () { fallback(full, done); });
      } else {
        fallback(full, done);
      }
    });
    return b;
  }

  // execCommand is deprecated but is the only path on file:// and older Safari,
  // where the async clipboard API is unavailable or refuses a non-secure origin.
  function fallback(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:absolute;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* clipboard blocked */ }
    document.body.removeChild(ta);
  }

  function build(host, spec) {
    var d = document.createElement('details');
    d.className = 'pipeline';

    var s = document.createElement('summary');
    s.innerHTML = 'View the aggregation'
      + '<span class="pipe-chart">' + esc(spec.chart) + '</span>';
    d.appendChild(s);

    var body = document.createElement('div');
    body.className = 'pipeline-body';

    var bar = document.createElement('div');
    bar.className = 'pipeline-bar';
    var coll = document.createElement('span');
    coll.className = 'pipe-coll';
    coll.textContent = COLLECTION;
    bar.appendChild(coll);
    bar.appendChild(copyButton(spec.pipeline));
    body.appendChild(bar);

    var pre = document.createElement('pre');
    var code = document.createElement('code');
    code.innerHTML = highlight(spec.pipeline);
    pre.appendChild(code);
    body.appendChild(pre);

    if (spec.encodings && spec.encodings.length) {
      var enc = document.createElement('div');
      enc.className = 'pipe-enc';
      spec.encodings.forEach(function (pair) {
        var row = document.createElement('div');
        var b = document.createElement('b');
        b.textContent = pair[0];
        var v = document.createElement('span');
        v.textContent = pair[1];
        row.appendChild(b);
        row.appendChild(v);
        enc.appendChild(row);
      });
      body.appendChild(enc);
    }

    if (spec.note) {
      var note = document.createElement('div');
      note.className = 'pipe-note';
      note.textContent = spec.note;
      body.appendChild(note);
    }

    d.appendChild(body);
    host.appendChild(d);
  }

  function boot() {
    var specs = window.BDMA_PIPELINES;
    if (!specs) return;
    var hosts = document.querySelectorAll('[data-pipeline]');
    for (var i = 0; i < hosts.length; i++) {
      var spec = specs[hosts[i].getAttribute('data-pipeline')];
      if (spec) build(hosts[i], spec);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
