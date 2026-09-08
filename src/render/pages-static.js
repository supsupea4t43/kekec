import { esc, join } from './html.js';
import { gearList } from './components.js';
import { GEAR_KEYS } from '../lib/enums.js';
import { urlPage } from '../lib/paths.js';
import { LAPSE_RATE_PER_100M } from '../lib/planner.js';

// §3.3: "Do not machine-translate the safety pages. V sili, Vreme and Oprema are
// hand-written and reviewed by someone other than the author." The prose therefore
// lives here as parallel SI/EN blocks rather than as i18n keys -- the two versions
// are deliberately NOT sentence-for-sentence mirrors. §3.1: "The EN version needs
// *more* safety context than the SI version, not less."

/** Renders an { sl, en } block of raw HTML for the current language. */
const p = (i18n, block) => block[i18n.lang] ?? block.sl;

/**
 * §6, EN-only additions: "short explainer boxes a Slovenian reader does not need".
 * Renders nothing in SI.
 */
const enOnly = (i18n, html) =>
  i18n.lang === 'en' ? `<aside class="explainer"><h3>For visitors</h3>${html}</aside>` : '';

/**
 * The 112 block. There is no longer a V sili page; this is the whole of what survives
 * of it, and it lives inside Nasveti. Kept to the two things that are useless to look
 * up once you need them: the number, and what the operator will ask for.
 */
export function emergencyBlock(i18n) {
  return `<section class="emergency" id="112">
  <h2>${esc(i18n.t('advice.emergencyHeading'))}</h2>
  <p class="emergency-number"><a href="tel:112">112</a></p>
  <p>${esc(i18n.t('advice.emergencyLead'))}</p>
  <p><strong>${p(i18n, { sl: 'Kaj povedati:', en: 'What to report:' })}</strong>
  ${p(i18n, {
    sl: 'kje si (gora, pot, koordinate), kaj se je zgodilo, koliko ljudi je poškodovanih, kdo kliče, in kakšno je vreme na kraju — vreme odloča o helikopterju. Ne prekini klica, dokler ti operater ne reče.',
    en: 'where you are (mountain, route, coordinates), what happened, how many people are hurt, who is calling, and the weather where you are — the weather decides whether a helicopter can fly. Do not hang up until the operator tells you to.'
  })}</p>
</section>`;
}

/** The tiered checklist. Lives at the foot of the home page; there is no Oprema page. */
export function gearSection(i18n) {
  return `<section id="oprema">
  <h2>${esc(i18n.t('home.gearHeading'))}</h2>
  <p class="muted">${esc(i18n.t('home.gearLead'))}</p>
  ${enOnly(i18n, `<p>Slovenian huts (<em>ko&ccaron;e</em>) are frequently <strong>cash-only</strong> and mobile signal is unreliable, so do not rely on a card. A <em>planinska izkaznica</em> (PZS membership) gets you a discount on a bunk and includes mountain rescue cover.</p>`)}
  ${gearList(GEAR_KEYS, i18n, { grouped: true })}
  <p class="muted">${p(i18n, {
    sl: 'Na zelo zahtevnih poteh je največja nevarnost kamenje, ki ga sprožijo drugi. Čelada in samovarovalni komplet nista oprema za slabo vreme — sta oprema za pot.',
    en: 'On a <em>zelo zahtevna pot</em> the biggest hazard is rock dislodged by people above you. A helmet and a via ferrata set are not bad-weather gear — they are route gear.'
  })}</p>
</section>`;
}

export function advicePage({ i18n }) {
  const weatherHref = urlPage('weather', i18n.lang);
  return `<h1>${esc(i18n.t('nav.advice'))}</h1>

${emergencyBlock(i18n)}

<h2>${p(i18n, { sl: 'Preden greš', en: 'Before you go' })}</h2>
<ul>
  <li>${p(i18n, { sl: `Preveri <a href="${weatherHref}">vreme</a> in razmere na poti. Napoved za dolino ne velja za vrh.`, en: `Check the <a href="${weatherHref}">weather</a> and current conditions. A valley forecast does not apply to a summit.` })}</li>
  <li>${p(i18n, { sl: 'Povej nekomu, kam greš in kdaj se nameravaš vrniti.', en: 'Tell someone where you are going and when you expect to be back.' })}</li>
  <li>${p(i18n, { sl: 'Izberi pot po zmogljivosti <strong>najpočasnejšega</strong> v skupini, ne najhitrejšega.', en: 'Pick the route for the <strong>slowest</strong> person in the group, not the fastest.' })}</li>
  <li>${p(i18n, { sl: 'Vzemi opremo za zahtevnost poti, ne za vreme na parkirišču.', en: 'Pack for the grade of the route, not for the weather at the car park.' })}</li>
</ul>

<h2>${p(i18n, { sl: 'Med potjo', en: 'On the way' })}</h2>
<ul>
  <li>${p(i18n, { sl: 'Obrni se, kadar je treba. Vrh bo tam tudi naslednji teden.', en: 'Turn around when you should. The summit will still be there next week.' })}</li>
  <li>${p(i18n, { sl: 'Snežišče v strmini je nevarnejše, kot izgleda. Brez derez in cepina se mu izogni.', en: 'A snowfield on a steep slope is more dangerous than it looks. Without crampons and an ice axe, go around or go home.' })}</li>
  <li>${p(i18n, { sl: 'Sledi <strong>markacijam</strong>. Če jih dolgo ni, se vrni do zadnje, ki si jo videl.', en: 'Follow the <strong>markacije</strong>. If you have not seen one for a while, go back to the last one you did see.' })}</li>
  <li>${p(i18n, { sl: 'Telefon hrani napolnjen in na toplem. Baterija v mrazu hitro pade.', en: 'Keep your phone charged and warm. Batteries drop fast in the cold.' })}</li>
  <li>${p(i18n, { sl: 'Kamenja ne sprožaj — pod tabo je skoraj vedno nekdo, tudi če ga ne vidiš.', en: 'Do not dislodge stones — there is almost always someone below you, even when you cannot see them.' })}</li>
</ul>

${enOnly(i18n, `<p><strong>Marked paths in Slovenia</strong> use the <em>Knafel&ccaron;eva markacija</em>: a red circle with a white centre, painted on rock and trees. Signposts give walking times in hours, <strong>one way</strong>, assuming a steady pace with no long stops. The numbers on this site follow the same convention.</p>
<p>The PZS grades you will see on those signposts are <em>lahka</em> (easy), <em>zahtevna</em> (demanding) and <em>zelo zahtevna</em> (very demanding, continuously cabled). They are not translated on this site, because the sign at the junction is not translated either.</p>
<p>Much of this ground is inside <strong>Triglav National Park</strong>: no wild camping, no fires, no drones, no picking plants, and dogs on a lead.</p>`)}`;
}

export function weatherPage({ i18n }) {
  const lapseSl = String(LAPSE_RATE_PER_100M).replace('.', ',');
  return `<h1>${esc(i18n.t('nav.weather'))}</h1>

<p class="lead">${p(i18n, {
  sl: 'Vreme v gorah ni vreme v dolini. Razlika ni majhna in ni postopna — pogosto je odločilna.',
  en: 'Mountain weather is not valley weather. The difference is neither small nor gradual — it is often the thing that decides the day.'
})}</p>

<h2>${p(i18n, { sl: 'Temperatura pada z višino', en: 'Temperature falls with height' })}</h2>
<p>${p(i18n, {
  sl: `Približno <strong>&minus;${lapseSl} &deg;C na vsakih 100 m</strong> vzpona. Iz Vrat (1015 m) na Triglav (2864 m) je to okoli 12 &deg;C razlike — še preden upoštevaš veter. Če je v dolini 18 &deg;C, je na vrhu okoli 6 &deg;C.`,
  en: `Roughly <strong>&minus;${LAPSE_RATE_PER_100M} &deg;C for every 100 m</strong> of ascent. From Vrata (1015 m) to Triglav (2864 m) that is about 12 &deg;C — before any wind chill. 18 &deg;C in the valley means around 6 &deg;C on the summit.`
})}</p>
<p class="notice">${p(i18n, {
  sl: 'Zato ta stran ne prikazuje temperature na izhodišču. Ta številka zavaja pri pakiranju.',
  en: 'This is why the site does not show a trailhead temperature. That number leads to the wrong packing decision.'
})}</p>

<h2>${p(i18n, { sl: 'Popoldanske nevihte', en: 'Afternoon storms' })}</h2>
<p>${p(i18n, {
  sl: 'Poleti se v Julijcih nevihte tipično razvijejo čez dan in udarijo popoldne. Zato velja preprosto pravilo: <strong>z izpostavljenega dela dol do 14.00</strong>. Vsaka pot na tej strani ima izračunano uro, do katere je treba kreniti.',
  en: 'In summer, storms over the Julian Alps typically build through the day and break in the afternoon. Hence a simple rule: <strong>be off the exposed section by 14:00</strong>. Every route page here computes the time you need to leave the trailhead.'
})}</p>
<p>${p(i18n, {
  sl: 'Jeklenice in mokre skale so v nevihti nevarne. Zavarovana pot v nevihti ni varno mesto — je najslabše mesto.',
  en: 'Steel cable and wet rock are dangerous in a storm. A via ferrata in a thunderstorm is not a safe place — it is the worst place.'
})}</p>

<h2>${p(i18n, { sl: 'Kje preveriti', en: 'Where to check' })}</h2>
<ul class="plain-list">
  <li><a href="https://meteo.arso.gov.si/met/sl/weather/fproduct/" rel="noopener">ARSO</a> — ${p(i18n, { sl: 'državna napoved, vključno z gorsko napovedjo. To je vir, ki ga uporabljajo slovenski planinci.', en: 'the national forecast, including a dedicated mountain forecast. This is the source Slovenian hikers actually use.' })}</li>
  <li><a href="https://meteo.arso.gov.si/met/sl/service/" rel="noopener">Kredarica, 2514 m</a> — ${p(i18n, { sl: 'izmerjeni podatki z najvišje meteorološke postaje v državi, ne model.', en: 'measured data from the highest weather station in the country — real observations, not a model.' })}</li>
</ul>
<p class="muted">${p(i18n, {
  sl: 'Ta stran namenoma ne prikazuje lastne napovedi. Biti druga najboljša napoved na tvojem telefonu je slabše kot ne biti napoved.',
  en: 'This site deliberately publishes no forecast of its own. Being the second-best forecast on your phone is worse than not being a forecast at all.'
})}</p>`;
}

export function sourcesPage({ i18n, site }) {
  return `<h1>${esc(i18n.t('nav.sources'))}</h1>

<h2>${p(i18n, { sl: 'Viri', en: 'Sources' })}</h2>
<dl class="rules">
  <div><dt>PZS</dt><dd>${p(i18n, { sl: 'Planinska zveza Slovenije — klasifikacija zahtevnosti poti. Primarni vir za ocene na tej strani.', en: 'The Alpine Association of Slovenia — the trail difficulty classification. The primary source for the grades on this site.' })}</dd></div>
  <div><dt>ARSO</dt><dd>${p(i18n, { sl: 'Agencija RS za okolje — vreme. Nanj povezujemo, ne prepisujemo ga.', en: 'The Slovenian Environment Agency — weather. Linked to, never scraped.' })}</dd></div>
  <div><dt>GRZS</dt><dd>${p(i18n, { sl: 'Gorska reševalna zveza Slovenije — reševanje, aktivira se prek 112.', en: 'Mountain Rescue Association of Slovenia — rescue, dispatched through 112.' })}</dd></div>
  <div><dt>OpenStreetMap</dt><dd>${p(i18n, { sl: 'Koordinate vrhov, izhodišč in koč. ODbL, &copy; OpenStreetMap contributors.', en: 'Summit, trailhead and hut coordinates. ODbL, &copy; OpenStreetMap contributors.' })}</dd></div>
  <div><dt>OSM &mdash; meja Slovenije</dt><dd>${p(i18n, { sl: "Obris državne meje za masko na zemljevidu je poenostavljen izvoz iz OpenStreetMap prek Nominatima (ODbL). Uporabljen je samo za risanje oblike države, ne za orientacijo.", en: "The national outline used to mask the map is a simplified export from OpenStreetMap via Nominatim (ODbL). It is used only to draw the shape of the country, never for navigation." })}</dd></div>
  <div><dt>Terrain Tiles (AWS Open Data)</dt><dd>${p(i18n, { sl: "Sloji višin na zemljevidu so izrisani iz digitalnega modela reliefa (Terrain Tiles, AWS Open Data; SRTM in drugi). Barvna lestvica je naša.", en: "The elevation shading on the map is rendered from a digital elevation model (Terrain Tiles, AWS Open Data; SRTM and others). The colour ramp is ours." })}</dd></div>
  <div><dt>CARTO</dt><dd>${p(i18n, { sl: "Napisi krajev na zemljevidu. &copy; OpenStreetMap contributors, &copy; CARTO.", en: "Place labels on the map. &copy; OpenStreetMap contributors, &copy; CARTO." })}</dd></div>
  <div><dt>Hribi.net / Gore-ljudje</dt><dd>${p(i18n, { sl: 'Uporabljeno samo za preverjanje dejstev. Njihova besedila so avtorsko zaščitena in niso prepisana.', en: 'Used for fact-checking only. Their prose is copyrighted and is not reproduced here; every description on this site is written from scratch.' })}</dd></div>
</dl>
`;
}
