import { useRef, useState, type ReactNode } from "react";

export function Dropzone({
  onFiles,
  accept,
  title,
  subtitle,
}: {
  onFiles: (files: File[]) => void;
  accept: string;
  title: string;
  subtitle?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
      className={`flex flex-col items-center justify-center gap-4 border-2 border-dashed border-ink px-6 py-20 text-center ${
        over ? "bg-paper-3" : "bg-paper"
      }`}
    >
      <p className="text-xl">{title}</p>
      {subtitle && <p className="text-sm text-ink-2">{subtitle}</p>}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="border-2 border-ink bg-ink px-5 py-2.5 text-paper hover:bg-paper hover:text-ink"
      >
        choose files
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** A plain button that opens a file picker. */
export function FilePickerButton({
  onFiles,
  accept,
  children,
  className = "",
}: {
  onFiles: (files: File[]) => void;
  accept: string;
  children: ReactNode;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={className}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </>
  );
}
