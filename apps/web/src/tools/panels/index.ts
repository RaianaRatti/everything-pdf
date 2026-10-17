import type { ComponentType } from "react";
import { CompressPanel } from "./CompressPanel";
import { CropPanel } from "./CropPanel";
import { EditPanel } from "./EditPanel";
import { ExtractImagesPanel } from "./ExtractImagesPanel";
import { ExtractPanel } from "./ExtractPanel";
import { FormsPanel } from "./FormsPanel";
import { HeaderFooterPanel } from "./HeaderFooterPanel";
import { InsertPanel } from "./InsertPanel";
import { InterleavePanel } from "./InterleavePanel";
import { MergePanel } from "./MergePanel";
import { OcrPanel } from "./OcrPanel";
import { OrganizePanel } from "./OrganizePanel";
import { PageNumbersPanel } from "./PageNumbersPanel";
import { PdfToImagesPanel } from "./PdfToImagesPanel";
import { PdfToTextPanel } from "./PdfToTextPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { GrayscalePanel, InvertPanel } from "./RecolorPanel";
import { RemoveAnnotationsPanel } from "./RemoveAnnotationsPanel";
import { ResizePanel } from "./ResizePanel";
import { ProtectPanel, UnlockPanel } from "./SecurityPanels";
import { SignPanel } from "./SignPanel";
import { SplitPanel } from "./SplitPanel";
import { RotatePanel } from "./RotatePanel";
import { WatermarkPanel } from "./WatermarkPanel";

/** Side panel for each workspace tool, keyed by tool id. */
export const panels: Record<string, ComponentType> = {
  merge: MergePanel,
  split: SplitPanel,
  organize: OrganizePanel,
  rotate: RotatePanel,
  extract: ExtractPanel,
  insert: InsertPanel,
  interleave: InterleavePanel,
  edit: EditPanel,
  "page-numbers": PageNumbersPanel,
  "header-footer": HeaderFooterPanel,
  watermark: WatermarkPanel,
  "remove-annotations": RemoveAnnotationsPanel,
  sign: SignPanel,
  forms: FormsPanel,
  crop: CropPanel,
  resize: ResizePanel,
  invert: InvertPanel,
  grayscale: GrayscalePanel,
  protect: ProtectPanel,
  unlock: UnlockPanel,
  properties: PropertiesPanel,
  compress: CompressPanel,
  ocr: OcrPanel,
  "pdf-to-images": PdfToImagesPanel,
  "pdf-to-text": PdfToTextPanel,
  "extract-images": ExtractImagesPanel,
};
