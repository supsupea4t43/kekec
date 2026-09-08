import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Report } from './lib/report.js';
import { validate } from './lib/validate.js';
import { derive } from './lib/derive.js';
import { plan, duration } from './lib/planner.js';
import { createI18n } from './lib/i18n.js';
import { alternate, urlRoute, urlMountain, urlPage, LANGS } from './lib/paths.js';
import { harder } from './lib/enums.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));

const REAL = {
  mountains: readJson('data', 'mountains.json'),
  routes: readJson('data', 'routes.json'),
  trailheads: readJson('data', 'trailheads.json'),
  huts: readJson('data', 'huts.json')
};
const DICTS = { sl: readJson('i18n', 'sl.json'), en: readJson('i18n', 'en.json') };

/** A minimal valid fixture: one mountain with a commonSection, one route up it. */
function fixture(overrides = {}) {
  const data = {
    mountains: [{
      id: 'testna-gora', name: 'Testna gora', elevation: 2000, region: 'julijske-alpe',
      coords: [46.2, 14.0], summary: { sl: 'Opis.', en: 'Summary.' },
      commonSection: {
        name: 'Skupni greben', difficulty: 'zelo-zahtevna',
        gear: ['celada', 'samovarovalni-komplet'],
        note: { sl: 'Skupen vsem smerem.', en: 'Common to every route.' }
      },
      hutIds: [], photo: null
    }],
    trailheads: [{ id: 'testno', name: 'Testno', elevation: 800, coords: [46.1, 14.0], region: 'julijske-alpe' }],
    huts: [],
    routes: [{
      id: 'testna-pot', mountainId: 'testna-gora', name: 'Testna pot', trailheadId: 'testno',
      difficulty: 'zelo-zahtevna', approachDifficulty: 'lahka', approachEndsAt: null,
      viaFerrata: true, gainM: 1300, distanceKm: 8, timeUpMin: 240, timeDownMin: 180,
      shape: 'linijska', season: { from: 7, to: 9, note: { sl: '', en: '' } },
      water: { sl: '', en: '' }, gear: [], description: { sl: 'Opis.', en: 'Description.' },
      geometry: null, verified: { source: 'test', date: '2026-01-01', secondReader: 'test' }
    }]
  };
  if (overrides.route) Object.assign(data.routes[0], overrides.route);
  if (overrides.mountain) Object.assign(data.mountains[0], overrides.mountain);
  return data;
}

function errorsFor(data) {
  const r = new Report();
  validate(data, r);
  return [...r.errors.keys()];
}

// --------------------------------------------------------------------------
// DESIGN.md §2.1 / §5 -- the single most consequential rule in the document.
// --------------------------------------------------------------------------

test('§5: a route graded below its commonSection FAILS the build', () => {
  // This is the exact page §2.1 says the site must never publish:
  // "Triglav čez Krmo — lahka pot".
  const errs = errorsFor(fixture({ route: { difficulty: 'lahka' } }));
  assert.equal(errs.length, 1, 'expected exactly one error');
  assert.match(errs[0], /graded "lahka" but must cross/);
  assert.match(errs[0], /hardest section/);
});

test('§5: the rule fails, it does not warn', () => {
  // §5 is explicit: "The build fails, not warns". Other, unrelated warnings (region
  // spread, a missing approachEndsAt) are expected on a one-mountain fixture -- what
  // matters is that the commonSection violation is never among them.
  const r = new Report();
  validate(fixture({ route: { difficulty: 'zahtevna' } }), r);
  assert.equal(r.failed, true);
  const asWarning = [...r.warnings.keys()].filter(w => /must cross|commonSection/.test(w));
  assert.deepEqual(asWarning, [], 'the commonSection rule must not be downgraded to a warning');
});

test('§5: approachDifficulty is required where a commonSection exists', () => {
  const errs = errorsFor(fixture({ route: { approachDifficulty: null } }));
  assert.equal(errs.length, 1);
  assert.match(errs[0], /commonSection but has no approachDifficulty/);
});

test('§5: approachDifficulty is NOT required without a commonSection', () => {
  const errs = errorsFor(fixture({
    mountain: { commonSection: null },
    route: { difficulty: 'lahka', approachDifficulty: null }
  }));
  assert.deepEqual(errs, []);
});

// --------------------------------------------------------------------------
// DESIGN.md §7 -- required fields.
// --------------------------------------------------------------------------

for (const [field, value, pattern] of [
  ['gainM', undefined, /missing gainM/],
  ['season', undefined, /missing season/],
  ['difficulty', undefined, /missing difficulty/],
  ['verified', undefined, /missing verified/]
]) {
  test(`§7: build fails on a route with no ${field}`, () => {
    const errs = errorsFor(fixture({ route: { [field]: value } }));
    assert.ok(errs.some(e => pattern.test(e)), `expected an error matching ${pattern}\ngot: ${errs.join('\n')}`);
  });
}

test('§5: difficulty must be an enum key, never free text', () => {
  const errs = errorsFor(fixture({ route: { difficulty: 'srednje težka' } }));
  assert.ok(errs.some(e => /unknown difficulty/.test(e)));
});

test('a route cannot gain less than the net climb to the summit', () => {
  // trailhead 800 m, summit 2000 m -> 1200 m minimum
  const errs = errorsFor(fixture({ route: { gainM: 900 } }));
  assert.ok(errs.some(e => /cannot be less than the net climb/.test(e)));
});

test('coords outside Slovenia fail (catches a swapped lat/lon)', () => {
  const errs = errorsFor(fixture({ mountain: { coords: [14.0, 46.2] } }));
  assert.ok(errs.some(e => /outside Slovenia/.test(e)));
});

// --------------------------------------------------------------------------
// DESIGN.md §2.4 -- propagation as a build step, "so it cannot be forgotten on
// one route out of seven".
// --------------------------------------------------------------------------

test('§2.4: commonSection raises a route difficulty via max()', () => {
  // Validation would reject this data; derive() is the second line of defence, so it
  // is tested independently of validation on purpose.
  const site = derive(fixture({ route: { difficulty: 'lahka' } }));
  const r = site.routes[0];
  assert.equal(r.authoredDifficulty, 'lahka');
  assert.equal(r.difficulty, 'zelo-zahtevna', 'no renderer may ever see the under-graded value');
  assert.equal(r.raisedByCommonSection, true);
});

test('§2.4: route gear is a union with commonSection gear', () => {
  const site = derive(fixture({ route: { gear: ['dereze'] } }));
  const gear = site.routes[0].gear;
  for (const g of ['celada', 'samovarovalni-komplet', 'dereze']) {
    assert.ok(gear.includes(g), `expected ${g} in ${gear.join(', ')}`);
  }
});

test('§2.4: the gear implication survives even when max() picks brezpotje', () => {
  // The caveat documented in enums.js: brezpotje outranks zelo-zahtevna for ordering,
  // but gear is unioned separately, so the helmet requirement cannot be lost.
  const site = derive(fixture({ route: { difficulty: 'brezpotje' } }));
  const r = site.routes[0];
  assert.equal(r.difficulty, 'brezpotje');
  assert.ok(r.gear.includes('celada'), 'commonSection gear must survive the max()');
  assert.ok(r.gear.includes('samovarovalni-komplet'));
});

test('§2.4: the comparison table sorts by approachDifficulty', () => {
  const site = derive(REAL);
  const triglav = site.mountains.find(m => m.id === 'triglav');
  const approaches = triglav.routes.map(r => r.approachDifficulty);
  const ranked = approaches.map(a => ({ lahka: 1, zahtevna: 2, 'zelo-zahtevna': 3 })[a]);
  assert.deepEqual(ranked, [...ranked].sort((a, b) => a - b), 'not sorted by approach grade');

  // §2.4's whole point: seven routes, three approach grades, one full-route grade.
  assert.equal(triglav.routes.length, 7);
  assert.equal(new Set(approaches).size, 3);
  assert.equal(new Set(triglav.routes.map(r => r.difficulty)).size, 1);
});

test('§2.1: the easiest approach on Triglav still reads zelo-zahtevna', () => {
  const site = derive(REAL);
  const krma = site.routes.find(r => r.id === 'triglav-cez-krmo');
  assert.equal(krma.approachDifficulty, 'lahka');
  assert.equal(krma.difficulty, 'zelo-zahtevna',
    'the failure mode §2.1 exists to prevent: "Triglav čez Krmo — lahka pot"');
});

// --------------------------------------------------------------------------
// DESIGN.md §4.2 -- the start-time helper, checked against the spec's own examples.
// --------------------------------------------------------------------------

test('§4.2: reproduces the worked example for Tominškova pot', () => {
  const site = derive(REAL);
  const t = site.routes.find(r => r.id === 'triglav-tominskova');
  const p = plan(t);

  assert.equal(duration(t.timeUpMin), '6 h 40', 'spec: "Tominškova pot: 6 h 40 up"');
  assert.equal(p.startBy, '06:30', 'spec: "Leave Vrata by 06:30"');
  assert.equal(duration(t.totalTimeMin), '11 h 40', 'spec: "11 h 40 round trip"');
  assert.equal(p.months.find(m => m.month === 9).verdict, 'noFit',
    'spec: "In September that does not fit in one day from Vrata"');
  // The spec says "~12 °C". Vrata is 1003 m by DEM (the spec's own ~1015 m was a
  // round number), so the exact figure is 12.1 -- assert the spec's tolerance, not a
  // number that would break every time a surveyed elevation is refined.
  assert.ok(Math.abs(p.deltaC - 12) < 0.5,
    `spec: "Summit is ~12 °C colder than the trailhead", got ${p.deltaC}`);
});

test('§4.2: the storm rule is suppressed where it would be noise', () => {
  const site = derive(REAL);
  const smarna = site.routes.find(r => r.id === 'smarna-gora-iz-tacna');
  assert.equal(plan(smarna).stormRelevant, false,
    'a 1 h walk up a 669 m hill does not need an afternoon-storm deadline');
  const triglav = site.routes.find(r => r.id === 'triglav-cez-krmo');
  assert.equal(plan(triglav).stormRelevant, true);
});

test('§4.2: a short summer route fits the day', () => {
  const site = derive(REAL);
  assert.equal(plan(site.routes.find(r => r.id === 'slavnik-iz-podgorja')).worst, 'fits');
});

// --------------------------------------------------------------------------
// DESIGN.md §3 -- bilingual.
// --------------------------------------------------------------------------

test('§3.3: the language switcher lands on the same page, never the homepage', () => {
  const urls = [
    urlPage('home', 'sl'), urlPage('browse', 'sl'), urlPage('advice', 'sl'),
    urlPage('weather', 'sl'), urlPage('sources', 'sl'),
    urlMountain('triglav', 'sl'), urlRoute('triglav-tominskova', 'sl')
  ];
  for (const url of urls) {
    const there = alternate(url, 'sl', 'en');
    const back = alternate(there, 'en', 'sl');
    assert.equal(back, url, `${url} did not round-trip (via ${there})`);
  }
  assert.equal(alternate(urlRoute('triglav-tominskova', 'sl'), 'sl', 'en'), '/en/routes/triglav-tominskova/');
});

test('§3.3: the slug id is identical across languages', () => {
  for (const r of REAL.routes) {
    assert.equal(urlRoute(r.id, 'sl').split('/')[3], urlRoute(r.id, 'en').split('/')[3]);
  }
});

test('§3.3: SI is canonical -- a missing EN data field falls back and flags the page', () => {
  const report = new Report();
  const i18n = createI18n('en', DICTS, report);
  assert.equal(i18n.hadFallback(), false);
  assert.equal(i18n.loc({ sl: 'Samo slovensko', en: '' }, 'test field'), 'Samo slovensko');
  assert.equal(i18n.hadFallback(), true, 'the page must be able to render the "not yet translated" notice');
  assert.equal(report.warnings.size, 1, '§3.3: the build warns on every missing EN string');
});

test('§3.3: a missing SI string is a build failure, not a fallback', () => {
  const report = new Report();
  createI18n('sl', DICTS, report).t('no.such.key');
  assert.equal(report.failed, true);
});

test('§3.2: proper nouns are stored unlocalized and pass through both languages', () => {
  for (const lang of LANGS) {
    const i18n = createI18n(lang, DICTS, new Report());
    assert.equal(i18n.loc('Tominškova pot'), 'Tominškova pot');
  }
});

test('§3.2: PZS scale labels keep the Slovenian word in English', () => {
  const en = createI18n('en', DICTS, new Report());
  for (const key of ['lahka', 'zahtevna', 'zelo-zahtevna']) {
    assert.match(en.t(`difficulty.${key}`), new RegExp(key.replace('-', ' ')),
      'the sign at the junction says the Slovenian word');
  }
});

test('§3.3: EN has a string for every SI key', () => {
  const { have, total } = createI18n('en', DICTS, new Report()).coverage();
  assert.equal(have, total, `${total - have} EN keys missing`);
});

// --------------------------------------------------------------------------
// The real data set.
// --------------------------------------------------------------------------

test('the shipped data validates with no errors', () => {
  const report = new Report();
  validate(REAL, report);
  assert.deepEqual([...report.errors.keys()], []);
  assert.deepEqual([...report.warnings.keys()], []);
});

test('every route resolves its mountain and trailhead', () => {
  for (const r of derive(REAL).routes) {
    assert.ok(r.mountain, `${r.id} has no mountain`);
    assert.ok(r.trailhead, `${r.id} has no trailhead`);
  }
});

test('§9: every unreviewed grade is reported, not silently accepted', () => {
  const report = new Report();
  validate(REAL, report);
  const unreviewed = REAL.routes.filter(r => !r.verified.secondReader);
  assert.equal(report.reviews.length, unreviewed.length);
  assert.ok(unreviewed.length > 0, 'this data set is not yet reviewed; the count must be visible');
});

test('harder() is a total order over the PZS scale', () => {
  assert.equal(harder('lahka', 'zelo-zahtevna'), 'zelo-zahtevna');
  assert.equal(harder('zelo-zahtevna', 'lahka'), 'zelo-zahtevna');
  assert.equal(harder('zahtevna', 'zahtevna'), 'zahtevna');
  assert.throws(() => harder('lahka', 'nonsense'), /unknown difficulty/);
});

// --------------------------------------------------------------------------
// Page structure after the v0.5 cuts: Bonton, Slovarček, V sili, Zemljevid and
// Oprema no longer exist as pages; Gore and Poti are one index.
// --------------------------------------------------------------------------

import { PAGES } from './lib/paths.js';
import * as core from './render/pages-core.js';
import * as stat from './render/pages-static.js';

const renderCtx = (lang = 'sl') => ({
  i18n: createI18n(lang, DICTS, new Report()),
  site: derive(REAL)
});

test('the nav is exactly the five surviving pages', () => {
  assert.deepEqual(PAGES.map(p => p.key), ['home', 'browse', 'advice', 'weather', 'sources']);
});

for (const gone of ['map', 'gear', 'emergency', 'etiquette', 'glossary', 'mountains', 'routes']) {
  test(`urlPage("${gone}") no longer resolves`, () => {
    assert.throws(() => urlPage(gone, 'sl'), /unknown page/);
  });
}

test('route detail URLs survive even though the routes index does not', () => {
  assert.equal(urlRoute('triglav-tominskova', 'sl'), '/sl/poti/triglav-tominskova/');
  assert.equal(urlRoute('triglav-tominskova', 'en'), '/en/routes/triglav-tominskova/');
});

test('the merged browse page lists every mountain and every route', () => {
  const ctx = renderCtx();
  const html = core.browsePage(ctx);
  // Mountains are anchors on this page now, not links to a hub page of their own.
  for (const m of ctx.site.mountains) assert.ok(html.includes(`id="${m.id}"`), `missing anchor ${m.id}`);
  for (const r of ctx.site.routes) assert.ok(html.includes(urlRoute(r.id, 'sl')), `missing ${r.id}`);
});

test('the home page leads with search, beginner routes and a way into the index', () => {
  const html = core.homePage(renderCtx());
  assert.ok(html.includes('id="q"'), 'search input');
  assert.ok(html.includes('id="map"'), 'map container');
  assert.ok(html.includes(urlPage('browse', 'sl')), 'link to Gore in poti');
  // Viri is linked once from the footer (every page), not a second time in the body.
  assert.ok(!html.includes(urlPage('sources', 'sl')), 'the body must not repeat the footer Viri link');
  // Search and the beginner routes come before the map.
  assert.ok(html.indexOf('id="q"') < html.indexOf('id="map"'), 'search must precede the map');
  assert.ok(html.indexOf("home.beginnerHeading") === -1, 'heading is rendered, not left as a key');
  assert.ok(!html.includes('id="oprema"'), 'the gear checklist is no longer on the home page');
});

test('the home page no longer repeats the site name and tagline as a hero', () => {
  const ctx = renderCtx();
  const html = core.homePage(ctx);
  // The h1 is still there for document structure, but hidden -- the header already
  // says the same thing on every page.
  assert.ok(html.includes('class="visually-hidden"'));
  assert.ok(!/<p class="lead">/.test(html), 'the lead paragraph should be gone');
});

test('112 survives inside Nasveti', () => {
  for (const lang of LANGS) {
    const html = stat.advicePage({ i18n: createI18n(lang, DICTS, new Report()) });
    assert.ok(html.includes('tel:112'), `${lang}: no callable 112`);
    assert.ok(html.includes('id="112"'), `${lang}: no anchor for route pages to link to`);
  }
});

test('every mountain has at least one route, so no browse block renders empty', () => {
  for (const m of derive(REAL).mountains) {
    assert.ok(m.routes.length > 0, `${m.id} has no routes`);
  }
});

test('the search index carries names, regions and trailheads (§4.1)', () => {
  const site = derive(REAL);
  // These are the three things §4.1 says search must cover.
  assert.ok(site.mountains.every(m => m.name && m.region));
  assert.ok(site.routes.every(r => r.name && r.trailhead?.name));
  assert.ok(site.trailheads.length >= 30, 'trailheads must be in the payload to be searchable');
});

test('regional spread: no longer a Gorenjska-only data set (§9)', () => {
  const regions = new Set(derive(REAL).mountains.map(m => m.region));
  assert.ok(regions.size >= 8, `only ${regions.size} regions represented`);
  for (const wanted of ['pohorje', 'primorska', 'notranjska', 'stajerska', 'prekmurje']) {
    assert.ok(regions.has(wanted), `missing ${wanted}`);
  }
});

// --------------------------------------------------------------------------
// v0.6: mountain hub pages removed, Viri out of the nav, multi-select filters.
// --------------------------------------------------------------------------

import { NAV_PAGES } from './lib/paths.js';

test('a mountain is an anchor on the browse page, not a page of its own', () => {
  assert.equal(urlMountain('triglav', 'sl'), '/sl/gore/#triglav');
  assert.equal(urlMountain('triglav', 'en'), '/en/mountains/#triglav');
  assert.equal(typeof core.mountainPage, 'undefined', 'mountainPage must not exist any more');
});

test('every mountain anchor a link points at actually exists on the browse page', () => {
  const ctx = renderCtx();
  const html = core.browsePage(ctx);
  for (const r of ctx.site.routes) {
    const anchor = urlMountain(r.mountainId, 'sl').split('#')[1];
    assert.ok(html.includes(`id="${anchor}"`), `route ${r.id} links to a missing anchor #${anchor}`);
  }
});

test('Viri is still a page but not a nav entry', () => {
  assert.ok(!NAV_PAGES.some(p => p.key === 'sources'), 'sources must be out of the nav');
  assert.ok(PAGES.some(p => p.key === 'sources'), 'but the page must still be emitted');
  assert.equal(urlPage('sources', 'sl'), '/sl/viri/');
  assert.deepEqual(NAV_PAGES.map(p => p.key), ['home', 'browse', 'advice', 'weather']);
});

test('filters render as checkbox groups, so several can be selected at once', () => {
  const html = core.browsePage(renderCtx());
  const diffBoxes = [...html.matchAll(/name="difficulty" value="([a-z-]+)"/g)].map(m => m[1]);
  const regionBoxes = [...html.matchAll(/name="region" value="([a-z-]+)"/g)].map(m => m[1]);
  assert.ok(diffBoxes.length >= 3, `expected several difficulty checkboxes, got ${diffBoxes.length}`);
  assert.ok(regionBoxes.length >= 8, `expected several region checkboxes, got ${regionBoxes.length}`);
  assert.ok(!/<select/.test(html), 'single-select dropdowns should be gone');
});

test('the browse page carries its own search, keyed on diacritic-folded text', () => {
  const html = core.browsePage(renderCtx());
  assert.ok(html.includes('id="browse-q"'), 'search input');
  // "storzic" must match Storžič without the carons a visitor cannot type.
  const block = html.slice(html.indexOf('id="storzic"'));
  const key = block.match(/data-search="([^"]*)"/)[1];
  assert.ok(key.includes('storzic'), 'search key must be diacritic-folded');
  assert.ok(key.includes('jezersko'), 'search key must include trailhead names');
});

// --------------------------------------------------------------------------
// Data provenance.
// --------------------------------------------------------------------------

test('summit coordinates and elevations come from OSM, not from guesses', () => {
  for (const m of REAL.mountains) {
    assert.equal(m.coordsApprox, false, `${m.id} coordinates still approximate`);
    assert.match(m.coordsSource ?? '', /OpenStreetMap|OSM/, `${m.id} has no coordinate source`);
  }
});

test('trailhead elevations are DEM values at the trailhead coordinates', () => {
  for (const t of REAL.trailheads) {
    assert.match(t.elevationSource ?? '', /DEM/, `${t.id} elevation is not sourced`);
  }
});

test('every trailhead sits below its summit', () => {
  const site = derive(REAL);
  for (const r of site.routes) {
    assert.ok(r.trailhead.elevation < r.mountain.elevation,
      `${r.id}: trailhead ${r.trailhead.elevation} m is not below summit ${r.mountain.elevation} m`);
  }
});

test('at most one coordinate pair is still flagged approximate', () => {
  const approx = [...REAL.mountains, ...REAL.trailheads, ...REAL.huts].filter(x => x.coordsApprox);
  assert.ok(approx.length <= 1, `still approximate: ${approx.map(x => x.id).join(', ')}`);
});

test('the search hint is the placeholder, not a paragraph under the box', () => {
  for (const render of [core.homePage, core.browsePage]) {
    const html = render(renderCtx());
    assert.match(html, /placeholder="Išči po imenu gore/, 'hint must be the placeholder');
    assert.ok(!/id="[a-z-]*-hint"/.test(html), 'the separate hint paragraph must be gone');
    assert.ok(!/aria-describedby/.test(html), 'nothing left to describe the input');
  }
});

test('the browse page has no lead paragraph', () => {
  assert.ok(!core.browsePage(renderCtx()).includes('class="lead"'));
});

test('Viri no longer carries a data review status section', () => {
  for (const lang of LANGS) {
    const html = stat.sourcesPage({ i18n: createI18n(lang, DICTS, new Report()), site: derive(REAL) });
    assert.ok(!/Stanje pregleda|Data review status/.test(html), `${lang}: review section still present`);
    assert.ok(!/<details>/.test(html), `${lang}: unreviewed list still present`);
    // Attribution must survive: it is a licence condition, not a nicety.
    assert.ok(/OpenStreetMap/.test(html), `${lang}: OSM attribution missing`);
    assert.ok(/Terrain Tiles/.test(html), `${lang}: DEM attribution missing`);
  }
});

test('the footer credits the layers the map actually uses', () => {
  const html = stat.sourcesPage({ i18n: createI18n('en', DICTS, new Report()), site: derive(REAL) });
  assert.ok(!/OpenTopoMap/.test(html), 'OpenTopoMap is no longer used and must not be credited');
  assert.ok(/CARTO/.test(html), 'the label layer must be credited');
});

// --------------------------------------------------------------------------
// Pre-rendered terrain: the PNG codec, the shipped grid, and the ramp that has to
// stay identical in two places.
// --------------------------------------------------------------------------

import { encodePngGrey, encodePngRgb, decodePng } from './lib/png.js';
import { RAMP, buildRampLut, SLOVENIA } from './lib/terrain.js';

test('the PNG codec round-trips greyscale through the Paeth filter', () => {
  const w = 137, h = 89;                       // deliberately not a round number
  const grey = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grey[y * w + x] = (Math.sin(x / 9) * 60 + Math.cos(y / 7) * 60 + 128) | 0;
  }
  const back = decodePng(encodePngGrey(w, h, grey));
  assert.equal(back.width, w);
  assert.equal(back.height, h);
  assert.equal(back.channels, 1);
  assert.ok(back.data.subarray(0, w * h).equals(grey), 'pixels must survive the filter');
});

test('the PNG codec round-trips RGB', () => {
  const w = 64, h = 48, rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 7) & 0xff;
  const back = decodePng(encodePngRgb(w, h, rgb));
  assert.ok(back.data.subarray(0, rgb.length).equals(rgb));
});

test('the Paeth filter is what makes the grid shippable', () => {
  // Smooth data, like terrain. Unfiltered this deflates to several times the size;
  // the filter is the difference between 354 KB and something not worth shipping.
  const w = 256, h = 256, grey = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grey[y * w + x] = (x + y) >> 1;
  assert.ok(encodePngGrey(w, h, grey).length < w * h / 4,
    'a smooth grid must compress to well under a quarter byte per pixel');
});

test('the shipped elevation grid matches its metadata', () => {
  const meta = readJson('src', 'assets', 'terrain-slovenia.json');
  const png = decodePng(fs.readFileSync(path.join(ROOT, 'src', 'assets', 'terrain-slovenia.png')));
  assert.equal(png.width, meta.width);
  assert.equal(png.height, meta.height);
  assert.equal(png.channels, 1, 'the grid is elevation, not a rendered image');
  assert.deepEqual(meta.bounds, SLOVENIA, 'grid bounds must match the map bounds');
  assert.ok(meta.metresPerStep > 0 && meta.metresPerStep <= 16, 'steps finer than the ramp can show');

  // It has to stay small enough to beat the requests it replaces.
  const kb = fs.statSync(path.join(ROOT, 'src', 'assets', 'terrain-slovenia.png')).size / 1024;
  assert.ok(kb < 500, `elevation grid is ${Math.round(kb)} KB; it must stay well under the ~3 MB of DEM tiles it replaces`);
});

test('the elevation grid actually contains Slovenian terrain', () => {
  const meta = readJson('src', 'assets', 'terrain-slovenia.json');
  const png = decodePng(fs.readFileSync(path.join(ROOT, 'src', 'assets', 'terrain-slovenia.png')));
  let max = 0;
  for (const v of png.data) if (v > max) max = v;
  const highest = max * meta.metresPerStep;
  // Triglav is 2864 m and sits inside the box; downsampling flattens it somewhat.
  assert.ok(highest > 2300, `highest sample is ${highest} m, too low for the Julian Alps`);
  assert.ok(highest < 3200, `highest sample is ${highest} m, too high for Slovenia`);
});

test('the ramp in map.js is identical to the one in terrain.js', () => {
  // map.js is an ES5 browser file with no module loader, so it carries a copy. Drift
  // between the two would show as a seam where the pre-rendered overlay meets the
  // detail tiles.
  const src = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'map.js'), 'utf8');
  const body = src.slice(src.indexOf('var RAMP = ['), src.indexOf('];', src.indexOf('var RAMP = [')) + 1);
  const stops = [...body.matchAll(/\[\s*(-?\d+)\s*,\s*\[\s*(\d+),\s*(\d+),\s*(\d+)\s*\]\s*\]/g)]
    .map(m => [Number(m[1]), [Number(m[2]), Number(m[3]), Number(m[4])]]);
  assert.deepEqual(stops, RAMP, 'src/assets/map.js RAMP has drifted from src/lib/terrain.js');
});

test('the ramp runs light green at the bottom to near-black at the top', () => {
  const { lut, LO } = buildRampLut();
  const at = e => [lut[(e - LO) * 3], lut[(e - LO) * 3 + 1], lut[(e - LO) * 3 + 2]];
  const lum = c => c[0] * 0.2 + c[1] * 0.7 + c[2] * 0.1;
  const low = at(0), high = at(2600);
  assert.ok(lum(low) > 200, `sea level should be light, got ${low}`);
  assert.ok(lum(high) < 25, `2600 m should be near-black, got ${high}`);
  // and monotonically darker in between
  for (let e = 0; e < 2600; e += 100) {
    assert.ok(lum(at(e)) >= lum(at(e + 100)) - 0.5, `ramp brightens between ${e} and ${e + 100} m`);
  }
});

// --------------------------------------------------------------------------
// The map without JavaScript, and where attribution lives.
// --------------------------------------------------------------------------

import { staticMap } from './render/staticmap.js';

const BORDER = readJson('src', 'assets', 'slovenia.geojson');
const homeHtml = (lang = 'sl') => core.homePage({ ...renderCtx(lang), border: BORDER });

test('§4: the home page carries a real map before any script runs', () => {
  const html = homeHtml();
  assert.ok(html.includes('id="map-fallback"'), 'no build-time map');
  assert.ok(/<svg [^>]*viewBox/.test(html), 'fallback must be an inline SVG');
  assert.ok(/<path class="sm-country"/.test(html), 'country outline missing');
});

test('every mountain is a marker on the no-JS map, linking to its anchor', () => {
  const ctx = { ...renderCtx(), border: BORDER };
  const html = core.homePage(ctx);
  const svg = html.slice(html.indexOf('id="map-fallback"'), html.indexOf('</svg>'));
  assert.equal((svg.match(/class="sm-pin/g) || []).length, ctx.site.mountains.length);
  for (const m of ctx.site.mountains) {
    assert.ok(svg.includes(urlMountain(m.id, 'sl')), `${m.id} is not linked from the map`);
  }
});

test('§4: the no-JS map never encodes difficulty by colour alone', () => {
  const ctx = { ...renderCtx(), border: BORDER };
  const html = core.homePage(ctx);
  const svg = html.slice(html.indexOf('id="map-fallback"'), html.indexOf('</svg>'));
  // Every pin carries a <title> naming the grade in words.
  const titles = [...svg.matchAll(/<title>([^<]*)<\/title>/g)].map(m => m[1]);
  assert.equal(titles.length, ctx.site.mountains.length);
  for (const t of titles) assert.match(t, / m — .*pot|brezpotje/, `"${t}" has no grade in words`);
});

test('the no-JS map stays small enough to inline', () => {
  const html = homeHtml();
  const svg = html.slice(html.indexOf('<div class="map-fallback"'), html.indexOf('</svg>') + 6);
  assert.ok(svg.length < 16 * 1024, `inline SVG is ${Math.round(svg.length / 1024)} KB`);
});

test('staticMap degrades to nothing rather than throwing without a border', () => {
  assert.equal(staticMap({ site: derive(REAL), i18n: createI18n('sl', DICTS, new Report()), border: null }), '');
});

test('attribution is page text, and is not duplicated', () => {
  for (const lang of LANGS) {
    const html = homeHtml(lang);
    const at = html.indexOf('map-credit');
    assert.ok(at !== -1, lang + ': no map-credit line');
    const credit = html.slice(at, html.indexOf('</p>', at));
    // ODbL and CARTO both require the credit; it just does not have to sit on the map.
    assert.ok(credit.includes('OpenStreetMap'), `${lang}: OSM credit missing`);
    assert.ok(credit.includes('CARTO'), `${lang}: CARTO credit missing`);
    assert.ok(credit.includes('Terrain Tiles'), `${lang}: elevation credit missing`);
    assert.equal((credit.match(/Terrain Tiles/g) || []).length, 1, `${lang}: elevation credited twice`);
  }
});

test('map.js declares no Leaflet attribution control', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'map.js'), 'utf8');
  assert.match(src, /attributionControl:\s*false/, 'the floating control must be switched off');
  assert.ok(!/attribution:\s*'/.test(src), 'layers must not declare their own attribution any more');
});

test('map.js keeps the fallback when Leaflet cannot load', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'map.js'), 'utf8');
  // The container may only be removed when there is no build-time map inside it.
  assert.match(src, /if \(!document\.getElementById\('map-fallback'\)\) el\.remove\(\);/);
  assert.equal((src.match(/el\.remove\(\)/g) || []).length, 1, 'only giveUp() may remove the container');
});
