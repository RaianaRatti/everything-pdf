import type { SignatureReport } from "@everything-pdf/engine";
import { BadgeCheck, CircleAlert, FileKey, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { FilePickerButton } from "../../components/Dropzone";
import {
  Button,
  Checkbox,
  Field,
  Hint,
  PanelSection,
  Segmented,
  inputClass,
} from "../../components/ui";
import { errorMessage, materialize, runTask } from "../../lib/actions";
import { downloadBytes } from "../../lib/download";
import { engine } from "../../lib/engine";
import { baseName, ensurePdfExtension, readBytes } from "../../lib/files";
import { useWorkspace } from "../../store/workspace";

type Corner = "bottom-right" | "bottom-left" | "top-right";

export function DigitalSignPanel() {
  const pageCount = useWorkspace((s) => s.pages.length);
  const [certificate, setCertificate] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");
  const [visible, setVisible] = useState(true);
  const [corner, setCorner] = useState<Corner>("bottom-right");
  const [onPage, setOnPage] = useState<"last" | "first">("last");

  const run = () =>
    void runTask("Signing…", async () => {
      const ws = useWorkspace.getState();
      const box = {
        x: corner === "bottom-left" ? 0.05 : 0.52,
        y: corner === "top-right" ? 0.04 : 0.84,
        width: 0.43,
        height: 0.1,
      };
      const bytes = await engine.signDigitally(await materialize(), {
        p12: certificate!.bytes,
        password,
        reason: reason.trim() || undefined,
        location: location.trim() || undefined,
        appearance: visible ? { pageIndex: onPage === "last" ? pageCount - 1 : 0, box } : undefined,
      });
      downloadBytes(bytes, `${baseName(ensurePdfExtension(ws.outputName))}-signed.pdf`);
      ws.setNotice({
        kind: "success",
        message: "Signed copy downloaded. Any change to it from now on will show as tampering.",
      });
    });

  return (
    <>
      <PanelSection title="1. Your certificate">
        <FilePickerButton
          onFiles={async (files) => {
            const file = files[0];
            if (file) setCertificate({ name: file.name, bytes: await readBytes(file) });
          }}
          accept=".p12,.pfx,application/x-pkcs12"
          className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-ink py-2.5 text-sm hover:bg-paper-3"
        >
          <FileKey className="size-4" />{" "}
          {certificate ? certificate.name : "Choose a .p12 or .pfx file"}
        </FilePickerButton>
        <Field label="Certificate password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Hint>
          The certificate and its private key are used on your device only. RSA certificates are
          supported.
        </Hint>
      </PanelSection>
      <PanelSection title="2. Details">
        <Field label="Reason (optional)">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="I approve this document"
            className={inputClass}
          />
        </Field>
        <Field label="Location (optional)">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Checkbox
          checked={visible}
          onChange={setVisible}
          label="Show a signature box on the page"
        />
        {visible && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Page">
              <Segmented
                label="Page"
                value={onPage}
                onChange={setOnPage}
                options={[
                  { value: "first", label: "First" },
                  { value: "last", label: "Last" },
                ]}
              />
            </Field>
            <Field label="Corner">
              <select
                value={corner}
                onChange={(e) => setCorner(e.target.value as Corner)}
                className={inputClass}
              >
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="top-right">Top right</option>
              </select>
            </Field>
          </div>
        )}
      </PanelSection>
      <PanelSection>
        <Button variant="primary" className="w-full" disabled={!certificate} onClick={run}>
          <ShieldCheck className="size-4" /> Sign & download
        </Button>
        <Hint>
          Do this last: editing a signed file breaks the signature. For a drawn or typed signature
          instead, use the sign tool.
        </Hint>
      </PanelSection>
    </>
  );
}

export function VerifyPanel() {
  const pages = useWorkspace((s) => s.pages);
  const files = useWorkspace((s) => s.files);
  const inUse = [...new Set(pages.map((p) => p.fileId))].map((id) => files[id]!);
  const [reports, setReports] = useState<{
    key: string;
    list: { file: string; reports: SignatureReport[] }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = inUse.map((f) => f.id).join();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = [];
      // Signatures live in the original files; the workspace copy isn't signed.
      for (const f of inUse)
        list.push({ file: f.name, reports: await engine.verifySignatures(f.bytes) });
      if (!cancelled) setReports({ key, list });
    })().catch((err: unknown) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies inUse
  }, [key]);

  const current = reports?.key === key ? reports.list : null;
  if (error)
    return (
      <PanelSection>
        <Hint>{error}</Hint>
      </PanelSection>
    );
  if (!current)
    return (
      <PanelSection>
        <Hint>Checking signatures…</Hint>
      </PanelSection>
    );

  return (
    <>
      {current.map(({ file, reports }) => (
        <PanelSection key={file} title={file}>
          {reports.length === 0 && <Hint>No digital signatures.</Hint>}
          {reports.map((r, i) => {
            const good = r.intact && r.validSignature;
            return (
              <div key={i} className="space-y-1.5 border-2 border-ink p-3 text-sm">
                <p className="flex items-center gap-2">
                  {good ? (
                    <BadgeCheck className="size-4 shrink-0" aria-hidden />
                  ) : (
                    <CircleAlert className="size-4 shrink-0 text-red-600" aria-hidden />
                  )}
                  <span>
                    Signed by <strong className="font-semibold">{r.signer}</strong>
                  </span>
                </p>
                {r.signedAt && (
                  <p className="text-ink-2">{new Date(r.signedAt).toLocaleString()}</p>
                )}
                {r.reason && <p className="text-ink-2">Reason: {r.reason}</p>}
                <ul className="list-inside list-disc text-ink-2">
                  <li>
                    {r.intact
                      ? "Not changed since it was signed"
                      : "Changed after signing: signature is broken"}
                  </li>
                  <li>
                    {r.validSignature
                      ? "Signature matches the certificate"
                      : "Signature doesn't match the certificate"}
                  </li>
                  {!r.coversWholeFile && <li>More was added to the file after this signature</li>}
                  {!r.certificateValidAtSigning && (
                    <li>Certificate wasn't valid at signing time</li>
                  )}
                  <li>
                    {r.selfSigned
                      ? "Self-signed certificate: anyone can make one in that name"
                      : `Certificate issued by ${r.issuer}`}
                  </li>
                </ul>
                {r.problem && <p className="text-red-600">{r.problem}</p>}
              </div>
            );
          })}
        </PanelSection>
      ))}
      <PanelSection>
        <Hint>
          This checks that each file is unchanged and that the signature math is right. It doesn't
          check whether the certificate's issuer is one you should trust.
        </Hint>
      </PanelSection>
    </>
  );
}
