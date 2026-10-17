import { Download, Lock, LockOpen } from "lucide-react";
import { useState } from "react";
import { Button, Checkbox, Field, Hint, PanelSection, inputClass } from "../../components/ui";
import { downloadDocument, materialize, runTask } from "../../lib/actions";
import { downloadBytes } from "../../lib/download";
import { engine } from "../../lib/engine";
import { baseName, ensurePdfExtension } from "../../lib/files";
import { useWorkspace } from "../../store/workspace";
import {
  defaultProtectFields,
  protectProblem,
  toEncryptOptions,
  type ProtectFieldsValue,
} from "../options";

export function ProtectFields({
  value,
  onChange,
}: {
  value: ProtectFieldsValue;
  onChange: (value: ProtectFieldsValue) => void;
}) {
  const update = (patch: Partial<ProtectFieldsValue>) => onChange({ ...value, ...patch });
  const mismatch = value.confirm.length > 0 && value.userPassword !== value.confirm;
  return (
    <>
      <Field label="Password to open">
        <input
          type="password"
          autoComplete="new-password"
          value={value.userPassword}
          onChange={(e) => update({ userPassword: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Repeat password">
        <input
          type="password"
          autoComplete="new-password"
          aria-invalid={mismatch}
          value={value.confirm}
          onChange={(e) => update({ confirm: e.target.value })}
          className={inputClass}
        />
      </Field>
      {mismatch && <p className="text-sm text-red-600">The passwords don't match.</p>}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm">People who open it can</legend>
        <Checkbox
          checked={value.allowPrinting}
          onChange={(allowPrinting) => update({ allowPrinting })}
          label="Print"
        />
        <Checkbox
          checked={value.allowCopying}
          onChange={(allowCopying) => update({ allowCopying })}
          label="Copy text and images"
        />
        <Checkbox
          checked={value.allowEditing}
          onChange={(allowEditing) => update({ allowEditing })}
          label="Edit, comment and fill forms"
        />
      </fieldset>
      <details className="text-sm">
        <summary className="cursor-pointer">Permissions password</summary>
        <div className="mt-2 space-y-2">
          <input
            type="password"
            autoComplete="new-password"
            aria-label="Permissions password"
            value={value.ownerPassword}
            onChange={(e) => update({ ownerPassword: e.target.value })}
            className={inputClass}
          />
          <Hint>
            Needed to lift the restrictions later. Left empty, a random one is used, so they can't
            be changed.
          </Hint>
        </div>
      </details>
    </>
  );
}

export function ProtectPanel() {
  const [fields, setFields] = useState(defaultProtectFields);
  const problem = protectProblem(fields);

  const run = () =>
    void runTask("Encrypting…", async () => {
      const { outputName } = useWorkspace.getState();
      const bytes = await engine.encrypt(await materialize(), toEncryptOptions(fields));
      downloadBytes(bytes, `${baseName(ensurePdfExtension(outputName))}-protected.pdf`);
      useWorkspace.getState().setNotice({
        kind: "success",
        message:
          "Protected copy downloaded. Keep the password somewhere safe: it can't be recovered.",
      });
    });

  return (
    <PanelSection>
      <ProtectFields value={fields} onChange={setFields} />
      <Hint>
        Uses AES-256 encryption. Restrictions are honored by most PDF apps, but some ignore them;
        only the open password truly keeps people out.
      </Hint>
      <Button variant="primary" className="w-full" disabled={problem !== null} onClick={run}>
        <Lock className="size-4" /> Download protected PDF
      </Button>
      {problem && fields.userPassword && <p className="text-sm text-ink-2">{problem}</p>}
    </PanelSection>
  );
}

export function UnlockPanel() {
  const pages = useWorkspace((s) => s.pages);
  const files = useWorkspace((s) => s.files);
  const inUse = [...new Set(pages.map((p) => p.fileId))].map((id) => files[id]!);
  const unlocked = inUse.filter((f) => f.unlocked);

  return (
    <PanelSection>
      {unlocked.length > 0 ? (
        <>
          <p className="flex items-start gap-2 text-sm">
            <LockOpen className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Unlocked: {unlocked.map((f) => f.name).join(", ")}. Downloads from here have no
              password or restrictions.
            </span>
          </p>
          <Button variant="primary" className="w-full" onClick={() => void downloadDocument()}>
            <Download className="size-4" /> Download unlocked PDF
          </Button>
        </>
      ) : (
        <Hint>
          None of these files are password-protected. When you add one that is, you'll be asked for
          its password; files that only restrict printing or copying are unlocked automatically.
        </Hint>
      )}
    </PanelSection>
  );
}
