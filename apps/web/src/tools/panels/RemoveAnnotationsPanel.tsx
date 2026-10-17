import { MessageSquareX } from "lucide-react";
import { useState } from "react";
import { Button, Checkbox, Hint, PanelSection } from "../../components/ui";
import { applyToDocument } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { pluralize } from "../../lib/files";
import { useWorkspace } from "../../store/workspace";

export function RemoveAnnotationsPanel() {
  const [links, setLinks] = useState(false);
  const [forms, setForms] = useState(false);

  const run = () => {
    let removed = 0;
    void applyToDocument("Removing annotations…", async (bytes) => {
      const result = await engine.removeAnnotations(bytes, { links, forms });
      removed = result.removed;
      return result.bytes;
    }).then((done) => {
      if (!done) return;
      useWorkspace.getState().setNotice({
        kind: "success",
        message: removed
          ? `Removed ${pluralize(removed, "annotation")}.`
          : "There was nothing to remove.",
      });
    });
  };

  return (
    <PanelSection>
      <Hint>
        Removes comments, highlights, sticky notes, stamps and drawings. Page content stays as it
        is.
      </Hint>
      <Checkbox checked={links} onChange={setLinks} label="Also remove links" />
      <Checkbox
        checked={forms}
        onChange={setForms}
        label="Also remove form fields and their answers"
      />
      <Button variant="primary" className="w-full" onClick={run}>
        <MessageSquareX className="size-4" /> Remove annotations
      </Button>
    </PanelSection>
  );
}
