import { esc, join } from './html.js';
import { SLOVENIA, lonToTileX, latToTileY } from '../lib/terrain.js';
import { urlMountain } from '../lib/paths.js';

// The map without JavaScript.
//
// DESIGN.md §4: "Every page is real static HTML at build time; the map, filters and
// search enhance it. Pages work when tiles fail or signal drops -- the normal condition
// in the mountains." Until now that was true of everything on the home page except the
// map itself, which was an empty div. This is the same country and the same thirty
// summits, projected at build time into an inline SVG: no script, no tiles, no requests.
//
// map.js removes it immediately before Leaflet initialises -- and only then, so a failed
// CDN leaves it in place rather than replacing it with nothing.

const VIEW_W = 1000;

/** Same Web Mercator framing as the live map, normalised to the viewBox. */
function projector() {
  const z = 10;   // any zoom works; it cancels out in the normalisation
  const x0 = lonToTileX(SLOVENIA.west, z), x1 = lonToTileX(SLOVENIA.east, z);
  const y0 = latToTileY(SLOVENIA.north, z), y1 = latToTileY(SLOVENIA.south, z);
  const scale = VIEW_W / (x1 - x0);
  const height = (y1 - y0) * scale;
  return {
    height,
    project: (lon, lat) => [
      (lonToTileX(lon, z) - x0) * scale,
      (latToTileY(lat, z) - y0) * scale
    ]
  };
}

// The viewBox is 1000 units wide and renders at about that many pixels, so anything
// finer than a whole unit is bytes nobody can see. Consecutive duplicates go too.
const round = (n) => Math.round(n);

export function staticMap({ site, i18n, border }) {
  if (!border) return '';
  const { project, height } = projector();

  const rings = (border.type === 'MultiPolygon' ? border.coordinates : [border.coordinates])
    .map(poly => poly[0]);

  const path = rings.map(ring => {
    const pts = [];
    for (const [lon, lat] of ring) {
      const p = project(lon, lat).map(round);
      const last = pts[pts.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
    }
    return 'M' + pts.map(p => p.join(',')).join('L') + 'Z';
  }).join('');

  // Difficulty is never colour alone (§4): each marker carries the grade in its
  // accessible name, and the same routes are listed as text further down the page.
  const marks = { 'lahka': '\u25CF', 'zahtevna': '\u25C6', 'zelo-zahtevna': '\u25B2', 'brezpotje': '\u2715' };

  const markers = site.mountains.map(m => {
    const [x, y] = project(m.coords[1], m.coords[0]).map(round);
    const grade = m.hardestDifficulty;
    const label = `${m.name}, ${m.elevation} m` + (grade ? ` — ${i18n.t(`difficulty.${grade}`)}` : '');
    return `<a href="${esc(urlMountain(m.id, i18n.lang))}" class="sm-pin sm-${esc(grade ?? 'none')}">
  <title>${esc(label)}</title>
  <circle cx="${x}" cy="${y}" r="9"/>
  <text x="${x}" y="${y + 3.2}" text-anchor="middle">${marks[grade] ?? ''}</text>
</a>`;
  });

  return `<div class="map-fallback" id="map-fallback">
  <svg viewBox="0 0 ${VIEW_W} ${round(height)}" role="img"
       aria-label="${esc(i18n.t('map.alt'))}" preserveAspectRatio="xMidYMid meet">
    <path class="sm-country" d="${path}"/>
    ${join(markers)}
  </svg>
</div>`;
}
