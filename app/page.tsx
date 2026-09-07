"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { COPY, isRtlLang, LANG_DIR, LANG_LABEL } from "@/lib/i18n";
import { FIELD_LABELS, type LetterResult } from "@/lib/letter";
import { LANGS, type Lang } from "@/lib/prompt";
import type { Health } from "@/lib/claude-cli";
import type { PendingGroup } from "@/lib/inbox";

type StreamEvent =
  | { t: "total"; count: number }
  | { t: "status"; message: string }
  | { t: "activity"; detail: string }
  | { t: "batch_result"; letters: LetterResult[] }
  | { t: "batch_error"; message: string }
  | { t: "done"; count: number; remaining: number }
  | { t: "error"; message: string };

const t = COPY;
const labels = FIELD_LABELS;

export default function Home() {
  const [effort, setEffort] = useState("high");
  const [health, setHealth] = useState<Health | null>(null);
  const [pending, setPending] = useState<PendingGroup[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrInfo, setQrInfo] = useState<{ url: string; qrDataUrl: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const [results, setResults] = useState<LetterResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [processedTotal, setProcessedTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [runTotal, setRunTotal] = useState(0);
  const [runProcessed, setRunProcessed] = useState(0);
  const [fileActionError, setFileActionError] = useState<string | null>(null);
  const [hasElectronBridge, setHasElectronBridge] = useState(false);

  // Per letter-card translation state, keyed by index into `results`.
  const [translations, setTranslations] = useState<Record<number, Partial<Record<Lang, LetterResult>>>>({});
  const [activeView, setActiveView] = useState<Record<number, Lang | "original">>({});
  const [translating, setTranslating] = useState<Record<number, Lang | null>>({});
  const [translateError, setTranslateError] = useState<Record<number, string | null>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHasElectronBridge(typeof window !== "undefined" && !!window.letterReader);
    const savedEffort = window.localStorage.getItem("lr-effort");
    if (savedEffort) setEffort(savedEffort);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("lr-effort", effort);
  }, [effort]);

  const refreshPending = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox", { cache: "no-store" });
      const data = await res.json();
      setPending(data.pending ?? []);
    } catch {
      /* transient — next poll will retry */
    }
  }, []);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ state: "unknown", detail: "network error" }));
    refreshPending();
    const interval = setInterval(() => {
      if (!running) refreshPending();
    }, 4000);
    return () => clearInterval(interval);
  }, [refreshPending, running]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const form = new FormData();
    for (const file of Array.from(files)) form.append("files", file);
    const res = await fetch("/api/inbox", { method: "POST", body: form });
    const data = await res.json();
    setPending(data.pending ?? []);
  }, []);

  const removeGroup = useCallback(async (group: PendingGroup) => {
    for (const f of group.files) {
      await fetch(`/api/inbox?filename=${encodeURIComponent(f.filename)}`, { method: "DELETE" });
    }
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(group.id);
      return next;
    });
    await refreshPending();
  }, [refreshPending]);

  const toggleSelect = useCallback((groupId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

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
  }, [pending, selected]);

  const splitGroup = useCallback(async (group: PendingGroup) => {
    for (const f of group.files) {
      await fetch(`/api/inbox/group?filename=${encodeURIComponent(f.filename)}`, { method: "DELETE" });
    }
    await refreshPending();
  }, [refreshPending]);

  const toggleQr = useCallback(async () => {
    if (!qrInfo) {
      const res = await fetch("/api/upload-info", { cache: "no-store" });
      setQrInfo(await res.json());
    }
    setShowQr((v) => !v);
  }, [qrInfo]);

  const openExcel = useCallback(async () => {
    setFileActionError(null);
    if (window.letterReader) {
      const res = await window.letterReader.openOutputFile();
      if (!res.ok) setFileActionError(res.error ?? "error");
    } else {
      window.open("/api/export", "_blank");
    }
  }, []);

  const openFolder = useCallback(async () => {
    setFileActionError(null);
    if (window.letterReader) {
      const res = await window.letterReader.openOutputFolder();
      if (!res.ok) setFileActionError(res.error ?? "error");
    }
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setErrorMessage(null);
    setResults([]);
    setActivity([]);
    setStatusMessage("");
    setRemaining(0);
    setRunTotal(0);
    setRunProcessed(0);
    setTranslations({});
    setActiveView({});
    setTranslating({});
    setTranslateError({});

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
            setResults((r) => [...r, ...event.letters]);
            setRunProcessed((p) => p + event.letters.length);
          } else if (event.t === "batch_error")
            setErrorMessage((prev) => (prev ? `${prev} | ${event.message}` : event.message));
          else if (event.t === "done") {
            setStatusMessage(t.statusDone(event.count));
            setProcessedTotal((p) => p + event.count);
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
      refreshPending();
    }
  }, [effort, refreshPending]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const translateLetter = useCallback(
    async (index: number, targetLang: Lang) => {
      const cached = translations[index]?.[targetLang];
      if (cached) {
        setActiveView((v) => ({ ...v, [index]: targetLang }));
        return;
      }
      const original = results[index];
      if (!original) return;

      setTranslating((v) => ({ ...v, [index]: targetLang }));
      setTranslateError((v) => ({ ...v, [index]: null }));

      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ letter: original, targetLang }),
        });
        const data = await res.json();
        if (!res.ok || !data.letter) {
          setTranslateError((v) => ({ ...v, [index]: data.error ?? t.translateError }));
          return;
        }
        setTranslations((v) => ({ ...v, [index]: { ...v[index], [targetLang]: data.letter } }));
        setActiveView((v) => ({ ...v, [index]: targetLang }));
      } catch (err) {
        setTranslateError((v) => ({ ...v, [index]: err instanceof Error ? err.message : t.translateError }));
      } finally {
        setTranslating((v) => ({ ...v, [index]: null }));
      }
    },
    [results, translations],
  );

  const healthTone = health?.state === "ok" ? "good" : health ? "warn" : "neutral";
  const healthText =
    health?.state === "ok"
      ? t.healthOk(health.email, health.plan)
      : health?.state === "not-installed"
        ? t.healthNotInstalled
        : health?.state === "not-logged-in"
          ? t.healthNotLoggedIn
          : health?.state === "unknown"
            ? t.healthUnknown(health.detail)
            : t.healthChecking;

  const totalPendingFiles = pending.reduce((sum, g) => sum + g.files.length, 0);

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>{t.appTitle}</h1>
          <p className="tagline">{t.tagline}</p>
        </div>
      </header>

      <div className={`health health-${healthTone}`}>{healthText}</div>

      <div className="columns">
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
            <span className="dz-icon">✉️</span>
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

          <h2>{totalPendingFiles > 0 ? t.pendingHeader(totalPendingFiles) : t.pendingEmpty}</h2>
          {pending.length > 0 && <p className="select-hint">{t.selectHint}</p>}
          {selected.size >= 2 && (
            <button className="secondary-btn" onClick={combineSelected}>
              {t.combineButton}
            </button>
          )}
          <ul className="pending-list">
            {pending.map((g) => (
              <li key={g.id} className={selected.has(g.id) ? "group selected" : "group"}>
                <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSelect(g.id)} />
                <div className="group-info">
                  <span className="pending-name">
                    {g.files[0].filename}
                    {g.files.length > 1 ? ` +${g.files.length - 1}` : ""}
                  </span>
                  {g.files.length > 1 && <span className="pages-badge">{t.pagesLabel(g.files.length)}</span>}
                </div>
                {g.files.length > 1 && (
                  <button className="split-btn" onClick={() => splitGroup(g)}>
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
            <label className="effort-label">
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

          {results.length > 0 && (
            <>
              <div className="results-head">
                <h2>{t.resultsTitle}</h2>
                <div className="results-actions">
                  <button className="secondary-btn" onClick={openExcel}>
                    {t.openFileButton}
                  </button>
                  {hasElectronBridge && (
                    <button className="secondary-btn" onClick={openFolder}>
                      {t.openFolderButton}
                    </button>
                  )}
                </div>
              </div>
              {fileActionError && <p className="error-line">{fileActionError}</p>}

              <div className="letter-cards">
                {results.map((r, i) => {
                  const view = activeView[i] ?? "original";
                  const data = view === "original" ? r : (translations[i]?.[view] ?? r);
                  const dir = view === "original" ? (isRtlLang(r.language) ? "rtl" : "ltr") : LANG_DIR[view];
                  const busyLang = translating[i];

                  return (
                    <div className="letter-card" key={i}>
                      <div className="translate-row">
                        <span className="translate-label">{t.translateLabel}</span>
                        <button
                          className={view === "original" ? "lang-chip active" : "lang-chip"}
                          onClick={() => setActiveView((v) => ({ ...v, [i]: "original" }))}
                        >
                          {t.originalLabel}
                          {r.language ? ` (${r.language.toUpperCase()})` : ""}
                        </button>
                        {LANGS.map((l) => (
                          <button
                            key={l}
                            className={view === l ? "lang-chip active" : "lang-chip"}
                            disabled={busyLang === l}
                            onClick={() => translateLetter(i, l)}
                          >
                            {busyLang === l ? "…" : LANG_LABEL[l]}
                          </button>
                        ))}
                      </div>
                      {busyLang && (
                        <div className="progress-track indeterminate">
                          <div className="progress-fill-indeterminate" />
                        </div>
                      )}
                      {translateError[i] && <p className="error-line">{translateError[i]}</p>}

                      <div className="letter-card-body" dir={dir} lang={data.language || undefined}>
                        <div className="letter-card-title">
                          {i + 1}. {data.subject || "—"}
                        </div>
                        <dl>
                          <div className="row">
                            <dt>{labels.sender}</dt>
                            <dd>{data.sender}</dd>
                          </div>
                          <div className="row">
                            <dt>{labels.recipient}</dt>
                            <dd>{data.recipient}</dd>
                          </div>
                          <div className="row">
                            <dt>{labels.date}</dt>
                            <dd>{data.date}</dd>
                          </div>
                          <div className="row">
                            <dt>{labels.short_summary}</dt>
                            <dd>{data.short_summary}</dd>
                          </div>
                          <div className="row">
                            <dt>{labels.full_description}</dt>
                            <dd>{data.full_description}</dd>
                          </div>
                          <div className="row">
                            <dt>{labels.action_needed}</dt>
                            <dd>{data.action_needed}</dd>
                          </div>
                          <div className="row" dir="ltr">
                            <dt>{labels.filename}</dt>
                            <dd className="mono">{data.filename}</dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {processedTotal > 0 && <p className="archived-note">{t.clearArchiveNote(processedTotal)}</p>}
        </section>
      </div>

      <style jsx>{`
        .page {
          max-width: 1100px;
          margin: 0 auto;
          padding: 2.5rem 1.75rem 4rem;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 1.2rem;
        }
        h1 {
          font-size: 1.7rem;
          font-weight: 800;
          margin: 0 0 0.3rem;
        }
        .tagline {
          color: var(--ink-soft);
          margin: 0;
          max-width: 48ch;
        }
        .health {
          border-radius: var(--radius);
          padding: 0.7rem 1.1rem;
          font-size: 0.9rem;
          margin-bottom: 1.6rem;
          border: 1px solid var(--rule);
        }
        .health-good {
          background: var(--good-soft);
          color: var(--good);
          border-color: transparent;
        }
        .health-warn {
          background: var(--stamp-soft);
          color: var(--stamp);
          border-color: transparent;
        }
        .health-neutral {
          background: var(--surface-2);
          color: var(--ink-soft);
        }
        .columns {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) minmax(340px, 1.6fr);
          gap: 2rem;
        }
        @media (max-width: 860px) {
          .columns {
            grid-template-columns: 1fr;
          }
        }
        .col {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .dropzone {
          border: 2px dashed var(--rule);
          border-radius: var(--radius);
          padding: 2.2rem 1.2rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          cursor: pointer;
          background: var(--surface);
          color: var(--ink);
        }
        .dropzone.dragover {
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .dz-icon {
          font-size: 1.8rem;
        }
        .dz-hint {
          color: var(--ink-faint);
          font-size: 0.82rem;
        }
        .secondary-btn {
          border: 1px solid var(--rule);
          background: var(--surface);
          color: var(--accent-ink);
          border-radius: 999px;
          padding: 0.55rem 1.2rem;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          text-align: center;
          text-decoration: none;
          display: inline-block;
        }
        .qr-panel {
          background: var(--surface);
          border: 1px solid var(--rule);
          border-radius: var(--radius);
          padding: 1.1rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          text-align: center;
        }
        .qr-hint {
          color: var(--ink-soft);
          font-size: 0.82rem;
        }
        h2 {
          font-size: 1rem;
          font-weight: 700;
          margin: 0.4rem 0 0;
        }
        .select-hint {
          color: var(--ink-faint);
          font-size: 0.8rem;
          margin: -0.2rem 0 0;
        }
        .pending-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          max-height: 320px;
          overflow-y: auto;
        }
        .pending-list li.group {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          background: var(--surface);
          border: 1px solid var(--rule);
          border-radius: 8px;
          padding: 0.4rem 0.7rem;
          font-size: 0.85rem;
        }
        .pending-list li.group.selected {
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .group-info {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 0;
        }
        .pending-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pages-badge {
          flex: none;
          background: var(--accent-soft);
          color: var(--accent-ink);
          border-radius: 999px;
          padding: 0.1rem 0.55rem;
          font-size: 0.72rem;
          font-weight: 700;
        }
        .split-btn {
          flex: none;
          border: none;
          background: transparent;
          color: var(--accent-ink);
          font-size: 0.78rem;
          cursor: pointer;
          text-decoration: underline;
        }
        .remove-btn {
          flex: none;
          border: none;
          background: transparent;
          color: var(--stamp);
          font-size: 1.1rem;
          cursor: pointer;
          line-height: 1;
        }
        .run-row {
          display: flex;
          align-items: flex-end;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .effort-label {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          font-size: 0.82rem;
          color: var(--ink-soft);
        }
        select {
          border: 1px solid var(--rule);
          border-radius: 8px;
          padding: 0.5rem 0.7rem;
          background: var(--surface);
          color: var(--ink);
        }
        .primary-btn {
          background: var(--accent);
          color: var(--surface);
          border: none;
          border-radius: 999px;
          padding: 0.7rem 1.6rem;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
        }
        .primary-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .stop-btn {
          background: var(--stamp);
          color: var(--surface);
          border: none;
          border-radius: 999px;
          padding: 0.7rem 1.6rem;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
        }
        .status-line {
          color: var(--ink-soft);
          font-size: 0.88rem;
          margin: 0;
        }
        .progress-wrap {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .progress-track {
          flex: 1;
          height: 8px;
          border-radius: 999px;
          background: var(--surface-2);
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 999px;
          transition: width 0.3s ease;
        }
        .progress-label {
          flex: none;
          font-size: 0.78rem;
          color: var(--ink-faint);
          font-variant-numeric: tabular-nums;
        }
        .progress-track.indeterminate {
          height: 4px;
          margin-bottom: 0.7rem;
          position: relative;
        }
        .progress-fill-indeterminate {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 40%;
          background: var(--accent);
          border-radius: 999px;
          animation: indeterminate-slide 1.1s ease-in-out infinite;
        }
        @keyframes indeterminate-slide {
          0% {
            left: -40%;
          }
          100% {
            left: 100%;
          }
        }
        .activity-log {
          list-style: none;
          margin: 0;
          padding: 0;
          font-size: 0.8rem;
          color: var(--ink-faint);
        }
        .error-line {
          color: var(--stamp);
          font-size: 0.88rem;
        }
        .results-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .results-actions {
          display: flex;
          gap: 0.5rem;
        }
        .letter-cards {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .letter-card {
          background: var(--surface);
          border: 1px solid var(--rule);
          border-radius: var(--radius);
          padding: 1.1rem 1.3rem;
        }
        .translate-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.35rem;
          margin-bottom: 0.8rem;
        }
        .translate-label {
          color: var(--ink-faint);
          font-size: 0.78rem;
          margin-right: 0.2rem;
        }
        .lang-chip {
          border: 1px solid var(--rule);
          background: var(--surface-2);
          color: var(--ink-soft);
          border-radius: 999px;
          padding: 0.25rem 0.7rem;
          font-size: 0.76rem;
          font-weight: 600;
          cursor: pointer;
        }
        .lang-chip.active {
          background: var(--accent-soft);
          color: var(--accent-ink);
          border-color: var(--accent);
        }
        .lang-chip:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .letter-card-title {
          font-weight: 700;
          color: var(--accent-ink);
          margin-bottom: 0.7rem;
          font-size: 0.98rem;
        }
        .letter-card dl {
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .letter-card .row {
          display: grid;
          grid-template-columns: 9rem 1fr;
          gap: 0.7rem;
        }
        @media (max-width: 560px) {
          .letter-card .row {
            grid-template-columns: 1fr;
            gap: 0.15rem;
          }
        }
        .letter-card dt {
          color: var(--ink-faint);
          font-size: 0.8rem;
          padding-top: 0.1rem;
        }
        .letter-card dd {
          margin: 0;
          color: var(--ink);
          font-size: 0.9rem;
          line-height: 1.6;
          white-space: pre-wrap;
        }
        .letter-card dd.mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.8rem;
          color: var(--ink-soft);
        }
        .archived-note {
          color: var(--ink-faint);
          font-size: 0.8rem;
        }
      `}</style>
    </main>
  );
}
