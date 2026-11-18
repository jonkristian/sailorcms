// Minimal object-literal editing for config files (`sveltekit({...})`,
// `svelte.config.js`). Bracket-aware, string/comment-aware scanning; good
// enough for hand-written configs without pulling in a JS parser.

export function skipString(text, i) {
  const q = text[i];
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === q) return j;
  }
  return text.length;
}

export function skipComment(text, i) {
  if (text[i + 1] === '/') {
    const nl = text.indexOf('\n', i);
    return nl === -1 ? text.length : nl;
  }
  const end = text.indexOf('*/', i + 2);
  return end === -1 ? text.length : end + 1;
}

export const isCommentStart = (text, i) =>
  text[i] === '/' && (text[i + 1] === '/' || text[i + 1] === '*');

/** Index of the bracket closing the one at `open`, or -1. */
export function matchBracket(text, open) {
  const pairs = { '{': '}', '(': ')', '[': ']' };
  const stack = [];
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') i = skipString(text, i);
    else if (isCommentStart(text, i)) i = skipComment(text, i);
    else if (pairs[c]) stack.push(pairs[c]);
    else if (c === '}' || c === ')' || c === ']') {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

/** Find a top-level `key:` inside the object opening at `objOpen`. */
export function findKey(text, objOpen, key) {
  const close = matchBracket(text, objOpen);
  if (close === -1) return null;
  const esc = key.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(`(['"]?)${esc}\\1\\s*:\\s*`, 'y');
  let prev = '{';
  for (let i = objOpen + 1; i < close; i++) {
    const c = text[i];
    if (/\s/.test(c)) continue;
    if (isCommentStart(text, i)) {
      i = skipComment(text, i);
      continue;
    }
    if (prev === '{' || prev === ',') {
      re.lastIndex = i;
      const m = re.exec(text);
      if (m) {
        const valueStart = i + m[0].length;
        return { valueStart, valueEnd: findValueEnd(text, valueStart, close) };
      }
    }
    if (c === '"' || c === "'" || c === '`') i = skipString(text, i);
    else if (c === '{' || c === '(' || c === '[') i = matchBracket(text, i);
    if (i === -1) return null;
    prev = text[i];
  }
  return null;
}

export function findValueEnd(text, start, close) {
  let i = start;
  for (; i < close; i++) {
    const c = text[i];
    if (c === ',') break;
    if (c === '"' || c === "'" || c === '`') i = skipString(text, i);
    else if (isCommentStart(text, i)) i = skipComment(text, i);
    else if (c === '{' || c === '(' || c === '[') i = matchBracket(text, i);
  }
  return start + text.slice(start, i).trimEnd().length;
}

export function lineIndentAt(text, idx) {
  const lineStart = text.lastIndexOf('\n', idx) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))[0];
}

export const formatKey = (key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key}'`);

export function insertKey(text, objOpen, key, value, { json = false } = {}) {
  const close = matchBracket(text, objOpen);
  const unit = /\n\t/.test(text) ? '\t' : '  ';
  const base = lineIndentAt(text, objOpen);
  const entry = `${json ? JSON.stringify(key) : formatKey(key)}: ${value}`;
  const inner = text.slice(objOpen + 1, close);
  if (!inner.trim()) {
    return `${text.slice(0, objOpen + 1)}\n${base}${unit}${entry}\n${base}${text.slice(close)}`;
  }
  const lastIdx = objOpen + 1 + inner.trimEnd().length;
  const needsComma = text[lastIdx - 1] !== ',';
  return `${text.slice(0, lastIdx)}${needsComma ? ',' : ''}\n${base}${unit}${entry}${text.slice(lastIdx)}`;
}

/**
 * Ensure `keys` (a nested path) exists in the object at `objOpen`, creating
 * intermediate objects. If the leaf exists, `replace(current)` may return a
 * new value source (or null to keep it). Returns null when an intermediate
 * value isn't an object literal.
 */
export function ensurePath(text, objOpen, keys, value, replace, opts) {
  let open = objOpen;
  for (const key of keys.slice(0, -1)) {
    let found = findKey(text, open, key);
    if (!found) {
      text = insertKey(text, open, key, '{}', opts);
      found = findKey(text, open, key);
    }
    if (!found || text[found.valueStart] !== '{') return null;
    open = found.valueStart;
  }
  const leaf = keys[keys.length - 1];
  const found = findKey(text, open, leaf);
  if (!found) return insertKey(text, open, leaf, value, opts);
  const next = replace?.(text.slice(found.valueStart, found.valueEnd));
  return next == null ? text : text.slice(0, found.valueStart) + next + text.slice(found.valueEnd);
}

/**
 * Top-level entries of the object literal opening at `objOpen`, in order:
 * `{ key, start, valueStart, valueEnd }`. `key` is null for entries that
 * aren't `key: value` or shorthand (spreads, methods, getters).
 */
export function listEntries(text, objOpen) {
  const close = matchBracket(text, objOpen);
  if (close === -1) return null;
  const entries = [];
  const skipTrivia = (i) => {
    while (i < close) {
      if (/\s/.test(text[i])) i++;
      else if (isCommentStart(text, i)) i = skipComment(text, i) + 1;
      else break;
    }
    return i;
  };
  let i = skipTrivia(objOpen + 1);
  while (i < close) {
    const keyed = /(['"]?)([^'"\s:,{}()[\]]+)\1\s*:\s*/y;
    keyed.lastIndex = i;
    const m = keyed.exec(text);
    const shorthand = /([A-Za-z_$][\w$]*)\s*(?=,|\}|\/[/*]|$)/y;
    shorthand.lastIndex = i;
    const s = m ? null : shorthand.exec(text);
    const valueStart = m ? i + m[0].length : i;
    const valueEnd = findValueEnd(text, valueStart, close);
    entries.push({ key: m ? m[2] : s ? s[1] : null, start: i, valueStart, valueEnd });
    i = skipTrivia(valueEnd);
    if (text[i] === ',') i = skipTrivia(i + 1);
    else if (i < close) return null;
  }
  return entries;
}

/**
 * Re-indent the continuation lines of `value` from `from` to `to`, converting
 * any deeper leading tabs to `unit` so tab- and space-indented files don't mix.
 */
export function reindent(value, from, to, unit = '  ') {
  return value
    .split('\n')
    .map((line, n) => {
      if (n === 0 || !line.startsWith(from)) return line;
      const rest = line.slice(from.length);
      const ws = /^[ \t]*/.exec(rest)[0];
      return to + ws.replace(/\t/g, unit) + rest.slice(ws.length);
    })
    .join('\n');
}

/**
 * Remove the `key` entry from the object at `objOpen`, along with its comma
 * and, when it sits on lines of its own, those lines. Unchanged if absent.
 */
export function removeKey(text, objOpen, key) {
  const entries = listEntries(text, objOpen);
  const idx = entries?.findIndex((e) => e.key === key) ?? -1;
  if (idx === -1) return text;
  const entry = entries[idx];
  const close = matchBracket(text, objOpen);
  let start = entry.start;
  let end = entry.valueEnd;
  const after = /^\s*,/.exec(text.slice(end, close));
  if (after) end += after[0].length;

  // Own line(s): drop them whole.
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);
  const ownLines =
    !text.slice(lineStart, start).trim() && lineEnd !== -1 && !text.slice(end, lineEnd).trim();
  if (ownLines) {
    start = lineStart;
    end = lineEnd + 1;
  } else if (!text.slice(lineStart, start).trim()) {
    start = lineStart;
  }

  // Last entry: the comma before it now trails the previous entry.
  let prefix = text.slice(0, start);
  if (!after && idx > 0) {
    const prevEnd = entries[idx - 1].valueEnd;
    const comma = text.indexOf(',', prevEnd);
    if (comma !== -1 && comma < entry.start) {
      prefix = text.slice(0, comma) + text.slice(comma + 1, start);
    }
  }
  const rest = text.slice(end);
  return prefix + (after && !ownLines ? rest.replace(/^[ \t]+/, '') : rest);
}
