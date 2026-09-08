// Search, sort and filter for the merged Gore + Poti page.
// DESIGN.md §4.1 item 2: "With geometry gone this is the primary way to explore the site."
//
// Everything below operates on the static rows already in the DOM. No re-render, no
// index fetch, and the unfiltered page is what a reader without JS gets.

(function () {
  var root = document.getElementById('browse');
  var count = document.getElementById('f-count');
  var empty = document.getElementById('no-results');
  var clear = document.getElementById('f-clear');
  var q = document.getElementById('browse-q');
  if (!root) return;

  var boxes = Array.prototype.slice.call(document.querySelectorAll('#filters input[type=checkbox]'));
  var blocks = Array.prototype.slice.call(root.querySelectorAll('.mountain-block'));

  function fold(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /** Ticked values in one checkbox group. Empty means "no constraint from this group". */
  function checked(name) {
    return boxes.filter(function (b) { return b.name === name && b.checked; })
                .map(function (b) { return b.value; });
  }

  function apply() {
    var diffs = checked('difficulty');
    var regions = checked('region');
    var terms = fold(q && q.value ? q.value.trim() : '').split(/\s+/).filter(Boolean);
    var shown = 0;

    blocks.forEach(function (block) {
      // A mountain matches the text query as a whole -- its name, its region, and every
      // route and trailhead under it -- so typing a mountain name keeps all of its routes
      // rather than only those whose own name repeats it.
      var hay = block.dataset.search || '';
      var textOk = terms.every(function (t) { return hay.indexOf(t) !== -1; });
      var regionOk = !regions.length || regions.indexOf(block.dataset.region) !== -1;

      var visibleInBlock = 0;
      if (textOk && regionOk) {
        Array.prototype.forEach.call(block.querySelectorAll('.route-row'), function (row) {
          var ok = !diffs.length || diffs.indexOf(row.dataset.difficulty) !== -1;
          row.classList.toggle('is-hidden', !ok);
          if (ok) { visibleInBlock++; shown++; }
        });
      }

      block.classList.toggle('is-hidden', visibleInBlock === 0);
    });

    if (count) count.textContent = String(shown);
    if (empty) empty.hidden = shown !== 0;

    var active = diffs.length || regions.length || terms.length;
    if (clear) clear.hidden = !active;

    // Keep the filter state in the URL so a filtered view can be linked and reloaded.
    var params = new URLSearchParams();
    diffs.forEach(function (v) { params.append('difficulty', v); });
    regions.forEach(function (v) { params.append('region', v); });
    if (q && q.value.trim()) params.set('q', q.value.trim());
    var qs = params.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  // Restore state from the URL, including repeated values for the multi-selects.
  var initial = new URLSearchParams(location.search);
  var wantDiff = initial.getAll('difficulty');
  var wantRegion = initial.getAll('region');
  boxes.forEach(function (b) {
    var want = b.name === 'difficulty' ? wantDiff : wantRegion;
    if (want.indexOf(b.value) !== -1) b.checked = true;
  });
  if (q && initial.get('q')) q.value = initial.get('q');

  boxes.forEach(function (b) { b.addEventListener('change', apply); });
  if (q) { q.addEventListener('input', apply); q.addEventListener('search', apply); }
  if (clear) clear.addEventListener('click', function () {
    boxes.forEach(function (b) { b.checked = false; });
    if (q) q.value = '';
    apply();
  });

  apply();
})();
