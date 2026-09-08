// Marker map, DESIGN.md §4. Points only -- no polylines, no trail geometry, no tracing.
// It lives on the home page; there is no separate Zemljevid page.
//
// Progressive enhancement (§4): the page is complete static HTML before this runs.
// Leaflet is loaded here rather than in <head>, so every other page and every failed
// CDN costs nothing and the page still works.

(function () {
  var el = document.getElementById('map');
  if (!el) return;

  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  var lang = document.documentElement.lang || 'sl';

  // Slovenia, with a little padding so edge markers stay reachable.
  var SLOVENIA = [[45.38, 13.30], [46.92, 16.68]];

  /** Below this the pre-rendered overlay is enough; above it, fetch detail tiles. */
  var TILE_ZOOM = 10;

  var MARK = { 'lahka': '\u25CF', 'zahtevna': '\u25C6', 'zelo-zahtevna': '\u25B2', 'brezpotje': '\u2715' };
  var COLOR = { 'lahka': '#3f7d4e', 'zahtevna': '#b8791f', 'zelo-zahtevna': '#c0392b', 'brezpotje': '#5a5a8a' };

  /**
   * Hypsometric ramp: light green at sea level to near-black at the summit of Triglav.
   *
   * This is applied to real elevations decoded from a DEM (see TerrainLayer), not to a
   * basemap's own palette -- which is why it can be a clean monotonic ramp. Filtering
   * ready-made topographic tiles cannot do this, because their colours are not a
   * monotonic function of height: they go green, then brown, then white at the top.
   *
   * The stops are weighted towards the lower half deliberately. DEM tiles are
   * downsampled as you zoom out, so at the whole-country view a 2864 m summit averages
   * down to something nearer 1500 m across its pixel. A ramp spread evenly to 2900
   * would therefore never reach its dark end at the zoom the map actually opens at.
   */
  var RAMP = [
    [-40,  [186, 205, 214]],   // water / below sea level
    [0,    [235, 246, 216]],
    [120,  [206, 230, 172]],
    [300,  [172, 208, 136]],
    [500,  [132, 180, 104]],
    [700,  [ 98, 150,  82]],
    [900,  [ 72, 124,  66]],
    [1100, [ 50,  98,  52]],
    [1300, [ 34,  74,  40]],
    [1600, [ 20,  52,  28]],
    [2000, [ 10,  32,  17]],
    [2600, [  3,  14,   8]]
  ];

  /**
   * The ramp as a lookup table, one entry per metre.
   *
   * The interpolating version allocated a three-element array per pixel. That is fine
   * for one tile and ruinous for the million-pixel country overlay, so it is built once.
   */
  var RAMP_LO = -100, RAMP_HI = 3000, RAMP_LUT = null;

  function rampLut() {
    if (RAMP_LUT) return RAMP_LUT;
    RAMP_LUT = new Uint8Array((RAMP_HI - RAMP_LO) * 3);
    for (var e = RAMP_LO; e < RAMP_HI; e++) {
      var c = RAMP[RAMP.length - 1][1];
      if (e <= RAMP[0][0]) c = RAMP[0][1];
      else {
        for (var i = 1; i < RAMP.length; i++) {
          if (e <= RAMP[i][0]) {
            var a = RAMP[i - 1], b = RAMP[i], t = (e - a[0]) / (b[0] - a[0]);
            c = [a[1][0] + (b[1][0] - a[1][0]) * t,
                 a[1][1] + (b[1][1] - a[1][1]) * t,
                 a[1][2] + (b[1][2] - a[1][2]) * t];
            break;
          }
        }
      }
      var o = (e - RAMP_LO) * 3;
      RAMP_LUT[o] = c[0]; RAMP_LUT[o + 1] = c[1]; RAMP_LUT[o + 2] = c[2];
    }
    return RAMP_LUT;
  }

  /** Paint an elevation grid through the ramp with slope shading, light from the NW. */
  function paintRelief(elev, W, H, k, out) {
    var lut = rampLut();
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var i = y * W + x;
        var e = elev[i] | 0;
        if (e < RAMP_LO) e = RAMP_LO;
        if (e >= RAMP_HI) e = RAMP_HI - 1;
        var li = (e - RAMP_LO) * 3;

        var xl = elev[y * W + (x > 0 ? x - 1 : 0)];
        var xr = elev[y * W + (x < W - 1 ? x + 1 : W - 1)];
        var yu = elev[(y > 0 ? y - 1 : 0) * W + x];
        var yd = elev[(y < H - 1 ? y + 1 : H - 1) * W + x];
        var sh = 1 + ((xl - xr) + (yu - yd)) * k;
        if (sh < 0.62) sh = 0.62;
        if (sh > 1.30) sh = 1.30;

        var o = i * 4;
        out[o]     = lut[li] * sh;
        out[o + 1] = lut[li + 1] * sh;
        out[o + 2] = lut[li + 2] * sh;
        out[o + 3] = 255;
      }
    }
  }

  /** The page background, so the mask outside Slovenia blends into the page seamlessly. */
  function pageBackground() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--bg');
    return (v || '').trim() || '#faf9f6';
  }

  /**
   * Called when Leaflet or the data cannot be loaded -- no signal is the normal condition
   * in the mountains, and this is exactly the case the build-time SVG map exists for.
   * Keep it if it is there; only drop the container if there is nothing to show.
   */
  function giveUp() {
    if (!document.getElementById('map-fallback')) el.remove();
  }

  function load(cb) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);

    var s = document.createElement('script');
    s.src = LEAFLET_JS;
    s.onload = cb;
    s.onerror = giveUp;
    document.head.appendChild(s);
  }

  /**
   * Terrain rendered from a DEM rather than taken from a basemap.
   *
   * AWS Terrain Tiles (Terrarium) encode elevation in the RGB channels:
   *   metres = (R * 256 + G + B / 256) - 32768
   * The tile is decoded, run through RAMP, and shaded by local slope so relief reads.
   * Open data, keyless and CORS-enabled, which is what makes the decode possible at all.
   */
  /** Shading strength for a given zoom and supersampling factor. */
  function shadeStrength(z, scale) {
    return (scale / (6 + 40 / Math.pow(2, Math.max(0, z - 8)))) * 0.028;
  }

  var TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/';
  var TERRARIUM_MAX_Z = 15;

  /** One DEM tile as an <img>, or null if it will not load. */
  function loadDem(z, x, y) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = TERRARIUM + z + '/' + x + '/' + y + '.png';
    });
  }

  /**
   * Terrain rendered from a DEM rather than taken from a basemap.
   *
   * AWS Terrain Tiles (Terrarium) encode elevation in the RGB channels:
   *   metres = (R * 256 + G + B / 256) - 32768
   * The tile is decoded, run through RAMP, and shaded by local slope so relief reads.
   * Open data, keyless and CORS-enabled, which is what makes the decode possible at all.
   *
   * Each 256 px display tile is drawn at 512 px from the FOUR DEM tiles one zoom level
   * deeper. A single 256 px source stretched over a 256 px tile is what made the first
   * version look soft next to a vector basemap: raster relief has no crisp edges to
   * carry detail the way contour lines and labels do, so it needs the pixels instead.
   */
  function makeTerrainLayer() {
    return new (L.GridLayer.extend({
      createTile: function (coords, done) {
        var size = this.getTileSize();
        var scale = 2;
        var tile = L.DomUtil.create('canvas', 'leaflet-tile');
        tile.width = size.x * scale;
        tile.height = size.y * scale;
        tile.style.width = size.x + 'px';
        tile.style.height = size.y + 'px';
        var ctx = tile.getContext('2d');

        var W = tile.width, H = tile.height;
        var deep = coords.z + 1 <= TERRARIUM_MAX_Z;
        var jobs = deep
          ? [[0, 0], [1, 0], [0, 1], [1, 1]].map(function (q) {
              return { qx: q[0], qy: q[1],
                       p: loadDem(coords.z + 1, coords.x * 2 + q[0], coords.y * 2 + q[1]) };
            })
          : [{ qx: 0, qy: 0, full: true, p: loadDem(coords.z, coords.x, coords.y) }];

        Promise.all(jobs.map(function (j) { return j.p; })).then(function (imgs) {
          var scratch = document.createElement('canvas');
          scratch.width = W; scratch.height = H;
          var sctx = scratch.getContext('2d');
          sctx.imageSmoothingEnabled = false;

          var any = false;
          imgs.forEach(function (img, i) {
            if (!img) return;
            any = true;
            var j = jobs[i];
            if (j.full) sctx.drawImage(img, 0, 0, W, H);
            else sctx.drawImage(img, j.qx * W / 2, j.qy * H / 2, W / 2, H / 2);
          });
          if (!any) { done(null, tile); return; }

          var src;
          try {
            src = sctx.getImageData(0, 0, W, H).data;
          } catch (e) {
            done(null, tile);   // canvas tainted: leave the tile blank rather than fail
            return;
          }

          var out = ctx.createImageData(W, H);
          var elev = new Float32Array(W * H);
          for (var i2 = 0, p = 0; i2 < elev.length; i2++, p += 4) {
            elev[i2] = (src[p] * 256 + src[p + 1] + src[p + 2] / 256) - 32768;
          }

          // Slope shading, light from the north-west. The divisor keeps the effect
          // roughly constant as ground resolution changes with zoom; the extra factor
          // of `scale` compensates for neighbouring pixels being half as far apart.
          paintRelief(elev, W, H, shadeStrength(coords.z, scale), out.data);
          ctx.putImageData(out, 0, 0);
          done(null, tile);
        });

        return tile;
      }
    }))({
      minZoom: 6,
      zIndex: 1,
      maxNativeZoom: 14,   // upscale beyond this rather than pull thousands of tiles
      maxZoom: 16,
      bounds: SLOVENIA
    });
  }


  /** L.ImageOverlay backed by a canvas element rather than a URL. */
  function canvasOverlay(canvas, bounds, options) {
    var Overlay = L.ImageOverlay.extend({
      _initImage: function () {
        var el = this._image = this._url;
        L.DomUtil.addClass(el, 'leaflet-image-layer');
        if (this._zoomAnimated) L.DomUtil.addClass(el, 'leaflet-zoom-animated');
        if (this.options.className) L.DomUtil.addClass(el, this.options.className);
        el.onselectstart = L.Util.falseFn;
        el.onmousemove = L.Util.falseFn;
      }
    });
    return new Overlay(canvas, bounds, options);
  }

  /**
   * The whole country, painted once from a pre-rendered elevation grid.
   *
   * The tile layer below needs four cross-origin DEM tiles per display tile, and the
   * opening view is about six display tiles: twenty-four requests and roughly three
   * megabytes, measured at about a second before anything appeared. The opening view is
   * the same picture on every load, so the grid is sampled at build time
   * (src/prerender-terrain.js) and shipped as one 354 KB same-origin file. What is
   * shipped is the ELEVATION -- the shading is recomputed here, because it is per-pixel
   * noise that would make the payload five times larger.
   */
  function addPreRendered(map) {
    return Promise.all([
      fetch('/assets/terrain-slovenia.json').then(function (r) { return r.json(); }),
      new Promise(function (res, rej) {
        var i = new Image();
        i.onload = function () { res(i); };
        i.onerror = rej;
        i.src = '/assets/terrain-slovenia.png';
      })
    ]).then(function (parts) {
      var meta = parts[0], img = parts[1];
      var W = meta.width, H = meta.height;

      var scratch = document.createElement('canvas');
      scratch.width = W; scratch.height = H;
      var sctx = scratch.getContext('2d');
      sctx.drawImage(img, 0, 0);
      var src = sctx.getImageData(0, 0, W, H).data;

      var elev = new Float32Array(W * H);
      for (var i = 0; i < elev.length; i++) elev[i] = src[i * 4] * meta.metresPerStep;

      var canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d');
      var out = ctx.createImageData(W, H);
      // The grid is one 2x downsample below its sampling zoom, so it shades like z9.
      paintRelief(elev, W, H, shadeStrength(meta.demZoom - 1, 2), out.data);
      ctx.putImageData(out, 0, 0);

      // The canvas goes into the pane as-is. Handing Leaflet a URL instead means
      // canvas.toBlob, which re-encodes a megapixel as PNG for the browser to decode
      // straight back again -- measured at 1048 ms, against 22 ms to paint it.
      var b = meta.bounds;
      return canvasOverlay(canvas, [[b.south, b.west], [b.north, b.east]], {
        pane: 'terrain', interactive: false
      }).addTo(map);
    });
  }

  function summitIcon(difficulty) {
    var color = COLOR[difficulty] || '#5d5d58';
    // The glyph is a second, non-colour channel (§4, accessibility).
    return L.divIcon({
      className: 'summit-marker',
      html: '<span style="display:flex;align-items:center;justify-content:center;' +
            'width:20px;height:20px;border-radius:50%;background:' + color + ';color:#fff;' +
            'font-size:10px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5)">' +
            (MARK[difficulty] || '') + '</span>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
  }

  /**
   * Everything outside Slovenia is covered with the page background colour, so the map
   * reads as a shape of the country rather than a rectangle of Europe.
   *
   * The renderer padding matters more than it looks. Leaflet's SVG renderer only draws
   * the viewport plus a small margin (10% by default), so zooming out or panning towards
   * the edge exposes ground the mask has not been drawn over yet -- which showed up as a
   * flash of Austria before the white caught up. A padding of 3 means the mask is always
   * drawn several viewports wide, so there is nothing to catch up with.
   */
  function addMask(map, border) {
    var world = [[-90, -360], [-90, 360], [90, 360], [90, -360]];
    var holes = [];

    if (border) {
      var polys = border.type === 'MultiPolygon' ? border.coordinates : [border.coordinates];
      polys.forEach(function (poly) {
        // Outer ring only; GeoJSON is [lon, lat] and Leaflet wants [lat, lon].
        holes.push(poly[0].map(function (c) { return [c[1], c[0]]; }));
      });
    } else {
      holes.push([
        [SLOVENIA[0][0], SLOVENIA[0][1]], [SLOVENIA[0][0], SLOVENIA[1][1]],
        [SLOVENIA[1][0], SLOVENIA[1][1]], [SLOVENIA[1][0], SLOVENIA[0][1]]
      ]);
    }

    L.polygon([world].concat(holes), {
      renderer: L.svg({ padding: 3 }),
      color: 'transparent',
      fillColor: pageBackground(),
      fillOpacity: 1,
      interactive: false,
      className: 'country-mask'
    }).addTo(map);
  }

  /**
   * Keep the view inside Slovenia.
   *
   * maxBounds alone is not enough. It constrains the *visible area* to sit inside the
   * bounds, so as soon as the viewport is larger than the country in one axis -- which
   * is the normal case at the fit-to-country zoom -- Leaflet cannot satisfy it and lets
   * the map drift. This clamps the centre instead, which is well defined at every zoom,
   * and re-fits whenever the container is resized so minZoom never goes stale.
   */
  function lockToSlovenia(map) {
    var bounds = L.latLngBounds(SLOVENIA);

    function refit() {
      map.setMinZoom(0);
      map.fitBounds(bounds, { animate: false });
      map.setMinZoom(map.getZoom());
    }

    function clamp() {
      var c = map.getCenter();
      var lat = Math.min(Math.max(c.lat, bounds.getSouth()), bounds.getNorth());
      var lng = Math.min(Math.max(c.lng, bounds.getWest()), bounds.getEast());
      if (lat !== c.lat || lng !== c.lng) map.panTo([lat, lng], { animate: false });
    }

    refit();
    map.on('moveend', clamp);
    map.on('resize', refit);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** Every route up this mountain, each a direct link to its own page. */
  function summitPopup(m, routes, labels) {
    var rows = routes.map(function (r) {
      var grade = labels['difficulty.' + r.difficulty] || r.difficulty;
      return '<li><a href="' + esc(r.url) + '">' + esc(r.name) + '</a>' +
             '<span class="pop-meta">' + esc(grade) + ' &middot; ' + r.gainM + ' m</span></li>';
    }).join('');

    return '<div class="pop">' +
      '<strong class="pop-title">' + esc(m.name) + '</strong>' +
      '<span class="pop-sub">' + m.elevation + ' m &middot; ' + esc(labels['region.' + m.region] || m.region) + '</span>' +
      '<ul class="pop-routes">' + rows + '</ul></div>';
  }

  function init(data, border) {
    // The build-time SVG map is what a reader without JavaScript sees. Take it out
    // only here -- at this point Leaflet has loaded and is about to draw over it. If
    // the CDN had failed we would never have got this far, and the SVG stays.
    var fallback = document.getElementById('map-fallback');
    if (fallback) fallback.remove();

    var map = L.map(el, {
      maxBounds: SLOVENIA,
      maxBoundsViscosity: 1.0,
      zoomControl: true,
      maxZoom: 16,
      // Attribution is rendered under the map as page text (see mapCredit in
      // pages-core.js). ODbL and CARTO require the credit, not an overlay on the map.
      attributionControl: false
    });

    // The pre-rendered country sits UNDER the tile pane, so the detail tiles that
    // replace it and the place labels that annotate it both draw on top; the mask in
    // the overlay pane cuts the lot to the border.
    map.createPane('terrain');
    map.getPane('terrain').style.zIndex = 190;

    addPreRendered(map).catch(function () { /* fall through to tiles */ });

    // Detail tiles are only worth their twenty-four requests once someone has zoomed in
    // past what the pre-rendered grid resolves. Below that they would fetch the same
    // picture the overlay already shows.
    var tiles = makeTerrainLayer();
    function syncTiles() {
      if (map.getZoom() >= TILE_ZOOM) { if (!map.hasLayer(tiles)) tiles.addTo(map); }
      else if (map.hasLayer(tiles)) map.removeLayer(tiles);
    }
    map.on('zoomend', syncTiles);

    // Place names only, so the terrain ramp underneath stays readable.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 16, bounds: SLOVENIA, opacity: 0.85, detectRetina: true, zIndex: 2
    }).addTo(map);

    addMask(map, border);
    lockToSlovenia(map);
    syncTiles();

    var routesByMountain = {};
    data.routes.forEach(function (r) {
      (routesByMountain[r.mountainId] = routesByMountain[r.mountainId] || []).push(r);
    });

    data.mountains.forEach(function (m) {
      var marker = L.marker(m.coords, {
        icon: summitIcon(m.difficulty),
        alt: m.name + ', ' + m.elevation + ' m',
        riseOnHover: true
      }).addTo(map);

      // Name and height on hover, with no delay. The browser's own tooltip from a
      // `title` attribute takes about a second to appear, which is why it is not used.
      marker.bindTooltip(esc(m.name) + ' <span class="tt-ele">' + m.elevation + ' m</span>', {
        direction: 'top', offset: [0, -12], opacity: 1, className: 'summit-tooltip'
      });

      // Click opens the list of routes; each one goes straight to its route page.
      marker.bindPopup(summitPopup(m, routesByMountain[m.id] || [], data.labels), {
        className: 'summit-popup', maxWidth: 320, autoPanPadding: [24, 24]
      });
    });

    data.trailheads.forEach(function (t) {
      L.circleMarker(t.coords, {
        radius: 3.5, color: '#2c2c28', weight: 1, fillColor: '#fff', fillOpacity: 1
      }).addTo(map).bindTooltip(esc(t.name) + ' <span class="tt-ele">' + t.elevation + ' m</span>', {
        direction: 'top', offset: [0, -6], opacity: 1, className: 'summit-tooltip'
      });
    });
  }

  Promise.all([
    fetch('/assets/data.' + lang + '.json').then(function (r) { return r.json(); }),
    fetch('/assets/slovenia.geojson').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ]).then(function (res) {
    load(function () { init(res[0], res[1]); });
  }).catch(giveUp);
})();
