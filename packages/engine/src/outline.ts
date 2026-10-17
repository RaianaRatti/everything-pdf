import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  type PDFDocument,
  type PDFObject,
} from "pdf-lib";

/** One bookmark, flattened: nesting is given by `level` (0 = top). */
export interface Bookmark {
  title: string;
  /** 0-based page it points to. */
  pageIndex: number;
  level: number;
}

const n = (s: string) => PDFName.of(s);

function text(obj: PDFObject | undefined): string {
  if (obj instanceof PDFString || obj instanceof PDFHexString) return obj.decodeText();
  return "";
}

/** Looks a key up in a name tree (used for named destinations). */
function nameTreeLookup(
  doc: PDFDocument,
  node: PDFDict | undefined,
  key: string,
  depth = 0,
): PDFObject | undefined {
  if (!node || depth > 32) return undefined;
  const names = node.lookupMaybe(n("Names"), PDFArray);
  if (names) {
    for (let i = 0; i + 1 < names.size(); i += 2) {
      if (text(names.lookup(i)) === key) return names.get(i + 1);
    }
  }
  const kids = node.lookupMaybe(n("Kids"), PDFArray);
  for (const kid of kids?.asArray() ?? []) {
    const found = nameTreeLookup(doc, doc.context.lookupMaybe(kid, PDFDict), key, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/**
 * Resolves a destination (explicit array, or a name to look up) or a GoTo action to the page
 * it points at, as a page object reference. Returns undefined for anything else.
 */
export function destinationPage(
  doc: PDFDocument,
  value: PDFObject | undefined,
): PDFRef | undefined {
  let dest = doc.context.lookup(value);
  if (dest instanceof PDFDict) {
    // A GoTo action, or a named-destination entry ({ D: [...] }).
    const s = dest.get(n("S"));
    if (s && s !== n("GoTo")) return undefined;
    dest = doc.context.lookup(dest.get(n("D")));
  }
  if (dest instanceof PDFName || dest instanceof PDFString || dest instanceof PDFHexString) {
    const key = dest instanceof PDFName ? dest.decodeText() : text(dest);
    const fromTree = nameTreeLookup(
      doc,
      doc.catalog.lookupMaybe(n("Names"), PDFDict)?.lookupMaybe(n("Dests"), PDFDict),
      key,
    );
    const fromDict = doc.catalog.lookupMaybe(n("Dests"), PDFDict)?.get(n(key));
    dest = doc.context.lookup(fromTree ?? fromDict);
    if (dest instanceof PDFDict) dest = doc.context.lookup(dest.get(n("D")));
  }
  if (dest instanceof PDFArray && dest.get(0) instanceof PDFRef) return dest.get(0) as PDFRef;
  return undefined;
}

/** Reads the document's bookmarks, in order. Bookmarks to nothing in this file are left out. */
export function readOutline(doc: PDFDocument): Bookmark[] {
  const pageIndex = new Map(doc.getPages().map((p, i) => [p.ref, i]));
  const out: Bookmark[] = [];
  const seen = new Set<PDFDict>();
  const walk = (first: PDFObject | undefined, level: number) => {
    let item = doc.context.lookupMaybe(first, PDFDict);
    while (item && !seen.has(item) && out.length < 10_000) {
      seen.add(item);
      const target = destinationPage(doc, item.get(n("Dest")) ?? item.get(n("A")));
      const index = target ? pageIndex.get(target) : undefined;
      if (index !== undefined)
        out.push({ title: text(item.get(n("Title"))), pageIndex: index, level });
      walk(item.get(n("First")), index !== undefined ? level + 1 : level);
      item = doc.context.lookupMaybe(item.get(n("Next")), PDFDict);
    }
  };
  const root = doc.catalog.lookupMaybe(n("Outlines"), PDFDict);
  walk(root?.get(n("First")), 0);
  return out;
}

/** Replaces the document's bookmarks. Levels deeper than the previous item + 1 are clamped. */
export function writeOutline(doc: PDFDocument, bookmarks: Bookmark[]): void {
  const pages = doc.getPages();
  const { context } = doc;
  doc.catalog.delete(n("Outlines"));
  const valid = bookmarks.filter((b) => b.pageIndex >= 0 && b.pageIndex < pages.length);
  if (valid.length === 0) return;

  const rootRef = context.nextRef();
  const root = context.obj({ Type: "Outlines" }) as PDFDict;
  interface Node {
    ref: PDFRef;
    dict: PDFDict;
    children: Node[];
  }
  const top: Node[] = [];
  const stack: Node[] = [];
  for (const b of valid) {
    const level = Math.min(b.level, stack.length);
    stack.length = level;
    const dict = context.obj({
      Dest: [pages[b.pageIndex]!.ref, n("Fit")],
    }) as PDFDict;
    dict.set(n("Title"), PDFHexString.fromText(b.title || "Untitled"));
    const node: Node = { ref: context.nextRef(), dict, children: [] };
    (level === 0 ? top : stack[level - 1]!.children).push(node);
    stack.push(node);
  }

  /** Links siblings and parents; returns how many items are visible (all open). */
  const link = (nodes: Node[], parent: PDFRef): number => {
    let count = 0;
    nodes.forEach((node, i) => {
      node.dict.set(n("Parent"), parent);
      if (i > 0) node.dict.set(n("Prev"), nodes[i - 1]!.ref);
      if (i < nodes.length - 1) node.dict.set(n("Next"), nodes[i + 1]!.ref);
      if (node.children.length) {
        node.dict.set(n("First"), node.children[0]!.ref);
        node.dict.set(n("Last"), node.children.at(-1)!.ref);
        const inner = link(node.children, node.ref);
        node.dict.set(n("Count"), PDFNumber.of(inner));
        count += inner;
      }
      context.assign(node.ref, node.dict);
      count++;
    });
    return count;
  };
  const total = link(top, rootRef);
  root.set(n("First"), top[0]!.ref);
  root.set(n("Last"), top.at(-1)!.ref);
  root.set(n("Count"), PDFNumber.of(total));
  context.assign(rootRef, root);
  doc.catalog.set(n("Outlines"), rootRef);
}
