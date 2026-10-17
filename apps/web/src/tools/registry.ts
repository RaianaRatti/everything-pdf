import {
  BadgeCheck,
  Blend,
  BookOpen,
  Bookmark as BookmarkIcon,
  Camera,
  Columns2,
  Combine,
  Contrast,
  Crop,
  FileImage,
  FileOutput,
  FilePlus,
  FileText,
  GitCompare,
  Grid2x2,
  ImageDown,
  Images,
  Info,
  Layers,
  LayoutGrid,
  ListChecks,
  ListOrdered,
  Lock,
  LockOpen,
  Maximize,
  MessageSquareX,
  Minimize2,
  PanelTop,
  PenLine,
  RotateCw,
  Scaling,
  ScanText,
  ShieldCheck,
  ShieldX,
  Split,
  SquarePen,
  Stamp,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type Category =
  | "Organize"
  | "Edit"
  | "Sign & forms"
  | "Page look"
  | "Print"
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
    description: "Combine several PDFs into one, in any order",
    category: "Organize",
    inWorkspace: true,
    icon: Combine,
    keywords: "combine join",
  },
  {
    id: "split",
    label: "split",
    name: "Split PDF",
    description: "Break a PDF into smaller files by page range or page count",
    category: "Organize",
    inWorkspace: true,
    icon: Split,
  },
  {
    id: "organize",
    label: "organize",
    name: "Organize pages",
    description: "Reorder, delete and duplicate pages by dragging them around",
    category: "Organize",
    inWorkspace: true,
    icon: LayoutGrid,
    keywords: "reorder delete remove duplicate sort",
  },
  {
    id: "rotate",
    label: "rotate",
    name: "Rotate pages",
    description: "Turn pages the right way up, all at once or one by one",
    category: "Organize",
    inWorkspace: true,
    icon: RotateCw,
  },
  {
    id: "extract",
    label: "extract",
    name: "Extract pages",
    description: "Pull the pages you pick into a new PDF",
    category: "Organize",
    inWorkspace: true,
    icon: FileOutput,
  },
  {
    id: "insert",
    label: "insert pages",
    name: "Insert pages",
    description: "Add blank pages or pages from another PDF wherever you want",
    category: "Organize",
    inWorkspace: true,
    icon: FilePlus,
    keywords: "blank add",
  },
  {
    id: "interleave",
    label: "interleave",
    name: "Interleave pages",
    description: "Mix pages from two files, like front and back scans",
    category: "Organize",
    inWorkspace: true,
    icon: Columns2,
    keywords: "collate double sided duplex scan",
  },
  {
    id: "bookmarks",
    label: "bookmarks",
    name: "Bookmarks",
    description: "Add, rename and nest the clickable table of contents",
    category: "Organize",
    inWorkspace: true,
    icon: BookmarkIcon,
    keywords: "outline table of contents toc",
  },
  {
    id: "edit",
    label: "edit page",
    name: "Edit page",
    description: "Add text and images, white out areas, highlight and leave notes",
    category: "Edit",
    inWorkspace: true,
    icon: SquarePen,
    keywords: "add text image whiteout highlight annotate note comment",
  },
  {
    id: "page-numbers",
    label: "number pages",
    name: "Add page numbers",
    description: "Number your pages in any corner, like “Page 1 of 10”",
    category: "Edit",
    inWorkspace: true,
    icon: ListOrdered,
  },
  {
    id: "header-footer",
    label: "header & footer",
    name: "Header & footer",
    description: "Put text at the top and bottom of every page",
    category: "Edit",
    inWorkspace: true,
    icon: PanelTop,
  },
  {
    id: "watermark",
    label: "watermark",
    name: "Add watermark",
    description: "Stamp text like “DRAFT” or a logo across every page",
    category: "Edit",
    inWorkspace: true,
    icon: Stamp,
  },
  {
    id: "remove-annotations",
    label: "remove comments",
    name: "Remove annotations",
    description: "Strip out comments, highlights, notes and drawings",
    category: "Edit",
    inWorkspace: true,
    icon: MessageSquareX,
    keywords: "annotations markup clean",
  },
  {
    id: "redact",
    label: "redact",
    name: "Redact",
    description: "Black out names, numbers or areas for good",
    category: "Edit",
    inWorkspace: true,
    icon: ShieldX,
    keywords: "black out censor hide sensitive privacy",
  },
  {
    id: "sign",
    label: "sign",
    name: "Sign PDF",
    description: "Draw, type or upload your signature and place it on the page",
    category: "Sign & forms",
    inWorkspace: true,
    icon: PenLine,
    keywords: "signature",
  },
  {
    id: "forms",
    label: "fill form",
    name: "Fill & flatten forms",
    description: "Fill in a PDF form and lock the answers in if you want",
    category: "Sign & forms",
    inWorkspace: true,
    icon: ListChecks,
    keywords: "fields flatten",
  },
  {
    id: "digital-signature",
    label: "digital signature",
    name: "Digital signature",
    description: "Sign with a certificate so any later change shows up",
    category: "Sign & forms",
    inWorkspace: true,
    icon: ShieldCheck,
    keywords: "certificate pkcs cryptographic esign",
  },
  {
    id: "verify",
    label: "verify signatures",
    name: "Verify signatures",
    description: "Check who signed a PDF and whether it changed since",
    category: "Sign & forms",
    inWorkspace: true,
    icon: BadgeCheck,
    keywords: "check validate certificate",
  },
  {
    id: "crop",
    label: "crop",
    name: "Crop pages",
    description: "Trim margins or cut pages down to the part you need",
    category: "Page look",
    inWorkspace: true,
    icon: Crop,
    keywords: "trim margins",
  },
  {
    id: "resize",
    label: "resize",
    name: "Change page size",
    description: "Put every page on A4, Letter or another paper size",
    category: "Page look",
    inWorkspace: true,
    icon: Scaling,
    keywords: "page size a4 letter scale",
  },
  {
    id: "invert",
    label: "invert",
    name: "Invert colors",
    description: "Dark mode for PDFs, white pages turn black and text turns light",
    category: "Page look",
    inWorkspace: true,
    icon: Contrast,
    keywords: "dark mode negative",
  },
  {
    id: "grayscale",
    label: "grayscale",
    name: "Grayscale",
    description: "Turn color pages black and white",
    category: "Page look",
    inWorkspace: true,
    icon: Blend,
    keywords: "black white monochrome",
  },
  {
    id: "n-up",
    label: "pages per sheet",
    name: "Pages per sheet (n-up)",
    description: "Print 2, 4, 6, 9 or 16 pages on each sheet of paper",
    category: "Print",
    inWorkspace: true,
    icon: Grid2x2,
    keywords: "nup n-up handout multiple",
  },
  {
    id: "booklet",
    label: "booklet",
    name: "Make a booklet",
    description: "Arrange pages to print double-sided, fold and staple",
    category: "Print",
    inWorkspace: true,
    icon: BookOpen,
    keywords: "saddle stitch zine imposition",
  },
  {
    id: "poster",
    label: "poster",
    name: "Poster",
    description: "Blow a page up across several sheets to tape together",
    category: "Print",
    inWorkspace: true,
    icon: Maximize,
    keywords: "tile enlarge banner",
  },
  {
    id: "split-spreads",
    label: "split scans",
    name: "Split double-page scans",
    description: "Cut scans of open books in half, one page each",
    category: "Print",
    inWorkspace: true,
    icon: Columns2,
    keywords: "spread book scan halves",
  },
  {
    id: "protect",
    label: "protect",
    name: "Password-protect PDF",
    description: "Lock a PDF with a password and limit printing, copying or editing",
    category: "Security",
    inWorkspace: true,
    icon: Lock,
    keywords: "encrypt password permissions",
  },
  {
    id: "unlock",
    label: "unlock",
    name: "Unlock PDF",
    description: "Remove a PDF's password and restrictions, if you know the password",
    category: "Security",
    inWorkspace: true,
    icon: LockOpen,
    keywords: "decrypt remove password",
  },
  {
    id: "properties",
    label: "properties",
    name: "Properties & metadata",
    description: "See what's inside a PDF, edit its title and author or wipe its metadata",
    category: "Security",
    inWorkspace: true,
    icon: Info,
    keywords: "metadata inspect info author title privacy",
  },
  {
    id: "compress",
    label: "compress",
    name: "Compress PDF",
    description: "Make files smaller by shrinking images and dropping unused data",
    category: "Optimize",
    inWorkspace: true,
    icon: Minimize2,
    keywords: "smaller reduce size",
  },
  {
    id: "ocr",
    label: "ocr",
    name: "Make searchable (OCR)",
    description: "Turn scanned pages into text you can search, select and copy",
    category: "Optimize",
    inWorkspace: true,
    icon: ScanText,
    keywords: "scan recognize text searchable",
  },
  {
    id: "repair",
    label: "repair",
    name: "Repair PDF",
    description: "Fix damaged files that won't open and save a clean copy",
    category: "Optimize",
    inWorkspace: true,
    icon: Wrench,
    keywords: "broken corrupted damaged fix",
  },
  {
    id: "pdf-to-images",
    label: "pdf to images",
    name: "PDF to images",
    description: "Save each page as a PNG or JPG",
    category: "Convert",
    inWorkspace: true,
    icon: Images,
  },
  {
    id: "pdf-to-text",
    label: "pdf to text",
    name: "PDF to text",
    description: "Pull the text out of a PDF into a plain .txt file",
    category: "Convert",
    inWorkspace: true,
    icon: FileText,
  },
  {
    id: "extract-images",
    label: "extract images",
    name: "Extract images",
    description: "Save the photos and graphics inside a PDF at full quality",
    category: "Convert",
    inWorkspace: true,
    icon: ImageDown,
  },
  {
    id: "images-to-pdf",
    label: "images to pdf",
    name: "Images to PDF",
    description: "Turn photos and screenshots into one PDF",
    category: "Convert",
    inWorkspace: false,
    icon: FileImage,
    keywords: "jpg png photo",
  },
  {
    id: "scan",
    label: "scan to pdf",
    name: "Scan with camera",
    description: "Photograph pages and get a straightened, cropped PDF",
    category: "Convert",
    inWorkspace: false,
    icon: Camera,
    keywords: "camera photo document scanner",
  },
  {
    id: "batch",
    label: "batch & recipes",
    name: "Batch process & recipes",
    description: "Run the same steps on many PDFs at once and save them as a recipe",
    category: "Workflow",
    inWorkspace: false,
    icon: Layers,
    keywords: "many files bulk",
  },
  {
    id: "compare",
    label: "compare",
    name: "Compare PDFs",
    description: "See what changed between two versions of a PDF",
    category: "Workflow",
    inWorkspace: false,
    icon: GitCompare,
    keywords: "diff difference versions",
  },
];

export const categories: Category[] = [
  "Organize",
  "Edit",
  "Sign & forms",
  "Page look",
  "Print",
  "Security",
  "Optimize",
  "Convert",
  "Workflow",
];

export function findTool(id: string | undefined): Tool | undefined {
  return tools.find((t) => t.id === id);
}

/**
 * Tools whose title or description contains every word of a search. Title hits
 * come first, then description hits, then tools found only by extra keywords.
 */
export function searchTools(query: string): Tool[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return tools;
  const matches = (text: string) => words.every((w) => text.includes(w));
  const scored = tools.flatMap((tool) => {
    const title = `${tool.label} ${tool.name}`.toLowerCase();
    const description = tool.description.toLowerCase();
    const all = `${title} ${description} ${tool.keywords ?? ""}`.toLowerCase();
    if (!matches(all)) return [];
    const label = tool.label.toLowerCase();
    const score = matches(title)
      ? 3 + (words.some((w) => label.startsWith(w)) ? 1 : 0)
      : matches(description)
        ? 2
        : 1;
    return [{ tool, score }];
  });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.tool);
}
