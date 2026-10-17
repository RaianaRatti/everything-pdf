import { PenLine } from "lucide-react";
import { useState } from "react";
import { applyToDocument } from "../../lib/actions";
import type { PngImage } from "../../lib/canvas";
import { engine } from "../../lib/engine";
import { selectedPages, useWorkspace } from "../../store/workspace";
import { Button, Hint, PanelSection } from "../../components/ui";
import { PlacementDialog } from "./PlacementDialog";
import { SignatureCreator } from "./SignatureCreator";

export function SignPanel() {
  const pages = useWorkspace((s) => s.pages);
  const selection = useWorkspace((s) => s.selection);
  const [signature, setSignature] = useState<PngImage | null>(null);
  const [placing, setPlacing] = useState(false);

  const target = selectedPages({ pages, selection })[0] ?? pages[0];
  const targetNumber = target ? pages.indexOf(target) + 1 : 0;

  return (
    <>
      <PanelSection title="1. Create your signature">
        {signature ? (
          <div className="space-y-2">
            <div className="flex h-28 items-center justify-center bg-card p-3 border-2 border-ink">
              <img src={signature.url} alt="Your signature" className="max-h-full max-w-full" />
            </div>
            <Button className="w-full" onClick={() => setSignature(null)}>
              Make a different signature
            </Button>
          </div>
        ) : (
          <SignatureCreator onCreate={setSignature} />
        )}
      </PanelSection>
      <PanelSection title="2. Place it">
        <Hint>
          Signing page {targetNumber}. Select a different page in the grid to sign that one instead.
        </Hint>
        <Button
          variant="primary"
          className="w-full"
          disabled={!signature || !target}
          onClick={() => setPlacing(true)}
        >
          <PenLine className="size-4" /> Place signature
        </Button>
      </PanelSection>

      {placing && signature && target && (
        <PlacementDialog
          page={target}
          pageNumber={targetNumber}
          signature={signature}
          onCancel={() => setPlacing(false)}
          onApply={(rect, allPages) => {
            setPlacing(false);
            const indices = allPages ? pages.map((_, i) => i) : [targetNumber - 1];
            void applyToDocument(
              "Signing…",
              (bytes) =>
                engine.stampImage(
                  bytes,
                  { bytes: signature.bytes, type: "png" },
                  // On other pages, keep the signature's proportions rather than the box's.
                  indices.map((pageIndex) => ({
                    pageIndex,
                    rect: allPages ? { x: rect.x, y: rect.y, width: rect.width } : rect,
                  })),
                ),
              "Signature added. You can place it again on other pages.",
            );
          }}
        />
      )}
    </>
  );
}
