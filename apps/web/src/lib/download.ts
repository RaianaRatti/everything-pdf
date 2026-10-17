import { zipSync } from "fflate";

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before releasing the data.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadBytes(bytes: Uint8Array, filename: string, type = "application/pdf"): void {
  downloadBlob(new Blob([bytes as BlobPart], { type }), filename);
}

export interface NamedFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * Downloads one file directly, or several as a ZIP. Entries are stored without compression:
 * PDFs and images are already compressed, so deflating them again only costs time.
 */
export function downloadFiles(files: NamedFile[], zipName: string, type?: string): void {
  if (files.length === 1) {
    downloadBytes(files[0]!.bytes, files[0]!.name, type);
    return;
  }
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) entries[f.name] = [f.bytes, { level: 0 }];
  downloadBytes(zipSync(entries), zipName, "application/zip");
}
