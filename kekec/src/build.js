import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Report, bold, dim } from './lib/report.js';
import { createI18n } from './lib/i18n.js';
import { validate, reportApproxCoords } from './lib/validate.js';
import { derive } from './lib/derive.js';
import { plan } from './lib/planner.js';
import { LANGS, DEFAULT_LANG, urlPage, urlMountain, urlRoute, fileFor } from './lib/paths.js';
import { layout } from './render/layout.js';
import * as core from './render/pages-core.js';
import * as stat from './render/pages-static.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const checkOnly = process.argv.includes('--check');

const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));

function write(relPath, contents) {
  const full = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  return full;
}

// --- 1. load ---------------------------------------------------------------
const raw = {
  mountains: readJson('data', 'mountains.json'),
  routes: readJson('data', 'routes.json'),
  trailheads: readJson('data', 'trailheads.json'),
  huts: readJson('data', 'huts.json')
};
const dicts = { sl: readJson('i18n', 'sl.json'), en: readJson('i18n', 'en.json') };

// The national outline, used to draw the no-JS map at build time (src/render/staticmap.js).
const border = fs.existsSync(path.join(ROOT, 'src', 'assets', 'slovenia.geojson'))
  ? readJson('src', 'assets', 'slovenia.geojson')
  : null;

const report = new Report();

// --- 2. validate before anything is derived or rendered --------------------
// §7: the build FAILS on the listed conditions. Failing here means no half-correct
// dist/ is ever produced from bad data.
validate(raw, report);
reportApproxCoords(raw, report);

// --- 3. derive: commonSection propagation, §2.4 ----------------------------
const site = derive(raw);

// The propagation is a safety guarantee, so say out loud when it fired.
for (const r of site.routes) {
  if (r.raisedByCommonSection) {
    report.note(dim(`  propagated: ${r.id} "${r.authoredDifficulty}" -> "${r.difficulty}" (commonSection)`));
  }
}

// --- 4. plan: start time, daylight, lapse rate, §4.2 -----------------------
const plans = new Map(site.routes.map(r => [r.id, plan(r)]));

if (report.failed) {
  report.print();
  console.error('\n' + bold('Build failed. No output written.'));
  process.exit(1);
}

if (checkOnly) {
  report.print({ enCoverage: createI18n('en', dicts, report).coverage() });
  console.log('\n' + bold('Data OK.') + ` ${site.mountains.length} mountains, ${site.routes.length} routes.`);
  process.exit(0);
}

// --- 5. render both language trees from one data source --------------------
fs.rmSync(DIST, { recursive: true, force: true });

let pageCount = 0;
const emit = ({ i18n, url, title, body, activePage, scripts }) => {
  write(fileFor(url), layout({ i18n, url, title, body, activePage, scripts }));
  pageCount++;
  i18n.resetFallback();   // the "not yet translated" notice is per page
};

const STATIC_PAGES = {
  advice: stat.advicePage,
  weather: stat.weatherPage,
  sources: stat.sourcesPage
};

for (const lang of LANGS) {
  const i18n = createI18n(lang, dicts, report);
  const ctx = { i18n, site, border };

  // The map and the search box live on the home page now; the filters live on browse.
  emit({ i18n, url: urlPage('home', lang), title: null, body: core.homePage(ctx),
         activePage: 'home', scripts: ['/assets/map.js', '/assets/search.js'] });
  emit({ i18n, url: urlPage('browse', lang), title: i18n.t('browse.heading'), body: core.browsePage(ctx),
         activePage: 'browse', scripts: ['/assets/filters.js'] });

  for (const [key, render] of Object.entries(STATIC_PAGES)) {
    emit({ i18n, url: urlPage(key, lang), title: i18n.t(`nav.${key}`), body: render(ctx), activePage: key });
  }

  for (const route of site.routes) {
    emit({ i18n, url: urlRoute(route.id, lang), title: `${route.mountain.name} · ${route.name}`,
           body: core.routePage({ ...ctx, route, plan: plans.get(route.id) }), activePage: 'browse' });
  }
}

// --- 6. assets and machine-readable data ----------------------------------
for (const f of fs.readdirSync(path.join(ROOT, 'src', 'assets'))) {
  write(path.join('assets', f), fs.readFileSync(path.join(ROOT, 'src', 'assets', f)));
}

// The pre-rendered elevation grid is a committed asset (npm run terrain). Without it
// the map still works -- map.js falls back to fetching DEM tiles -- but every visitor
// pays for what should have been computed once.
if (!border) {
  report.warn('src/assets/slovenia.geojson is missing - the home page will render no map for readers without JavaScript');
}
if (!fs.existsSync(path.join(ROOT, 'src', 'assets', 'terrain-slovenia.png'))) {
  report.warn('src/assets/terrain-slovenia.png is missing - run "npm run terrain"; the map will fall back to per-visitor DEM fetches');
}

// One JSON payload per language, for the map markers and the client-side filters (§4.1).
for (const lang of LANGS) {
  const i18n = createI18n(lang, dicts, report);
  write(`assets/data.${lang}.json`, JSON.stringify({
    mountains: site.mountains.map(m => ({
      id: m.id, name: m.name, elevation: m.elevation, region: m.region, coords: m.coords,
      difficulty: m.hardestDifficulty, url: urlMountain(m.id, lang),
      summary: i18n.loc(m.summary), routeCount: m.routes.length
    })),
    trailheads: site.trailheads.map(t => ({
      id: t.id, name: t.name, elevation: t.elevation, coords: t.coords, region: t.region
    })),
    routes: site.routes.map(r => ({
      id: r.id, name: r.name, mountainId: r.mountainId, mountainName: r.mountain.name,
      difficulty: r.difficulty, approachDifficulty: r.approachDifficulty,
      region: r.mountain.region, gainM: r.gainM, timeUpMin: r.timeUpMin,
      trailheadId: r.trailheadId, url: urlRoute(r.id, lang)
    })),
    labels: Object.fromEntries(Object.keys(dicts.sl)
      .filter(k => k.startsWith('difficulty.') || k.startsWith('region.') ||
                   k.startsWith('map.') || k.startsWith('filter.') || k.startsWith('search.'))
      .map(k => [k, i18n.t(k)]))
  }));
}

// "/" serves SI (§3.3).
write('index.html', `<!DOCTYPE html>
<html lang="${DEFAULT_LANG}"><head><meta charset="utf-8">
<title>Kekec</title>
<link rel="canonical" href="${urlPage('home', DEFAULT_LANG)}">
<meta http-equiv="refresh" content="0; url=${urlPage('home', DEFAULT_LANG)}">
${LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${urlPage('home', l)}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${urlPage('home', DEFAULT_LANG)}">
</head><body><p><a href="${urlPage('home', DEFAULT_LANG)}">Kekec</a></p></body></html>
`);

// --- 7. report -------------------------------------------------------------
report.print({ enCoverage: createI18n('en', dicts, report).coverage() });

if (report.failed) {
  console.error('\n' + bold('Build failed after rendering. dist/ may be incomplete.'));
  process.exit(1);
}

console.log('\n' + bold('Built') + ` ${pageCount} pages -> dist/`);
console.log(dim(`  ${site.mountains.length} mountains, ${site.routes.length} routes, ${LANGS.length} languages`));
