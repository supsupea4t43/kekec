// Client-side search, DESIGN.md §4.1 item 1: "Real search. Client-side over the JSON,
// no backend. Names, regions, trailheads."
//
// Progressive enhancement: the input is in the static HTML and simply does nothing
// until this loads. Every mountain is already listed on the page below it.

(function () {
  var input = document.getElementById('q');
  var out = document.getElementById('search-results');
  if (!input || !out) return;

  var lang = document.documentElement.lang || 'sl';
  var index = null;
  var labels = {};

  /** Fold diacritics so "Storzic" finds "Storžič" -- visitors will not type the carons. */
  function fold(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  fetch('/assets/data.' + lang + '.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      labels = data.labels || {};
      var trailheadById = {};
      data.trailheads.forEach(function (t) { trailheadById[t.id] = t; });

      index = [];

      data.mountains.forEach(function (m) {
        index.push({
          kind: 'mountain', url: m.url, title: m.name,
          meta: m.elevation + ' m \u00b7 ' + (labels['region.' + m.region] || m.region),
          hay: fold([m.name, labels['region.' + m.region], m.region].join(' '))
        });
      });

      data.routes.forEach(function (r) {
        var th = trailheadById[r.trailheadId] || {};
        index.push({
          kind: 'route', url: r.url, title: r.mountainName + ' \u00b7 ' + r.name,
          meta: (labels['difficulty.' + r.difficulty] || r.difficulty) +
                ' \u00b7 ' + r.gainM + ' m \u00b7 ' + (th.name || ''),
          hay: fold([r.name, r.mountainName, th.name, labels['region.' + r.region], r.region,
                     labels['difficulty.' + r.difficulty]].join(' '))
        });
      });

      if (input.value) run();
    })
    .catch(function () { /* search stays inert; the page list still works */ });

  function render(items, query) {
    if (!query) { out.hidden = true; out.innerHTML = ''; return; }

    if (!items.length) {
      out.hidden = false;
      out.innerHTML = '<li class="search-empty">' + (labels['search.none'] || '') + '</li>';
      return;
    }

    out.hidden = false;
    out.innerHTML = items.map(function (it) {
      return '<li class="search-hit search-' + it.kind + '">' +
        '<a href="' + it.url + '">' + it.title + '</a>' +
        '<span class="muted">' + it.meta + '</span></li>';
    }).join('');
  }

  function run() {
    if (!index) return;
    var q = fold(input.value.trim());
    if (!q) { render([], ''); return; }

    var terms = q.split(/\s+/);
    var hits = index.filter(function (it) {
      return terms.every(function (t) { return it.hay.indexOf(t) !== -1; });
    });

    // Exact prefix matches on the title first, then routes under their mountain.
    hits.sort(function (a, b) {
      var ap = fold(a.title).indexOf(q) === 0 ? 0 : 1;
      var bp = fold(b.title).indexOf(q) === 0 ? 0 : 1;
      return ap - bp || a.title.localeCompare(b.title, lang);
    });

    render(hits.slice(0, 20), q);
  }

  input.addEventListener('input', run);
  input.addEventListener('search', run);
})();
