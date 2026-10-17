/** A run of words that are the same in both texts, or only in one. */
export interface DiffPart {
  type: "same" | "added" | "removed";
  text: string;
}

/**
 * Word-level diff (Myers' algorithm) between two texts. Whitespace differences are ignored;
 * words are rejoined with single spaces.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];

  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && v[max + k - 1]! < v[max + k + 1]!);
      let x = down ? v[max + k + 1]! : v[max + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[max + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }

  // Walk the trace backwards to recover the edit script.
  const ops: { type: DiffPart["type"]; word: string }[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d]!;
    const k = x - y;
    const down = k === -d || (k !== d && vd[max + k - 1]! < vd[max + k + 1]!);
    const prevK = down ? k + 1 : k - 1;
    const prevX = vd[max + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      y--;
      ops.push({ type: "same", word: a[--x]! });
    }
    if (d > 0) {
      if (down) ops.push({ type: "added", word: b[--y]! });
      else ops.push({ type: "removed", word: a[--x]! });
    }
  }
  ops.reverse();

  const parts: DiffPart[] = [];
  for (const op of ops) {
    const last = parts.at(-1);
    if (last?.type === op.type) last.text += ` ${op.word}`;
    else parts.push({ type: op.type, text: op.word });
  }
  return parts;
}
