import {
  defaultWatermarkOptions,
  type WatermarkLayout,
  type WatermarkOptions,
} from "@everything-pdf/engine/pure";
import { ImagePlus, Stamp } from "lucide-react";
import { useEffect, useState } from "react";
import { FilePickerButton } from "../../components/Dropzone";
import { Button, Field, PanelSection, Segmented, inputClass } from "../../components/ui";
import { applyToDocument, errorMessage } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { prepareImage, type PreparedImage } from "../../lib/images";
import { useWorkspace } from "../../store/workspace";

export function WatermarkFields({
  value,
  onChange,
}: {
  value: WatermarkOptions;
  onChange: (value: WatermarkOptions) => void;
}) {
  return (
    <>
      <Field label="Text">
        <input
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          maxLength={60}
          className={inputClass}
        />
      </Field>
      <Field label="Direction">
        <Segmented
          label="Direction"
          value={value.layout}
          onChange={(layout: WatermarkLayout) => onChange({ ...value, layout })}
          options={[
            { value: "diagonal", label: "Diagonal" },
            { value: "horizontal", label: "Across" },
          ]}
        />
      </Field>
      <SizeAndStrength value={value} onChange={(patch) => onChange({ ...value, ...patch })} />
    </>
  );
}

function SizeAndStrength({
  value,
  onChange,
}: {
  value: { scale: number; opacity: number };
  onChange: (patch: { scale?: number; opacity?: number }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Size">
        <Segmented
          label="Size"
          value={String(value.scale)}
          onChange={(v) => onChange({ scale: Number(v) })}
          options={[
            { value: "0.4", label: "S" },
            { value: "0.7", label: "M" },
            { value: "0.9", label: "L" },
          ]}
        />
      </Field>
      <Field label="Strength">
        <Segmented
          label="Strength"
          value={String(value.opacity)}
          onChange={(v) => onChange({ opacity: Number(v) })}
          options={[
            { value: "0.1", label: "Faint" },
            { value: "0.2", label: "Med" },
            { value: "0.4", label: "Bold" },
          ]}
        />
      </Field>
    </div>
  );
}

export function WatermarkPanel() {
  const [mode, setMode] = useState<"text" | "image">("text");
  const [opts, setOpts] = useState<WatermarkOptions>(defaultWatermarkOptions);
  const [image, setImage] = useState<(PreparedImage & { url: string }) | null>(null);
  const [imageOpts, setImageOpts] = useState({ scale: 0.4, opacity: 0.2 });

  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.url);
    },
    [image],
  );

  const pickImage = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const prepared = await prepareImage(file);
      const url = URL.createObjectURL(
        new Blob([prepared.bytes as BlobPart], {
          type: prepared.type === "png" ? "image/png" : "image/jpeg",
        }),
      );
      setImage({ ...prepared, url });
    } catch (err) {
      useWorkspace.getState().setNotice({ kind: "error", message: errorMessage(err) });
    }
  };

  const run = () => {
    if (mode === "text") {
      void applyToDocument(
        "Adding watermark…",
        (bytes) => engine.addWatermark(bytes, opts),
        "Watermark added to every page.",
      );
    } else if (image) {
      const input = { bytes: image.bytes, type: image.type };
      void applyToDocument(
        "Adding watermark…",
        (bytes) =>
          // Scale is relative to the page in both directions; S/M/L map to sensible logo sizes.
          engine.addImageWatermark(bytes, input, {
            scale: imageOpts.scale * 0.8,
            opacity: imageOpts.opacity,
          }),
        "Watermark added to every page.",
      );
    }
  };

  return (
    <PanelSection>
      <Segmented
        label="Watermark type"
        value={mode}
        onChange={setMode}
        options={[
          { value: "text", label: "Text" },
          { value: "image", label: "Image" },
        ]}
      />
      {mode === "text" ? (
        <WatermarkFields value={opts} onChange={setOpts} />
      ) : (
        <>
          {image && (
            <div className="flex h-28 items-center justify-center border-2 border-ink bg-card p-3">
              <img src={image.url} alt="Watermark" className="max-h-full max-w-full" />
            </div>
          )}
          <FilePickerButton
            onFiles={(f) => void pickImage(f)}
            accept="image/*"
            className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-ink py-2.5 text-sm hover:bg-paper-3"
          >
            <ImagePlus className="size-4" />{" "}
            {image ? "Choose a different image" : "Choose an image"}
          </FilePickerButton>
          <SizeAndStrength
            value={imageOpts}
            onChange={(p) => setImageOpts((o) => ({ ...o, ...p }))}
          />
        </>
      )}
      <Button
        variant="primary"
        className="w-full"
        disabled={mode === "text" ? !opts.text.trim() : !image}
        onClick={run}
      >
        <Stamp className="size-4" /> Add watermark
      </Button>
    </PanelSection>
  );
}
