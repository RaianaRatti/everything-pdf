/**
 * A small reader for PDF content streams (the drawing instructions of a page). It splits a
 * stream into operations, each an operator with its operands, and remembers where each one sits
 * in the original bytes so an edit can replace just that operation and leave the rest of the
 * stream byte-for-byte intact.
 *
 * Bytes are handled as "binary strings" (one char per byte) so nothing is lost in decoding.
 */

export type Operand =
  | { type: "number"; value: number }
  | { type: "name"; value: string }
  | { type: "other"; raw: string };

export interface Operation {
  operator: string;
  operands: Operand[];
  /** Span in the stream, from the first operand (or the operator) to the end of the operator. */
  start: number;
  end: number;
  /** For inline images (operator "BI"): offset of the ID keyword in the stream. */
  dataStart?: number;
}

export function bytesToBinary(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return out;
}

export function binaryToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

const WHITESPACE = new Set([0, 9, 10, 12, 13, 32]);
const DELIMITERS = new Set([...("()<>[]{}/%" as string)].map((c) => c.charCodeAt(0)));

const isWhite = (c: number) => WHITESPACE.has(c);
const isRegular = (c: number) => !WHITESPACE.has(c) && !DELIMITERS.has(c);

/** Splits a content stream into operations. Malformed input never throws; it's skipped. */
export function parseContent(s: string): Operation[] {
  const ops: Operation[] = [];
  let operands: Operand[] = [];
  let operandStart = -1;
  let i = 0;
  const n = s.length;

  const skipWhitespaceAndComments = () => {
    while (i < n) {
      const c = s.charCodeAt(i);
      if (isWhite(c)) i++;
      else if (c === 37 /* % */) {
        while (i < n && s.charCodeAt(i) !== 10 && s.charCodeAt(i) !== 13) i++;
      } else break;
    }
  };

  /** Skips one balanced literal string starting at "(". */
  const skipLiteralString = () => {
    let depth = 0;
    while (i < n) {
      const c = s.charCodeAt(i++);
      if (c === 92 /* \ */) i++;
      else if (c === 40) depth++;
      else if (c === 41 && --depth === 0) return;
    }
  };

  /** Skips a nested array or dictionary (operands of e.g. TJ, BDC, d), strings included. */
  const skipNested = () => {
    let depth = 0;
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c === 40) {
        skipLiteralString();
      } else if (c === 37) {
        skipWhitespaceAndComments();
      } else if (c === 60 && s.charCodeAt(i + 1) === 60) {
        depth++;
        i += 2;
      } else if (c === 62 && s.charCodeAt(i + 1) === 62) {
        i += 2;
        if (--depth === 0) return;
      } else if (c === 60) {
        // Hex string.
        while (i < n && s.charCodeAt(i) !== 62) i++;
        i++;
        if (depth === 0) return;
      } else if (c === 91) {
        depth++;
        i++;
      } else if (c === 93) {
        i++;
        if (--depth === 0) return;
      } else {
        i++;
      }
    }
  };

  while (true) {
    skipWhitespaceAndComments();
    if (i >= n) break;
    const start = i;
    const c = s.charCodeAt(i);
    if (operandStart < 0) operandStart = start;

    if (c === 47 /* / */) {
      i++;
      while (i < n && isRegular(s.charCodeAt(i))) i++;
      operands.push({ type: "name", value: s.slice(start + 1, i) });
    } else if (c === 40 /* ( */) {
      skipLiteralString();
      operands.push({ type: "other", raw: s.slice(start, i) });
    } else if (c === 60 /* < */) {
      skipNested();
      operands.push({ type: "other", raw: s.slice(start, i) });
    } else if (c === 91 /* [ */) {
      skipNested();
      operands.push({ type: "other", raw: s.slice(start, i) });
    } else if (c === 93 || c === 62 || c === 41 || c === 123 || c === 125) {
      // Stray delimiter; ignore it.
      i++;
    } else {
      while (i < n && isRegular(s.charCodeAt(i))) i++;
      const word = s.slice(start, i);
      const num = Number(word);
      if (word !== "" && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(word) && Number.isFinite(num)) {
        operands.push({ type: "number", value: num });
      } else if (word === "true" || word === "false" || word === "null") {
        operands.push({ type: "other", raw: word });
      } else if (word === "BI") {
        // Inline image: dictionary up to ID, one whitespace byte, data, then EI.
        const id = findKeyword(s, "ID", i);
        if (id < 0) break;
        const ei = findInlineImageEnd(s, id + 3);
        i = ei < 0 ? n : ei + 2;
        ops.push({ operator: "BI", operands: [], start, end: i, dataStart: id });
        operands = [];
        operandStart = -1;
      } else {
        ops.push({ operator: word, operands, start: operandStart, end: i });
        operands = [];
        operandStart = -1;
      }
    }
  }
  return ops;
}

/** Finds a keyword delimited by whitespace, starting at `from`. */
function findKeyword(s: string, word: string, from: number): number {
  let i = from;
  while ((i = s.indexOf(word, i)) >= 0) {
    const before = s.charCodeAt(i - 1);
    const after = s.charCodeAt(i + word.length);
    if ((isWhite(before) || DELIMITERS.has(before)) && (Number.isNaN(after) || isWhite(after))) {
      return i;
    }
    i += word.length;
  }
  return -1;
}

/** Inline image data is binary; EI must stand alone between whitespace to count as the end. */
function findInlineImageEnd(s: string, from: number): number {
  let i = from;
  while ((i = s.indexOf("EI", i)) >= 0) {
    const before = s.charCodeAt(i - 1);
    const after = s.charCodeAt(i + 2);
    if (isWhite(before) && (Number.isNaN(after) || isWhite(after))) return i;
    i += 2;
  }
  return -1;
}

/** Applies replacements (sorted or not) to spans of the original string. */
export function splice(s: string, edits: { start: number; end: number; text: string }[]): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let out = "";
  let at = 0;
  for (const e of sorted) {
    if (e.start < at) continue; // overlapping edit; keep the first
    out += s.slice(at, e.start) + e.text;
    at = e.end;
  }
  return out + s.slice(at);
}

/** Formats a number for a content stream: short, no exponent. */
export function fmt(n: number): string {
  const r = Math.round(n * 10000) / 10000;
  return Object.is(r, -0) ? "0" : String(r);
}
