// Translation lookup and the SI-canonical fallback policy, DESIGN.md §3.3.
//
//   "SI is canonical. Missing EN renders SI with a visible 'Ni še prevedeno /
//    Not yet translated' notice, and the build warns on every missing EN key."
//
// Two separate mechanisms, often confused:
//   t(key)   -- UI strings from i18n/{sl,en}.json. Missing SI is a build FAILURE
//               (there is nothing to fall back to). Missing EN is a WARNING.
//   loc(f)   -- localized data fields, { "sl": "...", "en": "..." } in data/*.json.
//               Missing EN renders the SI text and flags the page.

/**
 * @param {string} lang
 * @param {{sl: object, en: object}} dicts
 * @param {import('./report.js').Report} report
 */
export function createI18n(lang, dicts, report) {
  const dict = dicts[lang];
  const canonical = dicts.sl;
  let fellBack = false;

  /** UI string. `vars` interpolates {name} placeholders. */
  function t(key, vars) {
    let s = dict[key];
    if (s === undefined) {
      if (canonical[key] === undefined) {
        report.fail(`i18n: key "${key}" is missing from i18n/sl.json (SI is canonical, nothing to fall back to)`);
        return `[[${key}]]`;
      }
      report.warn(`i18n: key "${key}" missing from i18n/${lang}.json — rendered in Slovenian`);
      s = canonical[key];
      fellBack = true;
    }
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  }

  /**
   * Localized data field. Accepts { sl, en } or a plain string (proper nouns are
   * stored unlocalized -- §3.2 -- and pass straight through).
   */
  function loc(field, what = 'field') {
    if (field == null) return '';
    if (typeof field === 'string') return field;      // not localized by design
    const v = field[lang];
    if (v !== undefined && v !== null && v !== '') return v;
    const sl = field.sl;
    if (sl === undefined || sl === null || sl === '') return '';
    if (lang !== 'sl') {
      report.warn(`i18n: ${what} has no "${lang}" text — rendered in Slovenian`);
      fellBack = true;
    }
    return sl;
  }

  return {
    lang,
    t,
    loc,
    /** True if anything on the page in progress fell back to Slovenian. */
    hadFallback: () => fellBack,
    resetFallback: () => { fellBack = false; },
    /** Coverage figure for the build report. */
    coverage: () => {
      const total = Object.keys(canonical).length;
      const have = Object.keys(canonical).filter(k => dict[k] !== undefined).length;
      return { have, total };
    }
  };
}
