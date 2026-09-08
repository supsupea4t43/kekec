import { esc, join, attrs } from './html.js';
import { GEAR, GEAR_TIERS } from '../lib/enums.js';
import { duration } from '../lib/planner.js';
import { urlRoute } from '../lib/paths.js';

// §4, accessibility: "never encode difficulty by colour alone -- always pair with a
// label or icon". Every badge therefore carries the word, and the shape is a second,
// non-colour channel for anyone who cannot distinguish the hues.
const DIFFICULTY_MARK = {
  'lahka': '\u25CF',           // filled circle
  'zahtevna': '\u25C6',        // filled diamond
  'zelo-zahtevna': '\u25B2',   // filled triangle
  'brezpotje': '\u2715'        // cross
};

export function difficultyBadge(key, i18n, { small = false } = {}) {
  if (!key) return '';
  return `<span class="badge d-${esc(key)}${small ? ' badge-sm' : ''}">` +
    `<span class="badge-mark" aria-hidden="true">${DIFFICULTY_MARK[key] ?? ''}</span>` +
    `${esc(i18n.t(`difficulty.${key}`))}</span>`;
}

/**
 * The pairing §2.1 insists on: "Display them together, never apart."
 *   zelo zahtevna - pristop lahka (do Planike) - zadnji del skupen vsem smerem
 */
export function gradePair(route, i18n) {
  const parts = [difficultyBadge(route.difficulty, i18n)];
  if (route.approachDifficulty) {
    const endsAt = route.approachEndsAtHut?.name ?? route.approachEndsAt;
    const where = endsAt ? ` <span class="muted">(${i18n.t('label.approachTo')} ${esc(endsAt)})</span>` : '';
    parts.push(
      `<span class="approach">${esc(i18n.t('label.approachDifficulty'))}: ` +
      `${difficultyBadge(route.approachDifficulty, i18n, { small: true })}${where}</span>`
    );
  }
  if (route.commonSection) {
    parts.push(`<span class="muted common-hint">${esc(i18n.loc(route.commonSection.note, 'commonSection.note'))}</span>`);
  }
  return `<div class="grade-pair">${join(parts, '\n')}</div>`;
}

/** "7 h (v eno smer) - ~12 h 30 skupaj", §5. */
export function timeLine(route, i18n) {
  return `${esc(duration(route.timeUpMin))} <span class="muted">(${esc(i18n.t('label.oneWay'))})</span>` +
    ` &middot; ~${esc(duration(route.totalTimeMin))} <span class="muted">${esc(i18n.t('label.return'))}</span>`;
}

export function seasonLine(route, i18n) {
  const months = route.seasonMonths;
  if (!months.length) return '';
  const first = i18n.t(`month.${months[0]}`);
  const last = i18n.t(`month.${months[months.length - 1]}`);
  const range = months.length === 12 ? '' : `${esc(first)} \u2013 ${esc(last)}`;
  const note = i18n.loc(route.season?.note, `route ${route.id} season.note`);
  return join([range, note && `<span class="muted">${esc(note)}</span>`], ' &middot; ');
}

export function gearList(keys, i18n, { grouped = false } = {}) {
  if (!keys?.length) return '';
  if (!grouped) {
    return `<ul class="gear">${keys.map(k => `<li>${esc(i18n.t(`gear.${k}`))}</li>`).join('')}</ul>`;
  }
  return join(GEAR_TIERS.map(tier => {
    const inTier = keys.filter(k => GEAR[k].tier === tier);
    if (!inTier.length) return '';
    return `<section class="gear-tier"><h3>${esc(i18n.t(`gearTier.${tier}`))}</h3>` +
      `<ul class="gear checklist">${inTier.map(k =>
        `<li><label><input type="checkbox"> ${esc(i18n.t(`gear.${k}`))}</label></li>`).join('')}</ul></section>`;
  }));
}

export function routeCard(route, i18n) {
  return `<article class="card"${attrs({
    'data-difficulty': route.difficulty,
    'data-approach': route.approachDifficulty ?? '',
    'data-region': route.mountain?.region ?? '',
    'data-gain': route.gainM
  })}>
  <h3><a href="${esc(urlRoute(route.id, i18n.lang))}">${esc(route.mountain?.name)} &middot; ${esc(route.name)}</a></h3>
  ${gradePair(route, i18n)}
  <dl class="facts">
    <div><dt>${esc(i18n.t('label.gain'))}</dt><dd>${route.gainM} m</dd></div>
    <div><dt>${esc(i18n.t('label.timeUp'))}</dt><dd>${timeLine(route, i18n)}</dd></div>
    <div><dt>${esc(i18n.t('label.trailhead'))}</dt><dd>${esc(route.trailhead?.name ?? '')}</dd></div>
  </dl>
</article>`;
}
