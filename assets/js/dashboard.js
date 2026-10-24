/* BDMA — Uber ride-analytics dashboard renderer.
   Zero dependencies. Charts are hand-built SVG so the whole page is one
   static file tree that works on GitHub Pages and straight off disk.

   Colours are emitted as inline `style="fill:var(--x)"` rather than SVG
   presentation attributes, because presentation attributes do not accept
   CSS custom properties — this way the charts re-colour on a theme switch
   with no re-render. */

(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  /* Categorical palette. Fixed hex values chosen to stay legible on both the
     dark and light themes, unlike the theme-dependent accent variables. */
  var SERIES = ['#14b8a6', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#64748b', '#22c55e'];

  var STATUS_COLOUR = {
    'Completed': '#16a34a',
    'Cancelled by Driver': '#ef4444',
    'Cancelled by Customer': '#f59e0b',
    'No Driver Found': '#a855f7',
    'Incomplete': '#64748b'
  };

  // ---------------------------------------------------------------- helpers

  function el(tag, attrs, text) {
    var node = document.createElementNS(NS, tag);
    for (var k in attrs) {
      if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svg(w, h) {
    var s = el('svg', {
      viewBox: '0 0 ' + w + ' ' + h,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img'
    });
    return s;
  }

  function label(x, y, text, opts) {
    opts = opts || {};
    return el('text', {
      x: x, y: y,
      'text-anchor': opts.anchor || 'middle',
      'dominant-baseline': opts.baseline || 'auto',
      'font-size': opts.size || 10,
      'font-weight': opts.weight || 400,
      'font-family': opts.mono ? "'JetBrains Mono', ui-monospace, monospace" : "'Inter', system-ui, sans-serif",
      style: 'fill:var(' + (opts.colour || '--text2') + ')'
    }, text);
  }

  function nInt(v) { return Math.round(v).toLocaleString('en-IN'); }

  /* Indian numbering: 13,33,539 rather than 1,333,539. The audience reads
     lakhs and crores, and the dataset is priced in rupees. */
  function rupees(v) { return '\u20B9' + Math.round(v).toLocaleString('en-IN'); }

  function rupeesShort(v) {
    if (v >= 10000000) return '\u20B9' + (v / 10000000).toFixed(2) + ' Cr';
    if (v >= 100000) return '\u20B9' + (v / 100000).toFixed(2) + ' L';
    if (v >= 1000) return '\u20B9' + (v / 1000).toFixed(1) + 'k';
    return '\u20B9' + Math.round(v);
  }

  function pct(v) { return v.toFixed(2) + '%'; }

  function hourLabel(h) { return (h < 10 ? '0' + h : String(h)) + ':00'; }

  function niceMax(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] * mag >= v) return steps[i] * mag;
    }
    return 10 * mag;
  }

  function mount(id, node) {
    var host = document.getElementById(id);
    if (!host) return;
    host.innerHTML = '';
    host.appendChild(node);
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function html(id, markup) {
    var node = document.getElementById(id);
    if (node) node.innerHTML = markup;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ------------------------------------------------------------------- KPIs

  function renderKpis(k) {
    setText('kpiTotal', nInt(k.total_bookings));
    setText('kpiCompletion', pct(k.completion_rate_pct));
    setText('kpiCompletionNote', nInt(k.completed_bookings) + ' of ' + nInt(k.total_bookings) + ' bookings completed');
    setText('kpiFailure', pct(k.failure_rate_pct));
    setText('kpiFailureNote', nInt(k.failed_bookings) + ' bookings never carried a passenger');
    setText('kpiLost', rupeesShort(k.lost_revenue_estimate));
    setText('kpiLostNote', 'Exactly ' + rupees(k.lost_revenue_estimate) + ' at the average completed fare');
    setText('kpiRevenue', rupeesShort(k.completed_booking_value));
    setText('kpiRevenueNote', 'Recognised revenue from completed rides only');
    setText('kpiAvgValue', rupees(k.avg_booking_value));
    setText('kpiAvgDistance', k.avg_distance_km.toFixed(2) + ' km');
    setText('kpiVtat', k.avg_vtat_min.toFixed(2) + ' min');
    setText('kpiRating', k.avg_driver_rating.toFixed(2));
    setText('kpiRatingNote', 'Customers rate drivers ' + k.avg_driver_rating.toFixed(2) +
      ' \u00B7 drivers rate customers ' + k.avg_customer_rating.toFixed(2));
  }

  // ------------------------------------------------------- donut: status mix

  function renderStatusDonut(rows) {
    var W = 420, H = 230, cx = 115, cy = 115, rOuter = 92, rInner = 56;
    var s = svg(W, H);
    var total = rows.reduce(function (a, r) { return a + r.bookings; }, 0);
    var angle = -Math.PI / 2;

    rows.forEach(function (r) {
      var sweep = (r.bookings / total) * Math.PI * 2;
      var end = angle + sweep;
      var large = sweep > Math.PI ? 1 : 0;
      var x1 = cx + rOuter * Math.cos(angle), y1 = cy + rOuter * Math.sin(angle);
      var x2 = cx + rOuter * Math.cos(end), y2 = cy + rOuter * Math.sin(end);
      var x3 = cx + rInner * Math.cos(end), y3 = cy + rInner * Math.sin(end);
      var x4 = cx + rInner * Math.cos(angle), y4 = cy + rInner * Math.sin(angle);
      var d = [
        'M', x1, y1,
        'A', rOuter, rOuter, 0, large, 1, x2, y2,
        'L', x3, y3,
        'A', rInner, rInner, 0, large, 0, x4, y4,
        'Z'
      ].join(' ');
      var path = el('path', { d: d, fill: STATUS_COLOUR[r.status] || '#64748b' });
      path.appendChild(el('title', {}, r.status + ': ' + nInt(r.bookings) + ' (' + pct(r.share_pct) + ')'));
      s.appendChild(path);
      angle = end;
    });

    var done = rows.filter(function (r) { return r.status === 'Completed'; })[0];
    s.appendChild(label(cx, cy - 2, done ? pct(done.share_pct) : '', {
      size: 22, weight: 700, colour: '--text', baseline: 'middle', mono: true
    }));
    s.appendChild(label(cx, cy + 20, 'completed', { size: 10, baseline: 'middle' }));

    // Legend sits in the SVG so it stays aligned with the donut at any width.
    var ly = 34;
    rows.forEach(function (r) {
      s.appendChild(el('rect', { x: 232, y: ly - 9, width: 10, height: 10, rx: 2, fill: STATUS_COLOUR[r.status] || '#64748b' }));
      s.appendChild(label(250, ly, r.status, { anchor: 'start', size: 11, colour: '--text' }));
      s.appendChild(label(250, ly + 15, nInt(r.bookings) + '  \u00B7  ' + pct(r.share_pct), { anchor: 'start', size: 10, mono: true }));
      ly += 38;
    });

    return s;
  }

  // ------------------------------------- combo: hourly volume + failure rate

  function renderHourly(rows) {
    var W = 760, H = 300;
    var ml = 46, mr = 46, mt = 18, mb = 42;
    var pw = W - ml - mr, ph = H - mt - mb;
    var s = svg(W, H);

    var maxB = niceMax(Math.max.apply(null, rows.map(function (r) { return r.bookings; })));
    var busiest = rows.reduce(function (a, r) { return r.bookings > a.bookings ? r : a; });

    /* The worst failure rate in the whole day is 03:00 — on 46 bookings. That is
       a small-sample artifact, not a finding, so we flag the worst hour among
       those carrying real volume and call the 03:00 trap out separately. */
    var VOLUME_FLOOR = 1000;
    var busy = rows.filter(function (r) { return r.bookings >= VOLUME_FLOOR; });
    var worst = busy.reduce(function (a, r) { return r.failure_rate_pct > a.failure_rate_pct ? r : a; });
    var noisiest = rows.reduce(function (a, r) { return r.failure_rate_pct > a.failure_rate_pct ? r : a; });

    // horizontal gridlines + left axis (bookings)
    for (var g = 0; g <= 4; g++) {
      var v = (maxB / 4) * g;
      var y = mt + ph - (v / maxB) * ph;
      s.appendChild(el('line', {
        x1: ml, y1: y, x2: ml + pw, y2: y,
        style: 'stroke:var(--border)', 'stroke-width': 1
      }));
      s.appendChild(label(ml - 8, y + 3, nInt(v), { anchor: 'end', size: 9, mono: true }));
    }

    var bw = pw / rows.length;
    rows.forEach(function (r, i) {
      var h = (r.bookings / maxB) * ph;
      var x = ml + i * bw + bw * 0.16;
      var w = bw * 0.68;
      var isPeak = r.hour === busiest.hour;
      var isWorst = r.hour === worst.hour;
      var rect = el('rect', {
        x: x, y: mt + ph - h, width: w, height: Math.max(h, 1), rx: 2,
        fill: isWorst ? '#ef4444' : (isPeak ? '#14b8a6' : null),
        style: (isWorst || isPeak) ? null : 'fill:var(--accent)',
        opacity: (isWorst || isPeak) ? 1 : 0.55
      });
      rect.appendChild(el('title', {}, hourLabel(r.hour) + ' \u2014 ' + nInt(r.bookings) +
        ' bookings, ' + pct(r.failure_rate_pct) + ' fail'));
      s.appendChild(rect);
      if (r.hour % 3 === 0) {
        s.appendChild(label(ml + i * bw + bw / 2, mt + ph + 16, hourLabel(r.hour), { size: 9, mono: true }));
      }
    });

    // failure-rate line on a right-hand axis
    var fMin = 20, fMax = 50;
    var pts = rows.map(function (r, i) {
      var y = mt + ph - ((r.failure_rate_pct - fMin) / (fMax - fMin)) * ph;
      return [ml + i * bw + bw / 2, y];
    });
    s.appendChild(el('polyline', {
      points: pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '),
      fill: 'none', stroke: '#f59e0b', 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));
    pts.forEach(function (p, i) {
      var dot = el('circle', { cx: p[0], cy: p[1], r: rows[i].hour === worst.hour ? 4.5 : 2.4, fill: '#f59e0b' });
      dot.appendChild(el('title', {}, hourLabel(rows[i].hour) + ' \u2014 ' + pct(rows[i].failure_rate_pct) + ' failure rate'));
      s.appendChild(dot);
    });
    for (var f = fMin; f <= fMax; f += 10) {
      var fy = mt + ph - ((f - fMin) / (fMax - fMin)) * ph;
      s.appendChild(label(ml + pw + 8, fy + 3, f + '%', { anchor: 'start', size: 9, mono: true }));
    }

    s.appendChild(label(ml, mt - 6, 'Bookings', { anchor: 'start', size: 9, weight: 600 }));
    s.appendChild(label(ml + pw, mt - 6, 'Failure rate', { anchor: 'end', size: 9, weight: 600 }));
    s.appendChild(label(W / 2, H - 6, 'Hour of day (booking time)', { size: 10 }));

    return { svg: s, worst: worst, busiest: busiest, noisiest: noisiest, floor: VOLUME_FLOOR };
  }

  // ------------------------------------------ monthly volume + revenue line

  function renderMonthly(rows) {
    var W = 760, H = 260;
    var ml = 52, mr = 56, mt = 20, mb = 40;
    var pw = W - ml - mr, ph = H - mt - mb;
    var s = svg(W, H);

    var maxB = niceMax(Math.max.apply(null, rows.map(function (r) { return r.bookings; })));
    var maxR = niceMax(Math.max.apply(null, rows.map(function (r) { return r.revenue; })));

    for (var g = 0; g <= 4; g++) {
      var v = (maxB / 4) * g;
      var y = mt + ph - (v / maxB) * ph;
      s.appendChild(el('line', { x1: ml, y1: y, x2: ml + pw, y2: y, style: 'stroke:var(--border)', 'stroke-width': 1 }));
      s.appendChild(label(ml - 8, y + 3, nInt(v), { anchor: 'end', size: 9, mono: true }));
      s.appendChild(label(ml + pw + 8, y + 3, rupeesShort((maxR / 4) * g), { anchor: 'start', size: 9, mono: true }));
    }

    var bw = pw / rows.length;
    rows.forEach(function (r, i) {
      var h = (r.bookings / maxB) * ph;
      var rect = el('rect', {
        x: ml + i * bw + bw * 0.2, y: mt + ph - h,
        width: bw * 0.6, height: Math.max(h, 1), rx: 3,
        style: 'fill:var(--accent)', opacity: 0.55
      });
      rect.appendChild(el('title', {}, r.month + ' \u2014 ' + nInt(r.bookings) + ' bookings, ' +
        nInt(r.completed) + ' completed, ' + rupees(r.revenue)));
      s.appendChild(rect);
      s.appendChild(label(ml + i * bw + bw / 2, mt + ph + 16, r.month.slice(5), { size: 9, mono: true }));
    });

    var pts = rows.map(function (r, i) {
      return [ml + i * bw + bw / 2, mt + ph - (r.revenue / maxR) * ph];
    });
    s.appendChild(el('polyline', {
      points: pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '),
      fill: 'none', stroke: '#3b82f6', 'stroke-width': 2, 'stroke-linejoin': 'round'
    }));
    pts.forEach(function (p, i) {
      var dot = el('circle', { cx: p[0], cy: p[1], r: 3, fill: '#3b82f6' });
      dot.appendChild(el('title', {}, rows[i].month + ' \u2014 ' + rupees(rows[i].revenue)));
      s.appendChild(dot);
    });

    s.appendChild(label(ml, mt - 7, 'Bookings', { anchor: 'start', size: 9, weight: 600 }));
    s.appendChild(label(ml + pw, mt - 7, 'Revenue', { anchor: 'end', size: 9, weight: 600 }));
    s.appendChild(label(W / 2, H - 5, 'Month of 2024', { size: 10 }));

    return s;
  }

  // ------------------------------------------------- HTML ranked bar lists

  function rankList(rows, opts) {
    var max = Math.max.apply(null, rows.map(opts.value));
    return rows.map(function (r) {
      var v = opts.value(r);
      var w = max > 0 ? (v / max) * 100 : 0;
      return '' +
        '<div class="rank-row">' +
          '<div class="rank-top">' +
            '<span class="rank-name">' + esc(opts.name(r)) + '</span>' +
            '<span class="rank-val">' + esc(opts.display(r)) + '</span>' +
          '</div>' +
          '<div class="rank-track"><div class="rank-fill' +
            (opts.tone ? ' ' + opts.tone : '') +
            '" style="width:' + w.toFixed(1) + '%"></div></div>' +
        '</div>';
    }).join('');
  }

  // --------------------------------------------------------------- vehicles

  function renderVehicleTable(rows) {
    var sorted = rows.slice().sort(function (a, b) { return b.revenue - a.revenue; });
    return sorted.map(function (r) {
      var weak = r.completion_rate_pct < 62.29;
      return '' +
        '<tr>' +
          '<td>' + esc(r.vehicle_type) + '</td>' +
          '<td class="num">' + nInt(r.bookings) + '</td>' +
          '<td class="num' + (weak ? ' flag' : '') + '">' + pct(r.completion_rate_pct) + '</td>' +
          '<td class="num">' + rupees(r.avg_booking_value) + '</td>' +
          '<td class="num">' + r.avg_distance_km.toFixed(2) + '</td>' +
          '<td class="num">' + rupees(r.revenue) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderPickupTable(rows) {
    return rows.map(function (r) {
      var hot = r.cancellation_rate_pct >= 33;
      return '' +
        '<tr>' +
          '<td>' + esc(r.location) + '</td>' +
          '<td class="num">' + nInt(r.bookings) + '</td>' +
          '<td class="num">' + nInt(r.cancelled) + '</td>' +
          '<td class="num' + (hot ? ' flag' : '') + '">' + pct(r.cancellation_rate_pct) + '</td>' +
          '<td class="num">' + rupees(r.revenue) + '</td>' +
        '</tr>';
    }).join('');
  }

  // ------------------------------------------------------------------ boot

  function render(data) {
    var k = data.kpis;

    renderKpis(k);

    mount('chartStatus', renderStatusDonut(data.status_breakdown));

    var hourly = renderHourly(data.by_hour);
    mount('chartHourly', hourly.svg);
    html('insightHourly',
      '<strong>Volume is not risk.</strong> ' + hourLabel(hourly.busiest.hour) + ' is the busiest hour at ' +
      nInt(hourly.busiest.bookings) + ' bookings and fails ' + pct(hourly.busiest.failure_rate_pct) +
      ' of the time. But ' + hourLabel(hourly.worst.hour) + ' — one hour earlier, and still carrying ' +
      nInt(hourly.worst.bookings) + ' bookings — fails ' + pct(hourly.worst.failure_rate_pct) +
      '. Supply is thinnest just <em>before</em> the evening peak, not during it. That hour is where an ' +
      'incentive would pay for itself.');
    html('insightHourlyTrap',
      '<strong>Read the sample size before you read the rate.</strong> The highest failure rate on this ' +
      'chart is actually ' + hourLabel(hourly.noisiest.hour) + ' at ' + pct(hourly.noisiest.failure_rate_pct) +
      ' — but it rests on just ' + nInt(hourly.noisiest.bookings) + ' bookings, so a handful of ' +
      'cancellations swings it by whole percentage points. We flag ' + hourLabel(hourly.worst.hour) +
      ' instead because it clears ' + nInt(hourly.floor) + ' bookings. A dashboard that ranks by rate ' +
      'alone will send you chasing noise at 3 a.m.');

    mount('chartMonthly', renderMonthly(data.by_month));

    html('rankVehicle', rankList(
      data.by_vehicle.slice().sort(function (a, b) { return b.revenue - a.revenue; }),
      {
        name: function (r) { return r.vehicle_type; },
        value: function (r) { return r.revenue; },
        display: function (r) { return rupeesShort(r.revenue) + '  \u00B7  ' + pct(r.completion_rate_pct); }
      }
    ));

    html('rankPayment', rankList(data.payment_methods, {
      tone: 'blue',
      name: function (r) { return r.method; },
      value: function (r) { return r.bookings; },
      display: function (r) { return nInt(r.bookings) + '  \u00B7  ' + pct(r.share_pct); }
    }));

    html('rankDriverReasons', rankList(data.cancellation_reasons.driver, {
      tone: 'warn',
      name: function (r) { return r.reason; },
      value: function (r) { return r.count; },
      display: function (r) { return nInt(r.count) + '  \u00B7  ' + pct(r.share_pct); }
    }));

    html('rankCustomerReasons', rankList(data.cancellation_reasons.customer, {
      name: function (r) { return r.reason; },
      value: function (r) { return r.count; },
      display: function (r) { return nInt(r.count) + '  \u00B7  ' + pct(r.share_pct); }
    }));

    html('tableVehicle', renderVehicleTable(data.by_vehicle));
    html('tablePickup', renderPickupTable(data.top_pickups));

    var driverTop = data.cancellation_reasons.driver[0];
    html('insightDriver',
      '<strong>Driver cancellations are the single largest leak.</strong> ' +
      'They account for ' + pct(data.status_breakdown.filter(function (r) {
        return r.status === 'Cancelled by Driver';
      })[0].share_pct) + ' of all bookings, and no single reason dominates \u2014 the top reason, &ldquo;' +
      esc(driverTop.reason) + '&rdquo;, is only ' + pct(driverTop.share_pct) +
      ' of them. There is no one fix; there are four roughly equal ones.');

    setText('dashGenerated', data.generated_at);
    setText('dashSource', data.source_note || '');
  }

  function boot() {
    if (!window.BDMA_SUMMARY) {
      html('dashBody',
        '<div class="dash-state">Could not load <code>data/uber_summary.js</code>.<br />' +
        'Regenerate it with <code>node data/generate_uber_dataset.js</code> from the repository root.</div>');
      return;
    }
    try {
      render(window.BDMA_SUMMARY);
    } catch (err) {
      html('dashBody', '<div class="dash-state">Dashboard failed to render: <code>' +
        esc(err && err.message ? err.message : String(err)) + '</code></div>');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
