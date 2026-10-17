export async function readBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif|heic)$/i.test(file.name);
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "document";
}

export function ensurePdfExtension(name: string): string {
  const trimmed = name.trim() || "document";
  return /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
}

export function uid(): string {
  return crypto.randomUUID();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function pluralize(n: number, word: string, plural = `${word}s`): string {
  return `${n} ${n === 1 ? word : plural}`;
}
