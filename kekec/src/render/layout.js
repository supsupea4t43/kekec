import { esc, join } from './html.js';
import { LANGS, DEFAULT_LANG, NAV_PAGES, urlPage, alternate } from '../lib/paths.js';

/**
 * The page shell.
 *
 * `body` must already be rendered, because the "not yet translated" notice (§3.3)
 * depends on whether anything inside it fell back to Slovenian -- which is only
 * known after the body has been built.
 */
export function layout({ i18n, url, title, body, activePage, bodyClass = '', head = '', scripts = [] }) {
  const { lang, t } = i18n;
  const fullTitle = title ? `${title} — ${t('site.title')}` : `${t('site.title')} — ${t('site.tagline')}`;
  const other = LANGS.find(l => l !== lang);

  const alternates = join(LANGS.map(l =>
    `<link rel="alternate" hreflang="${l}" href="${esc(alternate(url, lang, l))}">`
  ));

  const nav = join(NAV_PAGES.map(p => {
    const href = urlPage(p.key, lang);
    const current = p.key === activePage;
    return `<li><a href="${esc(href)}"${current ? ' aria-current="page"' : ''}>${esc(t(`nav.${p.key}`))}</a></li>`;
  }));

  // §3.3: missing EN renders SI with a visible notice.
  const fallbackNotice = i18n.hadFallback()
    ? `<p class="notice notice-translate">${esc(t('site.notTranslated'))}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(t('site.tagline'))}">
${alternates}
<link rel="alternate" hreflang="x-default" href="${esc(alternate(url, lang, DEFAULT_LANG))}">
<link rel="stylesheet" href="/assets/site.css">
${head}
</head>
<body class="${esc(bodyClass)}">
<a class="skip" href="#main">${esc(t('site.skipToContent'))}</a>
<header class="site-header">
  <div class="bar">
    <a class="brand" href="${esc(urlPage('home', lang))}">
      <strong>${esc(t('site.title'))}</strong>
      <span class="muted">${esc(t('site.tagline'))}</span>
    </a>
    <a class="lang-switch" href="${esc(alternate(url, lang, other))}" lang="${other}" hreflang="${other}">${esc(t('site.switchTo'))}</a>
  </div>
  <nav aria-label="${esc(t('site.title'))}"><ul>${nav}</ul></nav>
</header>
<main id="main">
${fallbackNotice}
${body}
</main>
<footer class="site-footer">
  <p class="disclaimer" lang="sl"><em>Informacije so informativne narave. Pred odhodom vedno preveri vreme in aktualno stanje poti.</em></p>
  <p class="disclaimer" lang="en"><em>This information is indicative. Always check the weather and current trail conditions before setting out.</em></p>
  <p class="muted">${esc(t('footer.dataNote'))}</p>
  <p class="muted">Map data &copy; OpenStreetMap contributors &middot; relief: Terrain Tiles &middot; <a href="${esc(urlPage('sources', lang))}">${esc(t('nav.sources'))}</a></p>
</footer>
${join(scripts.map(s => `<script src="${esc(s)}" defer></script>`))}
</body>
</html>
`;
}
