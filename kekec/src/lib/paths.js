// URL shape, DESIGN.md §3.3.
//
//   /sl/gore/triglav              /en/mountains/triglav
//   /sl/poti/triglav-tominskova   /en/routes/triglav-tominskova
//
// Path segments are translated; the slug id is IDENTICAL across languages. That is
// what makes the language switcher able to land on the same page rather than the
// homepage -- switching language is a segment substitution, never a lookup.

export const LANGS = ['sl', 'en'];
export const DEFAULT_LANG = 'sl';   // "/" serves SI

/** Translated path segments. Keys are stable internal names; values are per-language. */
const SEGMENTS = {
  mountains: { sl: 'gore',    en: 'mountains' },
  routes:    { sl: 'poti',    en: 'routes' },
  advice:    { sl: 'nasveti', en: 'advice' },
  weather:   { sl: 'vreme',   en: 'weather' },
  sources:   { sl: 'viri',    en: 'sources' }
};

export function segment(name, lang) {
  const s = SEGMENTS[name];
  if (!s) throw new Error(`unknown path segment: ${name}`);
  return s[lang];
}

/**
 * Every top-level page, in nav order. `key` doubles as the i18n key suffix.
 *
 * `browse` is the merged Gore + Poti index: mountains and their routes are one
 * hierarchy, not two parallel lists, so they get one page and one nav entry. It lives
 * on the `mountains` segment because a mountain is the parent of a route -- route
 * detail pages keep their own `routes` segment but no longer have an index of their own.
 *
 * The map moved onto the home page, so there is no separate Zemljevid page; the gear
 * checklist moved to the foot of the home page, so there is no separate Oprema page.
 */
export const PAGES = [
  { key: 'home',    segment: null },
  { key: 'browse',  segment: 'mountains' },
  { key: 'advice',  segment: 'advice' },
  { key: 'weather', segment: 'weather' },
  // Viri stays a page -- OSM's ODbL attribution has to live somewhere -- but it is a
  // reference, not a destination, so it is linked from the foot of the home page and
  // the footer rather than taking a slot in the nav.
  { key: 'sources', segment: 'sources', nav: false }
];

/** The pages that appear in the header nav. */
export const NAV_PAGES = PAGES.filter(p => p.nav !== false);

// --- URL builders. All return site-absolute paths with a trailing slash, because
// --- every page is emitted as <dir>/index.html (clean URLs on any static host).

export const urlHome      = (lang) => `/${lang}/`;
export const urlPage      = (key, lang) => {
  const page = PAGES.find(p => p.key === key);
  if (!page) throw new Error(`unknown page: ${key}`);
  return page.segment === null ? urlHome(lang) : `/${lang}/${segment(page.segment, lang)}/`;
};
/**
 * A mountain is an anchor on the browse page, not a page of its own.
 *
 * The hub page carried three things: the commonSection warning, the route comparison
 * table and the hut list. The warning now renders on every route page (where it is
 * actually read, next to the grade it qualifies), and the browse page already lists
 * every mountain with all its routes and both grades -- which IS the comparison table
 * from §2.4. The hub was a third copy of the same rows and one more click between a
 * reader and the route they wanted.
 */
export const urlMountain  = (id, lang) => `${urlPage('browse', lang)}#${id}`;
export const urlRoute     = (id, lang) => `/${lang}/${segment('routes', lang)}/${id}/`;

/** Output file for a site-absolute URL: "/sl/gore/triglav/" -> "sl/gore/triglav/index.html" */
export const fileFor = (url) => `${url.replace(/^\/|\/$/g, '')}/index.html`.replace(/^\//, '');

/**
 * The same page in the other language. §3.3: "make the language switcher land on
 * *the same page*, never the homepage."
 */
export function alternate(url, fromLang, toLang) {
  const rest = url.slice(`/${fromLang}/`.length);
  if (rest === '') return urlHome(toLang);
  const [seg, ...tail] = rest.split('/');
  const name = Object.keys(SEGMENTS).find(k => SEGMENTS[k][fromLang] === seg);
  if (!name) throw new Error(`cannot map segment "${seg}" from ${fromLang} to ${toLang}`);
  return `/${toLang}/${segment(name, toLang)}/${tail.join('/')}`;
}
