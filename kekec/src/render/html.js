// Minimal HTML helpers. No template engine -- §7: "One script, no framework."

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape for text content and double-quoted attribute values. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);

/** Join, dropping null/undefined/false so templates can use `cond && html` inline. */
export const join = (parts, sep = '\n') => parts.filter(Boolean).join(sep);

/** Attribute list from an object; false/null/undefined drop out, true renders bare. */
export function attrs(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== false && v != null && v !== '')
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`))
    .join('');
}

/** JSON safe to inline inside a <script> element. */
export const jsonScript = (data) =>
  JSON.stringify(data).replace(/</g, '\u003c').replace(/-->/g, '--\u003e');
