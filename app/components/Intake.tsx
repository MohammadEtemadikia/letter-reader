"use client";

import { useCallback, useRef, useState } from "react";
import { COPY } from "@/lib/i18n";
import type { PendingGroup } from "@/lib/inbox";
import type { Health } from "@/lib/claude-cli";
import type { DocumentRecord } from "@/lib/document";

const t = COPY;

type StreamEvent =
  | { t: "total"; count: number }
  | { t: "status"; message: string }
  | { t: "activity"; detail: string }
  | { t: "batch_result"; documents: DocumentRecord[] }
  | { t: "batch_error"; message: string }
  | { t: "done"; count: number; remaining: number }
  | { t: "error"; message: string };

type Props = {
  pending: PendingGroup[];
  setPending: (groups: PendingGroup[]) => void;
  refreshPending: () => Promise<void>;
  health: Health | null;
  running: boolean;
  setRunning: (running: boolean) => void;
  effort: string;
  setEffort: (effort: string) => void;
  /** Called with every freshly filed batch so the dashboard fills while the run is still going. */
  onFiled: (documents: DocumentRecord[]) => void;
  onFinished: () => void;
};

/**
 * Everything to do with getting paper into the system: drop or photograph it,
 * group multi-page scans, then run the read-and-file pass. Results land in the
 * document store, so this view only reports progress — the Dashboard owns them
 * from there.
 */
export default function Intake({
  pending,
  setPending,
  refreshPending,
  health,
  running,
  setRunning,
  effort,
  setEffort,
  onFiled,
  onFinished,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrInfo, setQrInfo] = useState<{ url: string; qrDataUrl: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [runTotal, setRunTotal] = useState(0);
  const [runProcessed, setRunProcessed] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const form = new FormData();
      for (const file of Array.from(files)) form.append("files", file);
      const res = await fetch("/api/inbox", { method: "POST", body: form });
      const data = await res.json();
      setPending(data.pending ?? []);
    },
    [setPending],
  );

  const removeGroup = useCallback(
    async (group: PendingGroup) => {
      for (const f of group.files) {
        await fetch(`/api/inbox?filename=${encodeURIComponent(f.filename)}`, { method: "DELETE" });
      }
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(group.id);
        return next;
      });
      await refreshPending();
    },
    [refreshPending],
  );

  const combineSelected = useCallback(async () => {
    const groups = pending.filter((g) => selected.has(g.id));
    const filenames = groups.flatMap((g) => g.files.map((f) => f.filename));
    if (filenames.length < 2) return;
    const res = await fetch("/api/inbox/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filenames }),
    });
    const data = await res.json();
    setPending(data.pending ?? []);
    setSelected(new Set());
  }, [pending, selected, setPending]);

  const splitGroup = useCallback(
    async (group: PendingGroup) => {
      for (const f of group.files) {
        await fetch(`/api/inbox/group?filename=${encodeURIComponent(f.filename)}`, { method: "DELETE" });
      }
      await refreshPending();
    },
    [refreshPending],
  );

  const toggleQr = useCallback(async () => {
    if (!qrInfo) {
      const res = await fetch("/api/upload-info", { cache: "no-store" });
      setQrInfo(await res.json());
    }
    setShowQr((v) => !v);
  }, [qrInfo]);

  const run = useCallback(async () => {
    setRunning(true);
    setErrorMessage(null);
    setActivity([]);
    setStatusMessage("");
    setRemaining(0);
    setRunTotal(0);
    setRunProcessed(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effort }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error ?? t.errorGeneric("request failed"));
        setRunning(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("no stream");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.t === "total") setRunTotal(event.count);
          else if (event.t === "status") setStatusMessage(event.message);
          else if (event.t === "activity") setActivity((a) => [...a.slice(-4), event.detail]);
          else if (event.t === "batch_result") {
            onFiled(event.documents);
            setRunProcessed((p) => p + event.documents.length);
          } else if (event.t === "batch_error")
            setErrorMessage((prev) => (prev ? `${prev} | ${event.message}` : event.message));
          else if (event.t === "done") {
            setStatusMessage(t.statusDone(event.count));
            setRemaining(event.remaining);
          } else if (event.t === "error") setErrorMessage(event.message);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setErrorMessage(t.errorGeneric(err instanceof Error ? err.message : "unknown"));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
      await refreshPending();
      onFinished();
    }
  }, [effort, refreshPending, onFiled, onFinished, setRunning]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const totalPendingFiles = pending.reduce((sum, g) => sum + g.files.length, 0);

  return (
    <div className="intake-grid">
      <section className="col">
        <div
          className={dragOver ? "dropzone dragover" : "dropzone"}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="dz-icon">📥</span>
          <strong>{t.dropZoneTitle}</strong>
          <span className="dz-hint">{t.dropZoneHint}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <button className="secondary-btn" onClick={toggleQr}>
          {t.qrButton}
        </button>

        {showQr && qrInfo && (
          <div className="qr-panel">
            <strong>{t.qrPanelTitle}</strong>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrInfo.qrDataUrl} alt="QR" width={200} height={200} />
            <span className="qr-hint">{t.qrPanelHint(qrInfo.url)}</span>
          </div>
        )}

        <h2 style={{ fontSize: "1rem", margin: "0.4rem 0 0" }}>
          {totalPendingFiles > 0 ? t.pendingHeader(totalPendingFiles) : t.pendingEmpty}
        </h2>
        {pending.length > 0 && <p className="field-hint">{t.selectHint}</p>}
        {selected.size >= 2 && (
          <button className="secondary-btn" onClick={combineSelected}>
            {t.combineButton}
          </button>
        )}
        <ul className="pending-list">
          {pending.map((g) => (
            <li key={g.id} className={selected.has(g.id) ? "selected" : undefined}>
              <input
                type="checkbox"
                checked={selected.has(g.id)}
                onChange={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.id)) next.delete(g.id);
                    else next.add(g.id);
                    return next;
                  })
                }
              />
              <div className="group-info">
                <span className="pending-name">
                  {g.files[0].filename}
                  {g.files.length > 1 ? ` +${g.files.length - 1}` : ""}
                </span>
                {g.files.length > 1 && <span className="pages-badge">{t.pagesLabel(g.files.length)}</span>}
              </div>
              {g.files.length > 1 && (
                <button className="link-btn" onClick={() => splitGroup(g)}>
                  {t.ungroupButton}
                </button>
              )}
              <button className="remove-btn" onClick={() => removeGroup(g)} aria-label="remove">
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="col">
        <div className="run-row">
          <label className="field">
            {t.effortLabel}
            <select value={effort} onChange={(e) => setEffort(e.target.value)} disabled={running}>
              {t.effortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {!running ? (
            <button
              className="primary-btn"
              disabled={totalPendingFiles === 0 || health?.state !== "ok"}
              onClick={run}
            >
              {t.runButton}
            </button>
          ) : (
            <button className="stop-btn" onClick={stop}>
              {t.stopButton}
            </button>
          )}
        </div>

        {running && runTotal > 0 && (
          <div className="progress-wrap">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, (runProcessed / runTotal) * 100)}%` }}
              />
            </div>
            <span className="progress-label">
              {runProcessed} / {runTotal}
            </span>
          </div>
        )}
        {statusMessage && <p className="status-line">{statusMessage}</p>}
        {activity.length > 0 && (
          <ul className="activity-log">
            {activity.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}
        {errorMessage && <p className="error-line">{errorMessage}</p>}
        {remaining > 0 && <p className="status-line">{t.remainingNote(remaining)}</p>}
      </section>
    </div>
  );
}
