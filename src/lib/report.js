// Build report. Three severities, deliberately:
//
//   fail()   -- the build stops. Reserved for the conditions DESIGN.md §7 says must
//               fail, plus structural errors (dangling ids, unknown enums).
//   warn()   -- the build continues. Missing EN strings (§3.3), soft data smells.
//   review() -- neither an error nor a warning: a human obligation. §9 makes a
//               second reader on every difficulty grade the project's only remaining
//               safety-critical dependency, and open question 7 says it must not be
//               the person who entered the grade. A field that is merely *present*
//               would let that obligation go quiet, so the build prints it every time.

const ESC = '\x1b[';
const ANSI = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (ANSI ? `${ESC}${code}m${s}${ESC}0m` : s);
export const red = (s) => c('31', s);
export const yellow = (s) => c('33', s);
export const cyan = (s) => c('36', s);
export const dim = (s) => c('2', s);
export const bold = (s) => c('1', s);

export class Report {
  constructor() {
    this.errors = new Map();    // message -> count
    this.warnings = new Map();
    this.reviews = [];
    this.notes = [];
  }

  #add(map, msg) { map.set(msg, (map.get(msg) ?? 0) + 1); }

  fail(msg) { this.#add(this.errors, msg); }
  warn(msg) { this.#add(this.warnings, msg); }
  review(item) { this.reviews.push(item); }
  note(msg) { this.notes.push(msg); }

  get failed() { return this.errors.size > 0; }

  /** Deduplicated, count-suffixed lines. Keeps a per-route warning from printing 14 times. */
  #lines(map) {
    return [...map.entries()].map(([m, n]) => (n > 1 ? `${m} ${dim(`(x${n})`)}` : m));
  }

  print({ enCoverage } = {}) {
    for (const n of this.notes) console.log(n);

    if (this.warnings.size) {
      console.log('\n' + yellow(bold(`WARNINGS (${this.warnings.size})`)));
      for (const l of this.#lines(this.warnings)) console.log('  ' + yellow('!') + ' ' + l);
    }

    if (this.errors.size) {
      console.log('\n' + red(bold(`ERRORS (${this.errors.size}) - build failed`)));
      for (const l of this.#lines(this.errors)) console.log('  ' + red('x') + ' ' + l);
    }

    if (this.reviews.length) {
      console.log('\n' + cyan(bold(`NEEDS A SECOND READER (${this.reviews.length})`)));
      console.log(dim('  DESIGN.md 9: the difficulty grades are the last safety-critical'));
      console.log(dim('  dependency, and the reviewer must not be the person who entered them.'));
      for (const r of this.reviews) console.log('  ' + cyan('?') + ' ' + r);
    }

    if (enCoverage) {
      const { have, total } = enCoverage;
      const pct = Math.round((have / total) * 100);
      const line = `EN string coverage: ${have}/${total} (${pct}%)`;
      console.log('\n' + (have === total ? line : yellow(line)));
    }
  }
}
