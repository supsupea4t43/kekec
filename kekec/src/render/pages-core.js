import { esc, join } from './html.js';
import { staticMap } from './staticmap.js';
import { difficultyBadge, gradePair, timeLine, seasonLine, gearList, routeCard } from './components.js';
import { duration } from '../lib/planner.js';
import { rank, DIFFICULTY_KEYS } from '../lib/enums.js';
import { urlMountain, urlRoute, urlPage } from '../lib/paths.js';

const ARSO = 'https://meteo.arso.gov.si/met/sl/weather/fproduct/';
const KREDARICA = 'https://meteo.arso.gov.si/met/sl/service/';
const directions = (c) => `https://www.openstreetmap.org/?mlat=${c[0]}&mlon=${c[1]}#map=15/${c[0]}/${c[1]}`;

/** Fold diacritics: a visitor without a Slovenian keyboard types "storzic". */
const fold = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Everything a row can be matched on, baked into the HTML at build time so the browse
 * page's search needs no index fetch and works on the rows already rendered.
 */
function searchKey(mountain, i18n) {
  return fold([
    mountain.name,
    i18n.t(`region.${mountain.region}`),
    mountain.region,
    ...mountain.routes.flatMap(r => [r.name, r.trailhead?.name, i18n.t(`difficulty.${r.difficulty}`)])
  ].join(' '));
}

/**
 * Difficulty and region filters as checkbox groups rather than single selects: a reader
 * comparing "what can I do this weekend" wants lahka OR zahtevna, and the Julian Alps OR
 * the Karavanke. No boxes ticked in a group means no constraint from that group.
 */
function filterControls(i18n, site, total) {
  const difficulties = DIFFICULTY_KEYS.filter(d => site.routes.some(r => r.difficulty === d));
  const regions = [...new Set(site.mountains.map(m => m.region))]
    .sort((a, b) => i18n.t(`region.${a}`).localeCompare(i18n.t(`region.${b}`), i18n.lang));

  const boxes = (name, values, label) => `<fieldset class="filter-group">
  <legend>${esc(label)}</legend>
  ${join(values.map(v => `<label class="check"><input type="checkbox" name="${name}" value="${esc(v)}"> ${
    name === 'difficulty' ? difficultyBadge(v, i18n, { small: true }) : esc(i18n.t(`region.${v}`))
  }</label>`))}
</fieldset>`;

  return `${boxes('difficulty', difficulties, i18n.t('filter.difficulty'))}
${boxes('region', regions, i18n.t('filter.region'))}
<p class="filter-status">
  <span id="f-count">${total}</span> / ${total} &middot; ${esc(i18n.t('filter.count'))}
  <button type="button" id="f-clear" class="link-button" hidden>${esc(i18n.t('filter.clear'))}</button>
</p>`;
}

/** The search box. Used on the home page and, with a different target, on browse. */
function searchBox(i18n, { id = 'q', results = true } = {}) {
  return `<div class="search">
  <label class="search-label" for="${id}">${esc(i18n.t('search.label'))}</label>
  <input type="search" id="${id}" autocomplete="off" placeholder="${esc(i18n.t('search.placeholder'))}"${
    results ? ' aria-controls="search-results"' : ''}>
  ${results ? '<ul class="search-results" id="search-results" hidden></ul>' : ''}
</div>`;
}

/**
 * Map attribution.
 *
 * It sits under the map as ordinary page text rather than in Leaflet's floating control,
 * which stacked four clauses -- one of them duplicated -- over the bottom of the picture.
 * ODbL and CARTO's terms require the credit to be present and legible; neither requires
 * it to be an overlay. The Viri page carries the full licensing detail.
 */
function mapCredit(i18n) {
  return [
    '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> ' +
      (i18n.lang === 'sl' ? 'sodelavci' : 'contributors'),
    '&copy; <a href="https://carto.com/attributions" rel="noopener">CARTO</a>',
    (i18n.lang === 'sl' ? 'višine' : 'elevation') +
      ': <a href="https://registry.opendata.aws/terrain-tiles/" rel="noopener">Terrain Tiles</a>'
  ].join(' &middot; ');
}

export function homePage({ i18n, site, border }) {
  // "3 genuinely beginner-friendly routes" (§6). Beginner-friendly means the FULL
  // route grade is lahka -- not the approach grade. Sorting on approach here would
  // put Triglav čez Krmo on the front page, which is the exact failure §2.1 exists
  // to prevent.
  const beginner = site.routes
    .filter(r => r.difficulty === 'lahka')
    .sort((a, b) => a.gainM - b.gainM)
    .slice(0, 3);

  // The site name and tagline are already in the header on every page, so the home
  // page carries no repeat of them -- but it still needs an h1 for structure.
  return `<h1 class="visually-hidden">${esc(i18n.t('site.title'))} — ${esc(i18n.t('site.tagline'))}</h1>

<section class="home-top">
  ${searchBox(i18n)}

  <h2>${esc(i18n.t('home.beginnerHeading'))}</h2>
  <p class="muted">${esc(i18n.t('home.beginnerLead'))}</p>
  <div class="grid">${join(beginner.map(r => routeCard(r, i18n)))}</div>

  <p><a class="button" href="${esc(urlPage('browse', i18n.lang))}">${esc(i18n.t('nav.browse'))}</a></p>
</section>

<div id="map" class="map">${staticMap({ site, i18n, border })}</div>
<p class="muted map-note">${esc(i18n.t('map.note'))}</p>
<p class="muted map-credit">${mapCredit(i18n)}</p>`;
}

export function browsePage({ i18n, site }) {
  const blocks = site.mountains.map(m => {
    const rows = m.routes.map(r => `<li class="route-row" data-difficulty="${esc(r.difficulty)}">
  <a href="${esc(urlRoute(r.id, i18n.lang))}">${esc(r.name)}</a>
  ${difficultyBadge(r.difficulty, i18n, { small: true })}
  ${r.approachDifficulty ? `<span class="muted">${esc(i18n.t('label.approachDifficulty'))}: ${esc(i18n.t(`difficulty.${r.approachDifficulty}`))}</span>` : ''}
  <span class="muted num">${r.gainM} m &middot; ${esc(duration(r.timeUpMin))}</span>
</li>`);

    return `<section class="mountain-block" id="${esc(m.id)}" data-region="${esc(m.region)}" data-mountain="${esc(m.id)}"
      data-search="${esc(searchKey(m, i18n))}">
  <h2>${esc(m.name)}
    <span class="muted">${m.elevation} m &middot; ${esc(i18n.t(`region.${m.region}`))}</span></h2>
  ${m.commonSection ? `<p class="warning-inline">${difficultyBadge(m.commonSection.difficulty, i18n, { small: true })}
    ${esc(i18n.loc(m.commonSection.note, `mountain ${m.id} commonSection.note`))}</p>` : ''}
  <ul class="route-rows">${join(rows)}</ul>
</section>`;
  });

  return `<h1>${esc(i18n.t('browse.heading'))}</h1>

${searchBox(i18n, { id: 'browse-q', results: false })}

<section class="filters" id="filters">
  <h2 class="visually-hidden">${esc(i18n.t('filter.heading'))}</h2>
  ${filterControls(i18n, site, site.routes.length)}
</section>

<div id="browse">${join(blocks)}</div>
<p class="notice" id="no-results" hidden>${esc(i18n.t('filter.none'))}</p>`;
}

export function routePage({ i18n, site, route, plan }) {
  const m = route.mountain;
  const th = route.trailhead;
  const cs = route.commonSection;

  const facts = [
    [i18n.t('label.gain'), `${route.gainM} m`],
    [i18n.t('label.distance'), `${route.distanceKm} km`],
    [i18n.t('label.timeUp'), timeLine(route, i18n)],
    [i18n.t('label.timeDown'), esc(duration(route.timeDownMin))],
    [i18n.t('label.season'), seasonLine(route, i18n)],
    [i18n.t('label.shape'), esc(i18n.t(`shape.${route.shape}`))],
    [i18n.t('label.water'), esc(i18n.loc(route.water, `route ${route.id} water`))],
    [i18n.t('label.trailhead'), `${esc(th?.name ?? '')} <span class="muted">${th?.elevation ?? ''} m</span>`]
  ];

  // §4.2, the start-time helper. All three lines are static text computed at build.
  const stormBlock = plan.stormRelevant ? `<p class="planner-headline">
  ${esc(i18n.t('planner.startBy'))} <strong>${esc(plan.startBy)}</strong>
  <span class="muted">(${esc(duration(route.timeUpMin))} + ${plan.breaksUp} min ${esc(i18n.t('planner.breaks'))})</span>
</p>
<p class="muted">${esc(i18n.t('planner.stormRule'))}</p>` : '';

  const daylightMsg = { fits: 'planner.daylightFits', tight: 'planner.daylightTight', noFit: 'planner.daylightNoFit' }[plan.worst];
  const monthsNoFit = plan.months.filter(x => x.verdict !== 'fits').map(x => i18n.t(`month.${x.month}`));
  const daylightBlock = `<h3>${esc(i18n.t('planner.daylightHeading'))}</h3>
<p>~${esc(duration(plan.roundTripMin))} ${esc(i18n.t('planner.roundTrip'))}. ${esc(i18n.t(daylightMsg))}
${monthsNoFit.length ? `<span class="muted">(${esc(monthsNoFit.join(', '))})</span>` : ''}</p>`;

  const lapseBlock = plan.deltaC != null ? `<h3>${esc(i18n.t('planner.lapseHeading'))}</h3>
<p>${esc(i18n.t('planner.lapseLine', { delta: String(plan.deltaC).replace('.', i18n.lang === 'sl' ? ',' : '.') }))}</p>
<p class="muted">${esc(i18n.t('planner.lapseNote'))} ${plan.trailheadElevation} m &rarr; ${plan.summitElevation} m.</p>` : '';

  return `<p class="crumb"><a href="${esc(urlMountain(m.id, i18n.lang))}">${esc(i18n.t('nav.browse'))} &rsaquo; ${esc(m.name)}</a></p>
<h1>${esc(m.name)} &middot; ${esc(route.name)}</h1>
${gradePair(route, i18n)}

${cs ? `<aside class="warning" role="note">
  <h2>${esc(i18n.t('label.commonSection'))}: ${esc(cs.name)}</h2>
  <p><strong>${esc(i18n.loc(cs.note, `mountain ${m.id} commonSection.note`))}</strong></p>
  <p>${esc(i18n.t(`difficulty.${cs.difficulty}.desc`))}</p>
</aside>` : ''}

<p>${esc(i18n.loc(route.description, `route ${route.id} description`))}</p>

<section>
  <h2>${esc(i18n.t('label.description'))}</h2>
  <dl class="facts facts-wide">${join(facts.map(([k, v]) =>
    `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`))}</dl>
</section>

<section class="planner">
  <h2>${esc(i18n.t('planner.heading'))}</h2>
  ${stormBlock}
  ${daylightBlock}
  ${lapseBlock}
</section>

<section>
  <h2>${esc(i18n.t('label.gear'))}</h2>
  ${gearList(route.gear, i18n)}
</section>

<section>
  <h2>${esc(i18n.t('nav.weather'))}</h2>
  <ul class="plain-list">
    <li><a href="${ARSO}" rel="noopener">ARSO</a></li>
    <li><a href="${KREDARICA}" rel="noopener">Kredarica, 2514 m</a></li>
  </ul>
  <p class="muted"><a href="${esc(urlPage('advice', i18n.lang))}#112">${esc(i18n.t('advice.emergencyHeading'))}</a></p>
</section>

<section>
  <h2>${esc(i18n.t('label.directions'))}</h2>
  <p>${esc(i18n.loc(th?.access, `trailhead ${th?.id} access`))}</p>
  <p>${esc(i18n.loc(th?.parking, `trailhead ${th?.id} parking`))}</p>
  ${th ? `<p><a class="button" href="${esc(directions(th.coords))}" rel="noopener">${esc(i18n.t('label.directions'))}</a></p>` : ''}
</section>

<section class="provenance">
  <h2>${esc(i18n.t('label.verified'))}</h2>
  <p class="muted">${esc(route.verified.source)} &middot; ${esc(route.verified.date)}</p>
  ${route.verified.secondReader
    ? `<p class="muted">2. bralec / second reader: ${esc(route.verified.secondReader)}</p>`
    : `<p class="notice">Ta ocena zahtevnosti še ni bila neodvisno pregledana. / This difficulty grade has not yet been independently reviewed.</p>`}
</section>`;
}
