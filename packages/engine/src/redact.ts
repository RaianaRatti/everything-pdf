/**
 * Finding what to redact, and what text may stay. Pure functions, so the browser and the CLI
 * share them (and tests can run them on known layouts).
 *
 * Positions are fractions of the page as displayed, origin top-left, like everywhere else.
 */

export interface TextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * The text doesn't run left to right as displayed (e.g. on a rotated page), so character
   * positions can't be estimated: matches cover the whole run, and a hit removes all of it.
   */
  vertical?: boolean;
}

export interface RedactBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RedactionPattern = "email" | "phone" | "ssn" | "cpf" | "card" | "iban" | "date";

export const REDACTION_PATTERNS: Record<RedactionPattern, { label: string; regex: RegExp }> = {
  email: { label: "Email addresses", regex: /[\w.+-]+@[\w-]+(\.[\w-]+)+/g },
  phone: {
    label: "Phone numbers",
    regex:
      /(?<![\w])(\+\d{1,3}[\s.-]?)?(\(\d{2,4}\)[\s.-]?)?\d{2,5}[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w])/g,
  },
  ssn: { label: "US Social Security numbers", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  cpf: { label: "CPF numbers (Brazil)", regex: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g },
  card: { label: "Card numbers", regex: /\b(?:\d[ -]?){13,19}\b/g },
  iban: { label: "IBANs", regex: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g },
  date: {
    label: "Dates",
    regex: /\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g,
  },
};

/** Escapes text so it can be searched for literally. */
export function literalPattern(text: string, caseSensitive = false): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "g" : "gi");
}

/**
 * Finds every match of `pattern` in the page's text and returns boxes covering it. Runs are
 * joined with spaces, so matches can span runs. Within a run, characters are assumed to be
 * equally wide, so boxes are padded by a character on each side to stay on the safe side.
 */
export function findMatches(runs: TextRun[], pattern: RegExp): RedactBox[] {
  let text = "";
  const starts: number[] = [];
  for (const run of runs) {
    starts.push(text.length);
    text += run.text + " ";
  }
  const regex = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
  );
  const boxes: RedactBox[] = [];
  for (const match of text.matchAll(regex)) {
    if (!match[0].trim()) continue;
    const from = match.index;
    const to = from + match[0].length;
    runs.forEach((run, i) => {
      const a = Math.max(from, starts[i]!) - starts[i]!;
      const b = Math.min(to, starts[i]! + run.text.length) - starts[i]!;
      if (b <= a || run.text.length === 0) return;
      if (run.vertical) {
        boxes.push(
          pad({ x: run.x, y: run.y, width: run.width, height: run.height }, run.width * 0.15),
        );
        return;
      }
      const charWidth = run.width / run.text.length;
      const x0 = run.x + Math.max(0, a - 1) * charWidth;
      const x1 = run.x + Math.min(run.text.length, b + 1) * charWidth;
      boxes.push(pad({ x: x0, y: run.y, width: x1 - x0, height: run.height }, run.height * 0.15));
    });
  }
  return boxes;
}

function pad(box: RedactBox, amount: number): RedactBox {
  return {
    x: Math.max(0, box.x - amount / 4),
    y: Math.max(0, box.y - amount),
    width: box.width + amount / 2,
    height: box.height + amount * 2,
  };
}

const overlaps = (a: RedactBox, b: RedactBox) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * The text that may stay searchable after redaction: each run minus any character that touches
 * a redaction box. A run cut by a box becomes the pieces on either side.
 */
export function keepOutside(runs: TextRun[], boxes: RedactBox[]): TextRun[] {
  const kept: TextRun[] = [];
  for (const run of runs) {
    const hits = boxes.filter((b) => overlaps(run, b));
    if (hits.length === 0) {
      kept.push(run);
      continue;
    }
    if (run.vertical) continue;
    const n = run.text.length;
    const charWidth = n ? run.width / n : 0;
    // Character boxes are narrowed a little so a box's safety padding (which already covers a
    // whole extra character on each side of a match) doesn't also take a sliver of the next one.
    const covered = Array.from({ length: n }, (_, i) => {
      const char = {
        x: run.x + (i + 0.15) * charWidth,
        y: run.y,
        width: charWidth * 0.7,
        height: run.height,
      };
      return hits.some((b) => overlaps(char, b));
    });
    let start = -1;
    for (let i = 0; i <= n; i++) {
      if (i < n && !covered[i]) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        const text = run.text.slice(start, i);
        if (text.trim()) {
          kept.push({
            text,
            x: run.x + start * charWidth,
            y: run.y,
            width: (i - start) * charWidth,
            height: run.height,
          });
        }
        start = -1;
      }
    }
  }
  return kept;
}
