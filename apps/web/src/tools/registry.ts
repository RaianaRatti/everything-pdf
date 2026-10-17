import {
  Blend,
  Columns2,
  Combine,
  Contrast,
  Crop,
  FileImage,
  FileOutput,
  FilePlus,
  FileText,
  ImageDown,
  Images,
  Info,
  Layers,
  LayoutGrid,
  ListChecks,
  ListOrdered,
  Lock,
  LockOpen,
  MessageSquareX,
  Minimize2,
  PanelTop,
  PenLine,
  RotateCw,
  Scaling,
  ScanText,
  Split,
  SquarePen,
  Stamp,
  type LucideIcon,
} from "lucide-react";

export type Category =
  | "Organize"
  | "Edit"
  | "Sign & forms"
  | "Page look"
  | "Security"
  | "Optimize"
  | "Convert"
  | "Workflow";

export interface Tool {
  /** Also the URL path. */
  id: string;
  /** Short lowercase button text. */
  label: string;
  name: string;
  description: string;
  category: Category;
  /** Whether the tool works inside the page workspace (otherwise it has its own page). */
  inWorkspace: boolean;
  icon: LucideIcon;
  /** Extra words people might search for. */
  keywords?: string;
}

export const tools: Tool[] = [
  {
    id: "merge",
    label: "merge",
    name: "Merge PDFs",
    description: "Combine several PDFs into one, in the order you want.",
    category: "Organize",
    inWorkspace: true,
    icon: Combine,
    keywords: "combine join",
  },
  {
    id: "split",
    label: "split",
    name: "Split PDF",
    description: "Break a PDF into files by page ranges, every N pages, or single pages.",
    category: "Organize",
    inWorkspace: true,
    icon: Split,
  },
  {
    id: "organize",
    label: "organize",
    name: "Organize pages",
    description: "Reorder, delete and duplicate pages with drag and drop.",
    category: "Organize",
    inWorkspace: true,
    icon: LayoutGrid,
    keywords: "reorder delete remove duplicate sort",
  },
  {
    id: "rotate",
    label: "rotate",
    name: "Rotate pages",
    description: "Rotate all pages or just the ones that came out sideways.",
    category: "Organize",
    inWorkspace: true,
    icon: RotateCw,
  },
  {
    id: "extract",
    label: "extract",
    name: "Extract pages",
    description: "Pull selected pages out into a new PDF.",
    category: "Organize",
    inWorkspace: true,
    icon: FileOutput,
  },
  {
    id: "insert",
    label: "insert pages",
    name: "Insert pages",
    description: "Add blank pages, or pages from another PDF, exactly where you want them.",
    category: "Organize",
    inWorkspace: true,
    icon: FilePlus,
    keywords: "blank add",
  },
  {
    id: "interleave",
    label: "interleave",
    name: "Interleave pages",
    description: "Alternate pages from two files, e.g. front and back scans, back side reversed.",
    category: "Organize",
    inWorkspace: true,
    icon: Columns2,
    keywords: "collate double sided duplex scan",
  },
  {
    id: "edit",
    label: "edit page",
    name: "Edit page",
    description: "Add text and images, white out areas, highlight, and leave notes.",
    category: "Edit",
    inWorkspace: true,
    icon: SquarePen,
    keywords: "add text image whiteout highlight annotate note comment",
  },
  {
    id: "page-numbers",
    label: "number pages",
    name: "Add page numbers",
    description: "Number pages in any corner, with formats like “Page 1 of 10”.",
    category: "Edit",
    inWorkspace: true,
    icon: ListOrdered,
  },
  {
    id: "header-footer",
    label: "header & footer",
    name: "Header & footer",
    description:
      "Add text to the top and bottom of every page, with page numbers, file name or date.",
    category: "Edit",
    inWorkspace: true,
    icon: PanelTop,
  },
  {
    id: "watermark",
    label: "watermark",
    name: "Add watermark",
    description: "Stamp text like “DRAFT” or a logo across every page.",
    category: "Edit",
    inWorkspace: true,
    icon: Stamp,
  },
  {
    id: "remove-annotations",
    label: "remove comments",
    name: "Remove annotations",
    description: "Strip comments, highlights, notes and drawings, and optionally links and forms.",
    category: "Edit",
    inWorkspace: true,
    icon: MessageSquareX,
    keywords: "annotations markup clean",
  },
  {
    id: "sign",
    label: "sign",
    name: "Sign PDF",
    description: "Draw, type or upload your signature and place it on the page.",
    category: "Sign & forms",
    inWorkspace: true,
    icon: PenLine,
    keywords: "signature",
  },
  {
    id: "forms",
    label: "fill form",
    name: "Fill & flatten forms",
    description: "Fill in a PDF form, then optionally lock the answers into the page.",
    category: "Sign & forms",
    inWorkspace: true,
    icon: ListChecks,
    keywords: "fields flatten",
  },
  {
    id: "crop",
    label: "crop",
    name: "Crop pages",
    description: "Trim margins or cut pages down to the part you need.",
    category: "Page look",
    inWorkspace: true,
    icon: Crop,
    keywords: "trim margins",
  },
  {
    id: "resize",
    label: "resize",
    name: "Change page size",
    description: "Put every page on A4, Letter or another paper size.",
    category: "Page look",
    inWorkspace: true,
    icon: Scaling,
    keywords: "page size a4 letter scale",
  },
  {
    id: "invert",
    label: "invert",
    name: "Invert colors",
    description: "Dark mode for PDFs: white pages become black and text turns light.",
    category: "Page look",
    inWorkspace: true,
    icon: Contrast,
    keywords: "dark mode negative",
  },
  {
    id: "grayscale",
    label: "grayscale",
    name: "Grayscale",
    description: "Turn color pages black and white, for printing or a cleaner look.",
    category: "Page look",
    inWorkspace: true,
    icon: Blend,
    keywords: "black white monochrome",
  },
  {
    id: "protect",
    label: "protect",
    name: "Password-protect PDF",
    description: "Lock a PDF with a password and limit printing, copying or editing.",
    category: "Security",
    inWorkspace: true,
    icon: Lock,
    keywords: "encrypt password permissions",
  },
  {
    id: "unlock",
    label: "unlock",
    name: "Unlock PDF",
    description: "Remove a PDF's password (you'll need to know it) and its restrictions.",
    category: "Security",
    inWorkspace: true,
    icon: LockOpen,
    keywords: "decrypt remove password",
  },
  {
    id: "properties",
    label: "properties",
    name: "Properties & metadata",
    description: "See what's inside a PDF, edit its title and author, or remove all metadata.",
    category: "Security",
    inWorkspace: true,
    icon: Info,
    keywords: "metadata inspect info author title privacy",
  },
  {
    id: "compress",
    label: "compress",
    name: "Compress PDF",
    description: "Make files smaller by shrinking images and removing unused data.",
    category: "Optimize",
    inWorkspace: true,
    icon: Minimize2,
    keywords: "smaller reduce size",
  },
  {
    id: "ocr",
    label: "ocr",
    name: "Make searchable (OCR)",
    description: "Recognize text in scanned pages so you can search, select and copy it.",
    category: "Optimize",
    inWorkspace: true,
    icon: ScanText,
    keywords: "scan recognize text searchable",
  },
  {
    id: "pdf-to-images",
    label: "pdf to images",
    name: "PDF to images",
    description: "Save each page as a PNG or JPG.",
    category: "Convert",
    inWorkspace: true,
    icon: Images,
  },
  {
    id: "pdf-to-text",
    label: "pdf to text",
    name: "PDF to text",
    description: "Pull the text out of a PDF into a plain .txt file.",
    category: "Convert",
    inWorkspace: true,
    icon: FileText,
  },
  {
    id: "extract-images",
    label: "extract images",
    name: "Extract images",
    description: "Save the photos and graphics embedded in a PDF at their original quality.",
    category: "Convert",
    inWorkspace: true,
    icon: ImageDown,
  },
  {
    id: "images-to-pdf",
    label: "images to pdf",
    name: "Images to PDF",
    description: "Turn photos and screenshots into a single PDF.",
    category: "Convert",
    inWorkspace: false,
    icon: FileImage,
    keywords: "jpg png photo",
  },
  {
    id: "batch",
    label: "batch",
    name: "Batch process",
    description: "Run the same tool on many PDFs at once and download them all.",
    category: "Workflow",
    inWorkspace: false,
    icon: Layers,
    keywords: "many files bulk",
  },
];

export const categories: Category[] = [
  "Organize",
  "Edit",
  "Sign & forms",
  "Page look",
  "Security",
  "Optimize",
  "Convert",
  "Workflow",
];

export function findTool(id: string | undefined): Tool | undefined {
  return tools.find((t) => t.id === id);
}

/** Tools matching every word of a search, best matches (label hits) first. */
export function searchTools(query: string): Tool[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return tools;
  const scored = tools.flatMap((tool) => {
    const label = tool.label.toLowerCase();
    const haystack =
      `${tool.label} ${tool.name} ${tool.description} ${tool.keywords ?? ""}`.toLowerCase();
    if (!words.every((w) => haystack.includes(w))) return [];
    const score = words.reduce(
      (n, w) => n + (label.startsWith(w) ? 2 : label.includes(w) ? 1 : 0),
      0,
    );
    return [{ tool, score }];
  });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.tool);
}
