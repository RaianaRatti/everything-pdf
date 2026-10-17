import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "border-ink bg-ink text-paper hover:bg-paper hover:text-ink",
  secondary: "border-ink bg-paper text-ink hover:bg-ink hover:text-paper",
  ghost: "border-transparent text-ink hover:border-ink",
  danger: "border-ink bg-paper text-ink hover:bg-ink hover:text-paper",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 border-2 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:border-ink-3 disabled:bg-paper disabled:text-ink-3 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function PanelSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 p-4">
      {title && <p className="text-sm text-ink-2">{title}</p>}
      {children}
    </section>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-ink-2">{children}</p>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-ink">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full border-2 border-ink bg-paper px-3 py-2 text-sm focus:outline-2 focus:outline-offset-1 focus:outline-ink";

export interface Option<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid border-2 border-ink"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-2 py-1.5 text-sm ${
            value === o.value ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-black"
      />
      {label}
    </label>
  );
}
