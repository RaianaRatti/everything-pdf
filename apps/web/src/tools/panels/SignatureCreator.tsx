import { Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { canvasToPng, removeWhiteBackground, trimCanvas, type PngImage } from "../../lib/canvas";
import { Button, Checkbox, Field, Segmented, inputClass } from "../../components/ui";

type Mode = "draw" | "type" | "upload";
type Ink = "#111827" | "#1e3a8a";

const FONTS = [
  { value: "Dancing Script", label: "Elegant" },
  { value: "Caveat", label: "Casual" },
] as const;

export function SignatureCreator({ onCreate }: { onCreate: (sig: PngImage) => void }) {
  const [mode, setMode] = useState<Mode>("draw");
  const [ink, setInk] = useState<Ink>("#111827");

  return (
    <div className="space-y-3">
      <Segmented
        label="Signature type"
        value={mode}
        onChange={setMode}
        options={[
          { value: "draw", label: "Draw" },
          { value: "type", label: "Type" },
          { value: "upload", label: "Upload" },
        ]}
      />
      {mode !== "upload" && (
        <div className="flex items-center gap-2 text-sm text-ink">
          Ink
          {(["#111827", "#1e3a8a"] as Ink[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c === "#111827" ? "Black ink" : "Blue ink"}
              aria-pressed={ink === c}
              onClick={() => setInk(c)}
              className={`size-6 rounded-full ring-2 ring-offset-2 ${ink === c ? "ring-ink" : "ring-transparent"}`}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
      {mode === "draw" && <DrawPad ink={ink} onCreate={onCreate} />}
      {mode === "type" && <TypePad ink={ink} onCreate={onCreate} />}
      {mode === "upload" && <UploadPad onCreate={onCreate} />}
    </div>
  );
}

function DrawPad({ ink, onCreate }: { ink: Ink; onCreate: (sig: PngImage) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvas.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const scale = canvas.current!.width / r.width;
    return { x: (e.clientX - r.left) * scale, y: (e.clientY - r.top) * scale };
  };

  const draw = (e: React.PointerEvent) => {
    if (!last.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const p = point(e);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2.5 * (window.devicePixelRatio || 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setHasInk(true);
  };

  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const create = async () => {
    const trimmed = trimCanvas(canvas.current!);
    if (trimmed) onCreate(await canvasToPng(trimmed));
  };

  return (
    <>
      <canvas
        ref={canvas}
        aria-label="Signature drawing area"
        className="h-40 w-full touch-none bg-card border-2 border-ink"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = point(e);
        }}
        onPointerMove={draw}
        onPointerUp={() => (last.current = null)}
        onPointerCancel={() => (last.current = null)}
      />
      <div className="flex gap-2">
        <Button onClick={clear} disabled={!hasInk}>
          <Eraser className="size-4" /> Clear
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => void create()}
          disabled={!hasInk}
        >
          Use signature
        </Button>
      </div>
    </>
  );
}

function TypePad({ ink, onCreate }: { ink: Ink; onCreate: (sig: PngImage) => void }) {
  const [name, setName] = useState("");
  const [font, setFont] = useState<(typeof FONTS)[number]["value"]>("Dancing Script");

  const create = async () => {
    const css = `600 96px"${font}"`;
    await document.fonts.load(css);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.font = css;
    canvas.width = Math.ceil(ctx.measureText(name).width) + 60;
    canvas.height = 160;
    ctx.font = css; // resizing a canvas resets its context state
    ctx.fillStyle = ink;
    ctx.textBaseline = "middle";
    ctx.fillText(name, 30, 80);
    const trimmed = trimCanvas(canvas);
    if (trimmed) onCreate(await canvasToPng(trimmed));
  };

  return (
    <>
      <Field label="Your name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {FONTS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={font === f.value}
            onClick={() => setFont(f.value)}
            className={`truncate bg-card px-3 py-2 text-2xl ring-2 ${font === f.value ? "ring-ink" : "ring-line"}`}
            style={{ fontFamily: `"${f.value}"`, fontWeight: 600, color: ink }}
          >
            {name || f.label}
          </button>
        ))}
      </div>
      <Button
        variant="primary"
        className="w-full"
        onClick={() => void create()}
        disabled={!name.trim()}
      >
        Use signature
      </Button>
    </>
  );
}

function UploadPad({ onCreate }: { onCreate: (sig: PngImage) => void }) {
  const [transparent, setTransparent] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      if (transparent) removeWhiteBackground(canvas);
      const trimmed = trimCanvas(canvas, 4);
      if (!trimmed) throw new Error("empty");
      onCreate(await canvasToPng(trimmed));
    } catch {
      setError("Couldn't read that image. Try a PNG or JPG.");
    }
  };

  return (
    <>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => void load(e.target.files?.[0])}
        className="block w-full text-sm file:mr-3 file:border-0 file:bg-paper-3 file:px-3 file:py-2 file:text-sm"
      />
      <Checkbox checked={transparent} onChange={setTransparent} label="Remove white background" />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </>
  );
}
