import { harder, rank, sortGear, DIFFICULTY } from './enums.js';

// commonSection propagation, DESIGN.md §2.4:
//
//   "At build time, every route's `difficulty` is
//    max(routeDifficulty, mountain.commonSection.difficulty) and every route's `gear`
//    is a union with `commonSection.gear`. Not a rendering convention -- a build step,
//    so it cannot be forgotten on one route out of seven."
//
// §5 additionally says the build FAILS when a route grades below the section it must
// cross. Those two rules are not redundant and both are implemented:
//
//   validate.js  fails the build     -- so an authoring mistake is never silently patched
//   derive.js    applies max() anyway -- so no renderer can ever emit an under-graded page
//                                        even if the check above were loosened
//
// The failure catches the human error; the max() is the structural guarantee.

/**
 * Joins the four data files into one graph and computes every derived field.
 * Pure: does not mutate its inputs.
 */
export function derive({ mountains, routes, trailheads, huts }) {
  const mountainById = new Map(mountains.map(m => [m.id, m]));
  const trailheadById = new Map(trailheads.map(t => [t.id, t]));
  const hutById = new Map(huts.map(h => [h.id, h]));

  const derivedRoutes = routes.map(route => {
    const mountain = mountainById.get(route.mountainId);
    const trailhead = trailheadById.get(route.trailheadId);
    const common = mountain?.commonSection ?? null;

    // --- the two-field rule, §2.1 ---------------------------------------------
    const authored = route.difficulty;
    const difficulty = common ? harder(authored, common.difficulty) : authored;
    const raisedByCommonSection = difficulty !== authored;

    // --- gear: union, never max ------------------------------------------------
    // Gear unions independently of the difficulty max() so the common section's gear
    // implication survives even when the max() picks a different grade (see the
    // brezpotje caveat in enums.js).
    const gear = sortGear([
      ...(DIFFICULTY[difficulty]?.gear ?? []),
      ...(common?.gear ?? []),
      ...(route.gear ?? [])
    ]);

    const timeUpMin = route.timeUpMin ?? 0;
    const timeDownMin = route.timeDownMin ?? 0;

    return {
      ...route,
      difficulty,
      authoredDifficulty: authored,
      raisedByCommonSection,
      gear,
      totalTimeMin: timeUpMin + timeDownMin,
      // Resolved references, so templates never do lookups.
      mountain,
      trailhead,
      commonSection: common,
      approachEndsAtHut: route.approachEndsAt ? hutById.get(route.approachEndsAt) ?? null : null,
      seasonMonths: monthRange(route.season?.from, route.season?.to)
    };
  });

  const routesByMountain = new Map(mountains.map(m => [m.id, []]));
  for (const r of derivedRoutes) routesByMountain.get(r.mountainId)?.push(r);

  const derivedMountains = mountains.map(m => {
    const rs = routesByMountain.get(m.id) ?? [];
    return {
      ...m,
      routes: sortRoutesForComparison(rs),
      huts: (m.hutIds ?? []).map(id => hutById.get(id)).filter(Boolean),
      // Marker styling on the map keys off the HARDEST route on the mountain (§4).
      hardestDifficulty: rs.length
        ? rs.map(r => r.difficulty).reduce(harder)
        : null,
      easiestApproach: rs.length
        ? rs.filter(r => r.approachDifficulty)
             .map(r => r.approachDifficulty)
             .sort((a, b) => rank(a) - rank(b))[0] ?? null
        : null
    };
  });

  // Back-link the derived mountain onto each route so both directions are resolved.
  const dmById = new Map(derivedMountains.map(m => [m.id, m]));
  for (const r of derivedRoutes) r.mountain = dmById.get(r.mountainId) ?? r.mountain;

  return { mountains: derivedMountains, routes: derivedRoutes, trailheads, huts };
}

/**
 * §2.4: the mountain page carries "a route comparison table sorted by
 * approachDifficulty -- that table is now the site's centrepiece".
 * Ties break on ascent, so the easiest day of two equal grades comes first.
 */
export function sortRoutesForComparison(routes) {
  return [...routes].sort((a, b) => {
    const ra = a.approachDifficulty ? rank(a.approachDifficulty) : rank(a.difficulty);
    const rb = b.approachDifficulty ? rank(b.approachDifficulty) : rank(b.difficulty);
    return ra - rb || (a.gainM ?? 0) - (b.gainM ?? 0) || a.name.localeCompare(b.name, 'sl');
  });
}

/** Inclusive month range, wrapping across the new year (e.g. 11 -> 3). */
export function monthRange(from, to) {
  if (!from || !to) return [];
  const out = [];
  for (let m = from, guard = 0; guard < 12; guard++) {
    out.push(m);
    if (m === to) break;
    m = m === 12 ? 1 : m + 1;
  }
  return out;
}
