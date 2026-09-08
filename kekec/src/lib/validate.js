import { DIFFICULTY, GEAR, REGIONS, SHAPES, rank } from './enums.js';

// DESIGN.md §7, verbatim:
//
//   The build script must ... **fail** on: any route missing `gainM`, `season`,
//   `difficulty` or `verified`; any route whose `difficulty` is below its mountain's
//   `commonSection.difficulty`; any route with a `commonSection` mountain and no
//   `approachDifficulty`.
//
// Those three are marked SPEC below. Everything else is structural: dangling ids,
// unknown enum keys, impossible numbers. A dangling id is not in the spec's list only
// because the spec assumed it obvious.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Rough bounding box for Slovenia. Wide on purpose -- this catches a swapped
// lat/lon pair or a missing minus sign, not a 200 m error.
const BBOX = { latMin: 45.3, latMax: 46.95, lonMin: 13.2, lonMax: 16.7 };

export function validate({ mountains, routes, trailheads, huts }, report) {
  const mById = new Map(mountains.map(m => [m.id, m]));
  const tById = new Map(trailheads.map(t => [t.id, t]));
  const hById = new Map(huts.map(h => [h.id, h]));

  checkCollection(mountains, 'mountain', report);
  checkCollection(routes, 'route', report);
  checkCollection(trailheads, 'trailhead', report);
  checkCollection(huts, 'hut', report);

  for (const m of mountains) validateMountain(m, hById, report);
  for (const t of trailheads) validateCoords(t, `trailhead "${t.id}"`, report);
  for (const h of huts) validateCoords(h, `hut "${h.id}"`, report);
  for (const r of routes) validateRoute(r, mById, tById, hById, report);

  // --- coverage / bias checks, §9 -------------------------------------------
  const usedRegions = new Set(mountains.map(m => m.region));
  if (usedRegions.size < 3) {
    report.warn(`only ${usedRegions.size} region(s) represented - §9 lists "Gorenjska-only bias" as a risk`);
  }
  for (const m of mountains) {
    if (!routes.some(r => r.mountainId === m.id)) {
      report.warn(`mountain "${m.id}" has no routes and will render an empty hub page`);
    }
  }
  const usedTrailheads = new Set(routes.map(r => r.trailheadId));
  for (const t of trailheads) {
    if (!usedTrailheads.has(t.id)) report.warn(`trailhead "${t.id}" is not used by any route`);
  }
  const usedHuts = new Set(mountains.flatMap(m => m.hutIds ?? []));
  for (const h of huts) {
    if (!usedHuts.has(h.id)) report.warn(`hut "${h.id}" is not referenced by any mountain`);
  }
}

function checkCollection(items, kind, report) {
  const seen = new Set();
  for (const it of items) {
    if (!it.id) { report.fail(`a ${kind} has no id`); continue; }
    if (!SLUG.test(it.id)) {
      report.fail(`${kind} id "${it.id}" is not a URL-safe slug (lowercase, digits, single hyphens)`);
    }
    if (seen.has(it.id)) report.fail(`duplicate ${kind} id "${it.id}"`);
    seen.add(it.id);
    if (!it.name || typeof it.name !== 'string') {
      report.fail(`${kind} "${it.id}" has no name`);
    }
  }
}

function validateCoords(obj, label, report) {
  const c = obj.coords;
  if (!Array.isArray(c) || c.length !== 2 || c.some(n => typeof n !== 'number')) {
    report.fail(`${label} has no valid [lat, lon] coords`);
    return;
  }
  const [lat, lon] = c;
  if (lat < BBOX.latMin || lat > BBOX.latMax || lon < BBOX.lonMin || lon > BBOX.lonMax) {
    report.fail(`${label} coords [${lat}, ${lon}] fall outside Slovenia - lat/lon swapped?`);
  }
}

function validateMountain(m, hById, report) {
  validateCoords(m, `mountain "${m.id}"`, report);

  if (typeof m.elevation !== 'number' || m.elevation <= 0) {
    report.fail(`mountain "${m.id}" has no valid elevation`);
  }
  if (!REGIONS.includes(m.region)) {
    report.fail(`mountain "${m.id}" has unknown region "${m.region}"`);
  }
  if (!m.summary?.sl) report.fail(`mountain "${m.id}" has no Slovenian summary (SI is canonical, §3.3)`);
  if (!m.summary?.en) report.warn(`mountain "${m.id}" has no English summary - will render in Slovenian`);

  for (const id of m.hutIds ?? []) {
    if (!hById.has(id)) report.fail(`mountain "${m.id}" references unknown hut "${id}"`);
  }

  const cs = m.commonSection;
  if (cs) {
    if (!DIFFICULTY[cs.difficulty]) {
      report.fail(`mountain "${m.id}" commonSection has unknown difficulty "${cs.difficulty}"`);
    }
    if (!cs.name) report.fail(`mountain "${m.id}" commonSection has no name`);
    if (!cs.note?.sl) report.fail(`mountain "${m.id}" commonSection has no Slovenian note`);
    for (const g of cs.gear ?? []) {
      if (!GEAR[g]) report.fail(`mountain "${m.id}" commonSection lists unknown gear "${g}"`);
    }
  }
}

function validateRoute(r, mById, tById, hById, report) {
  const at = `route "${r.id}"`;

  // --- SPEC §7: required fields --------------------------------------------
  if (typeof r.gainM !== 'number') report.fail(`${at} is missing gainM (§7)`);
  if (!r.season || typeof r.season.from !== 'number' || typeof r.season.to !== 'number') {
    report.fail(`${at} is missing season (§7)`);
  }
  if (!r.difficulty) report.fail(`${at} is missing difficulty (§7)`);
  if (!r.verified || !r.verified.source || !r.verified.date) {
    report.fail(`${at} is missing verified.source / verified.date (§7)`);
  }

  // --- references ------------------------------------------------------------
  const mountain = mById.get(r.mountainId);
  if (!mountain) report.fail(`${at} references unknown mountain "${r.mountainId}"`);
  if (!tById.has(r.trailheadId)) report.fail(`${at} references unknown trailhead "${r.trailheadId}"`);

  // --- enums -----------------------------------------------------------------
  if (r.difficulty && !DIFFICULTY[r.difficulty]) {
    report.fail(`${at} has unknown difficulty "${r.difficulty}" (§5: enum keys, never free text)`);
  }
  if (r.approachDifficulty != null && !DIFFICULTY[r.approachDifficulty]) {
    report.fail(`${at} has unknown approachDifficulty "${r.approachDifficulty}"`);
  }
  if (r.shape && !SHAPES.includes(r.shape)) {
    report.fail(`${at} has unknown shape "${r.shape}"`);
  }
  for (const g of r.gear ?? []) {
    if (!GEAR[g]) report.fail(`${at} lists unknown gear "${g}"`);
  }

  // --- SPEC §2.1 / §5: the two-field rule -----------------------------------
  // "The build fails, not warns, if a route grades below the shared section it must cross."
  const cs = mountain?.commonSection;
  if (cs && r.difficulty && DIFFICULTY[r.difficulty] && DIFFICULTY[cs.difficulty]) {
    if (rank(r.difficulty) < rank(cs.difficulty)) {
      report.fail(
        `${at} is graded "${r.difficulty}" but must cross ${mountain.id}'s common section ` +
        `"${cs.name}" (${cs.difficulty}). §2.1: a route is graded by its hardest section.`
      );
    }
  }
  // "approachDifficulty is required where a commonSection exists. Without it the
  //  comparison table has nothing to compare."
  if (cs && !r.approachDifficulty) {
    report.fail(`${at} is on a mountain with a commonSection but has no approachDifficulty (§5)`);
  }
  if (cs && r.approachDifficulty && !r.approachEndsAt) {
    report.warn(`${at} has an approachDifficulty but no approachEndsAt - the page cannot say where the approach grade stops applying`);
  }
  if (r.approachEndsAt && !hById.has(r.approachEndsAt)) {
    // Free labels are allowed by §5 ("hutId or free label"), so this is a note, not a failure.
    report.note(`  note: ${at} approachEndsAt "${r.approachEndsAt}" is a free label, not a hut id`);
  }

  // --- numbers ---------------------------------------------------------------
  for (const [k, v] of Object.entries({ timeUpMin: r.timeUpMin, timeDownMin: r.timeDownMin })) {
    if (typeof v !== 'number' || v <= 0) report.fail(`${at} has no valid ${k}`);
  }
  if (r.season) {
    for (const k of ['from', 'to']) {
      const v = r.season[k];
      if (typeof v === 'number' && (v < 1 || v > 12)) {
        report.fail(`${at} season.${k} is ${v}, not a month 1-12`);
      }
    }
  }
  // A route cannot gain less than the straight-line difference it must climb.
  const th = tById.get(r.trailheadId);
  if (mountain && th && typeof r.gainM === 'number') {
    const netClimb = mountain.elevation - th.elevation;
    if (r.gainM < netClimb) {
      report.fail(
        `${at} gainM is ${r.gainM} m but the trailhead is ${netClimb} m below the summit - ` +
        `gainM cannot be less than the net climb`
      );
    }
  }
  if (!r.description?.sl) report.fail(`${at} has no Slovenian description (SI is canonical, §3.3)`);
  if (!r.description?.en) report.warn(`${at} has no English description - will render in Slovenian`);

  // --- the human obligation, §9 / open question 7 ---------------------------
  if (r.verified && !r.verified.secondReader) {
    report.review(`${r.id} - graded "${r.difficulty}", source: ${r.verified.source}`);
  }
}

/**
 * Coordinates drive the map, and a wrong marker is visibly wrong in a way a wrong
 * elevation is not. Anything carrying `coordsApprox: true` was entered from general
 * knowledge and not checked against OSM, so the build says how many there are on
 * every run -- the same principle as `verified.secondReader`.
 */
export function reportApproxCoords({ mountains, trailheads }, report) {
  const all = [...mountains, ...trailheads];
  const approx = all.filter(x => x.coordsApprox);
  if (approx.length) {
    report.warn(
      `${approx.length} of ${all.length} coordinate pairs are marked coordsApprox — ` +
      `check against OpenStreetMap before the map is published`
    );
  }
}
