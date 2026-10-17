import type { NUpOptions } from "@everything-pdf/engine";
import type { PaperSize } from "@everything-pdf/engine/pure";
import { BookOpen, Columns2, Grid2x2, Maximize } from "lucide-react";
import { useState } from "react";
import {
  Button,
  Checkbox,
  Field,
  Hint,
  PanelSection,
  Segmented,
  inputClass,
} from "../../components/ui";
import { applyToDocument } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { selectedPages, useWorkspace } from "../../store/workspace";

function PaperSelect({ value, onChange }: { value: PaperSize; onChange: (v: PaperSize) => void }) {
  return (
    <Field label="Paper">
      <Segmented
        label="Paper"
        value={value}
        onChange={onChange}
        options={[
          { value: "a4", label: "A4" },
          { value: "letter", label: "Letter" },
          { value: "a3", label: "A3" },
        ]}
      />
    </Field>
  );
}

const REDRAWN = "Pages are redrawn onto new sheets, so links and form fields on them stop working.";

export function NUpPanel() {
  const [opts, setOpts] = useState<NUpOptions>({
    perSheet: 2,
    size: "a4",
    margin: 18,
    gap: 12,
    borders: false,
  });
  return (
    <PanelSection>
      <Field label="Pages per sheet">
        <Segmented
          label="Pages per sheet"
          value={String(opts.perSheet)}
          onChange={(v) => setOpts({ ...opts, perSheet: Number(v) as NUpOptions["perSheet"] })}
          options={["2", "4", "6", "9", "16"].map((v) => ({ value: v, label: v }))}
        />
      </Field>
      <PaperSelect value={opts.size} onChange={(size) => setOpts({ ...opts, size })} />
      <Checkbox
        checked={opts.borders}
        onChange={(borders) => setOpts({ ...opts, borders })}
        label="Draw a border around each page"
      />
      <Hint>Pages go left to right, top to bottom. {REDRAWN}</Hint>
      <Button
        variant="primary"
        className="w-full"
        onClick={() =>
          void applyToDocument(
            "Arranging pages…",
            (bytes) => engine.nUp(bytes, opts),
            `${opts.perSheet} pages per sheet.`,
          )
        }
      >
        <Grid2x2 className="size-4" /> Arrange
      </Button>
    </PanelSection>
  );
}

export function BookletPanel() {
  const [size, setSize] = useState<PaperSize>("a4");
  return (
    <PanelSection>
      <PaperSelect value={size} onChange={setSize} />
      <Hint>
        Two pages per side, ordered so you can print double-sided, fold the stack in half and staple
        it. Print with “flip on short edge”. Blank pages are added at the end if needed.
      </Hint>
      <Hint>{REDRAWN}</Hint>
      <Button
        variant="primary"
        className="w-full"
        onClick={() =>
          void applyToDocument(
            "Making booklet…",
            (bytes) => engine.booklet(bytes, { size, margin: 12 }),
            "Booklet ready. Print double-sided, flipping on the short edge.",
          )
        }
      >
        <BookOpen className="size-4" /> Make booklet
      </Button>
    </PanelSection>
  );
}

export function PosterPanel() {
  const pages = useWorkspace((s) => s.pages);
  const selection = useWorkspace((s) => s.selection);
  const [size, setSize] = useState<PaperSize>("a4");
  const [grid, setGrid] = useState("2x2");
  const [overlap, setOverlap] = useState(true);
  const target = selectedPages({ pages, selection })[0] ?? pages[0];
  const n = target ? pages.indexOf(target) + 1 : 0;
  const [columns, rows] = grid.split("x").map(Number) as [number, number];

  return (
    <PanelSection>
      <Field label="Sheets (across × down)">
        <select value={grid} onChange={(e) => setGrid(e.target.value)} className={inputClass}>
          {["2x1", "1x2", "2x2", "3x2", "2x3", "3x3", "4x4"].map((g) => (
            <option key={g} value={g}>
              {g.replace("x", " × ")}
            </option>
          ))}
        </select>
      </Field>
      <PaperSelect value={size} onChange={setSize} />
      <Checkbox checked={overlap} onChange={setOverlap} label="Overlap tiles by 1 cm for gluing" />
      <Hint>
        Enlarges page {n} across {columns * rows} sheets. Select a different page in the grid to use
        that one. The document is replaced by the tiles (undo brings it back).
      </Hint>
      <Button
        variant="primary"
        className="w-full"
        disabled={!target}
        onClick={() =>
          void applyToDocument(
            "Making poster…",
            (bytes) =>
              engine.poster(bytes, {
                pageIndex: n - 1,
                columns,
                rows,
                size,
                overlap: overlap ? 28 : 0,
              }),
            `Poster split over ${columns * rows} sheets.`,
          )
        }
      >
        <Maximize className="size-4" /> Make poster
      </Button>
    </PanelSection>
  );
}

export function SplitSpreadsPanel() {
  const [direction, setDirection] = useState<"vertical" | "horizontal">("vertical");
  const [rightToLeft, setRightToLeft] = useState(false);
  return (
    <PanelSection>
      <Field label="Cut">
        <Segmented
          label="Cut"
          value={direction}
          onChange={setDirection}
          options={[
            { value: "vertical", label: "Left | right" },
            { value: "horizontal", label: "Top / bottom" },
          ]}
        />
      </Field>
      {direction === "vertical" && (
        <Checkbox
          checked={rightToLeft}
          onChange={setRightToLeft}
          label="Right page first (right-to-left books)"
        />
      )}
      <Hint>
        Every page is cut in two, e.g. a scanned open book becomes single pages. Nothing is redrawn,
        so text and quality stay exactly as they were.
      </Hint>
      <Button
        variant="primary"
        className="w-full"
        onClick={() =>
          void applyToDocument(
            "Splitting pages…",
            (bytes) => engine.splitSpreads(bytes, { direction, rightToLeft }),
            "Pages split in two.",
          )
        }
      >
        <Columns2 className="size-4" /> Split pages
      </Button>
    </PanelSection>
  );
}
