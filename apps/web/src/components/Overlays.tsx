import { CircleAlert, CircleCheck, LoaderCircle, LockKeyhole, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePasswordRequest } from "../lib/password";
import { useWorkspace } from "../store/workspace";
import { Button, inputClass } from "./ui";

export function BusyOverlay() {
  const busy = useWorkspace((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 backdrop-blur-[2px]">
      <div
        role="status"
        className="flex items-center gap-3 rounded-lg border-3 border-ink bg-card px-5 py-4 text-lg shadow-pop"
      >
        <LoaderCircle className="size-5 animate-spin text-ink" aria-hidden />
        {busy}
      </div>
    </div>
  );
}

export function NoticeToast() {
  const notice = useWorkspace((s) => s.notice);
  const setNotice = useWorkspace((s) => s.setNotice);

  useEffect(() => {
    if (notice?.kind !== "success") return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  if (!notice) return null;
  const error = notice.kind === "error";
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex justify-center">
      <div
        role={error ? "alert" : "status"}
        className={`flex max-w-lg items-start gap-3 rounded-lg border-3 bg-card px-4 py-3 text-sm text-ink shadow-pop ${
          error ? "border-red-600" : "border-ink"
        }`}
      >
        {error ? (
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
        ) : (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden />
        )}
        <p className="whitespace-pre-line">{notice.message}</p>
        <button
          type="button"
          onClick={() => setNotice(null)}
          className="-mr-1 shrink-0 p-0.5 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Lets users drop more files anywhere on the page once the workspace is open. */
export function WindowDropTarget({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const overHandler = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      onFiles([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overHandler);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overHandler);
      window.removeEventListener("drop", drop);
    };
  }, [onFiles]);

  if (!over) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-ink/5 ring-4 ring-accent ring-inset">
      <p className="rounded-lg border-3 border-ink bg-card px-5 py-3 text-xl shadow-pop">
        Drop to add files
      </p>
    </div>
  );
}

/** Asks for the password of an encrypted PDF while it's being loaded. */
export function PasswordDialog() {
  const request = usePasswordRequest((s) => s.request);
  const [password, setPassword] = useState("");

  if (!request) return null;
  const finish = (answer: string | null) => {
    setPassword("");
    request.resolve(answer);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-title"
        onSubmit={(e) => {
          e.preventDefault();
          finish(password);
        }}
        onKeyDown={(e) => e.key === "Escape" && finish(null)}
        className="w-full max-w-sm space-y-4 rounded-lg border-3 border-ink bg-card p-5 shadow-pop"
      >
        <p id="password-title" className="flex items-center gap-2 text-lg">
          <LockKeyhole className="size-5" aria-hidden /> password needed
        </p>
        <p className="text-sm break-words text-ink-2">
          “{request.fileName}” is password-protected. It's unlocked here on your device; the
          password isn't sent anywhere.
        </p>
        <input
          type="password"
          autoFocus
          aria-label="Password"
          aria-invalid={request.wrongPassword}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        {request.wrongPassword && (
          <p role="alert" className="text-sm text-red-600">
            That password isn't right. Try again.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={() => finish(null)}>Skip file</Button>
          <Button type="submit" variant="primary" disabled={!password}>
            Unlock
          </Button>
        </div>
      </form>
    </div>
  );
}
