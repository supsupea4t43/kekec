// The start-time helper, DESIGN.md §4.2. Computed at build time from fields the data
// model already requires -- "it costs a build-script function rather than an integration".
//
// Three outputs, all static text on the route page:
//   1. storm rule   -- startBy = 14:00 - timeUpMin - breaks
//   2. daylight     -- round trip vs. daylight for each month of the route's season
//   3. lapse rate   -- -0.65 C per 100 m applied to the mountain's own elevation
//
// The constants below are calibrated against the worked examples in §4.2 so the site
// and the spec cannot drift apart silently. Both examples use Tominskova pot:
//   "6 h 40 up. Leave Vrata by 06:30"        -> BREAK_FRACTION
//   "11 h 40 round trip ... September ... does not fit"  -> DAYLIGHT table
//   "Summit is ~12 C colder than the trailhead"          -> LAPSE_RATE

/** Target time to be off the exposed section (§4.2, "off by ~14:00"). */
export const STORM_DEADLINE_MIN = 14 * 60;

/**
 * Break allowance as a fraction of walking time: 7.5 min per hour.
 * Calibrated to the spec's example -- 400 min up + 50 min breaks = 450, and
 * 14:00 - 7 h 30 = 06:30, the figure §4.2 prints.
 */
export const BREAK_FRACTION = 0.125;

/** DESIGN.md §4.2 and the Vreme page: -0.65 C per 100 m. */
export const LAPSE_RATE_PER_100M = 0.65;

/**
 * Sunrise / sunset in local time, mid-month, for roughly 46.1 N -- "a static table,
 * computed once -- Slovenia is one small latitude band" (§4.2). Minutes from midnight,
 * local wall clock, so the CET/CEST switch is already baked in.
 *
 * Indicative to a few minutes. Good enough to answer "does this fit in a day", which
 * is the only question asked of it; not good enough to plan a sunrise summit by.
 */
export const DAYLIGHT = {
  1:  { sunrise: 455, sunset: 995 },   // 07:35 - 16:35
  2:  { sunrise: 420, sunset: 1045 },  // 07:00 - 17:25
  3:  { sunrise: 370, sunset: 1090 },  // 06:10 - 18:10
  4:  { sunrise: 370, sunset: 1195 },  // 06:10 - 19:55  (CEST)
  5:  { sunrise: 325, sunset: 1235 },  // 05:25 - 20:35
  6:  { sunrise: 300, sunset: 1260 },  // 05:00 - 21:00
  7:  { sunrise: 315, sunset: 1255 },  // 05:15 - 20:55
  8:  { sunrise: 350, sunset: 1215 },  // 05:50 - 20:15
  9:  { sunrise: 395, sunset: 1155 },  // 06:35 - 19:15
  10: { sunrise: 435, sunset: 1095 },  // 07:15 - 18:15
  11: { sunrise: 420, sunset: 995 },   // 07:00 - 16:35  (CET)
  12: { sunrise: 450, sunset: 980 }    // 07:30 - 16:20
};

export const daylightMinutes = (month) => DAYLIGHT[month].sunset - DAYLIGHT[month].sunrise;

/** Minutes from midnight -> "06:30". Negative or >24 h clamps and is flagged by the caller. */
export function clock(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Minutes -> "6 h 40" / "45 min". Slovenian and English share this format. */
export function duration(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/**
 * @param {object} route  a derived route (needs timeUpMin, timeDownMin, season, mountain, trailhead)
 * @returns {object} plan  language-independent numbers; templates do the wording
 */
export function plan(route) {
  const up = route.timeUpMin;
  const down = route.timeDownMin;
  const breaksUp = Math.round(up * BREAK_FRACTION / 5) * 5;
  const breaksTotal = Math.round((up + down) * BREAK_FRACTION / 5) * 5;

  // --- 1. storm rule --------------------------------------------------------
  const startByMin = STORM_DEADLINE_MIN - up - breaksUp;

  // The rule is about summer convection over exposed ground. On a 1-hour walk up a
  // 669 m hill in January it is noise, so it is computed always and shown selectively.
  const convective = route.seasonMonths.some(m => m >= 5 && m <= 9);
  const exposed = route.difficulty !== 'lahka' || (route.mountain?.elevation ?? 0) >= 1500;
  const stormRelevant = convective && exposed;

  // --- 2. daylight ----------------------------------------------------------
  const roundTrip = up + down + breaksTotal;
  const months = route.seasonMonths.map(month => {
    const light = daylightMinutes(month);
    const verdict = roundTrip > light ? 'noFit' : roundTrip > light - 60 ? 'tight' : 'fits';
    // Starting before sunrise is not automatically wrong -- it is normal on Triglav --
    // but the page should say so rather than let someone discover it at the trailhead.
    const beforeSunrise = startByMin < DAYLIGHT[month].sunrise;
    return { month, light, verdict, beforeSunrise };
  });

  const worst = months.some(m => m.verdict === 'noFit') ? 'noFit'
              : months.some(m => m.verdict === 'tight') ? 'tight'
              : 'fits';

  // --- 3. lapse rate --------------------------------------------------------
  const summit = route.mountain?.elevation ?? null;
  const base = route.trailhead?.elevation ?? null;
  const deltaC = summit != null && base != null
    ? Math.round(((summit - base) / 100) * LAPSE_RATE_PER_100M * 10) / 10
    : null;

  return {
    startByMin,
    startBy: clock(startByMin),
    breaksUp,
    breaksTotal,
    stormRelevant,
    roundTripMin: roundTrip,
    months,
    worst,
    deltaC,
    summitElevation: summit,
    trailheadElevation: base
  };
}
