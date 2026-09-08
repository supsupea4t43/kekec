// Controlled vocabularies. DESIGN.md §5: "difficulty, approachDifficulty and gear are
// enum keys, never free text -- they drive filters, marker styling, the gear list and
// both translations."
//
// Nothing in this file is localized. Labels live in i18n/{sl,en}.json under
// difficulty.<key>, gear.<key>, region.<key>. The build fails on any key used here
// that has no SI string.

// PZS scale, DESIGN.md §2.1.
//
// `rank` exists for exactly one purpose: the commonSection propagation rule in §2.4,
//   route.difficulty = max(route.difficulty, mountain.commonSection.difficulty)
// It is an ordering for that max(), not a claim that the scale is one-dimensional.
//
// Caveat worth knowing: `brezpotje` is really a different axis (unmarked vs. marked),
// not "harder than zelo-zahtevna". It ranks highest so that propagation never silently
// downgrades a pathless route to a marked grade. The gear implication of the common
// section survives regardless, because gear is unioned separately from the max() --
// see derive.js. If that ever stops being true, this comment is the bug report.
export const DIFFICULTY = {
  'lahka':          { rank: 1, gear: ['pohodni-cevlji'] },
  'zahtevna':       { rank: 2, gear: ['pohodni-cevlji'] },
  'zelo-zahtevna':  { rank: 3, gear: ['pohodni-cevlji', 'celada', 'samovarovalni-komplet'] },
  'brezpotje':      { rank: 4, gear: ['pohodni-cevlji', 'navigacija'] }
};

export const DIFFICULTY_KEYS = Object.keys(DIFFICULTY);

/** Sort key for a difficulty enum. Throws on unknown input rather than sorting it to 0. */
export function rank(key) {
  const d = DIFFICULTY[key];
  if (!d) throw new Error(`unknown difficulty enum: ${JSON.stringify(key)}`);
  return d.rank;
}

/** The harder of two grades. Used by the build-enforced commonSection rule (§2.4). */
export function harder(a, b) {
  return rank(a) >= rank(b) ? a : b;
}

// Equipment. `tier` drives the Oprema checklist grouping (§6).
//   vedno       - always, any route, any season
//   zavarovane  - via ferrata / zelo zahtevna poti
//   poleti / pozimi - seasonal
export const GEAR = {
  'pohodni-cevlji':        { tier: 'vedno' },
  'nahrbtnik':             { tier: 'vedno' },
  'voda':                  { tier: 'vedno' },
  'prva-pomoc':            { tier: 'vedno' },
  'celna-svetilka':        { tier: 'vedno' },
  'zemljevid':             { tier: 'vedno' },
  'telefon':               { tier: 'vedno' },
  'vetrovka':              { tier: 'vedno' },
  'topla-plast':           { tier: 'vedno' },
  'celada':                { tier: 'zavarovane' },
  'samovarovalni-komplet': { tier: 'zavarovane' },
  'plezalni-pas':          { tier: 'zavarovane' },
  'rokavice':              { tier: 'zavarovane' },
  'soncna-krema':          { tier: 'poleti' },
  'pokrivalo':             { tier: 'poleti' },
  'cepin':                 { tier: 'pozimi' },
  'dereze':                { tier: 'pozimi' },
  'lavinski-komplet':      { tier: 'pozimi' },
  'navigacija':            { tier: 'vedno' }
};

export const GEAR_KEYS = Object.keys(GEAR);
export const GEAR_TIERS = ['vedno', 'zavarovane', 'poleti', 'pozimi'];

/** Stable gear ordering: by tier, then by declaration order. Keeps diffs quiet. */
export function sortGear(keys) {
  const tierIdx = (k) => GEAR_TIERS.indexOf(GEAR[k].tier);
  const declIdx = (k) => GEAR_KEYS.indexOf(k);
  return [...new Set(keys)].sort((a, b) => tierIdx(a) - tierIdx(b) || declIdx(a) - declIdx(b));
}

// Regions. `region` is required on every mountain specifically to make the
// Gorenjska-only bias in §9 visible in the build report rather than invisible.
export const REGIONS = [
  'julijske-alpe',
  'kamnisko-savinjske-alpe',
  'karavanke',
  'pohorje',
  'osrednja-slovenija',
  'zasavje',
  'primorska',
  'notranjska',
  'dolenjska',
  'stajerska',
  'koroska',
  'prekmurje'
];

export const SHAPES = ['linijska', 'krozna'];
