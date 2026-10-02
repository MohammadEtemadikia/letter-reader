"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { COPY } from "@/lib/i18n";
import type { DocumentRecord } from "@/lib/document";
import type { DocumentPatch } from "@/lib/documents";
import type { Company } from "@/lib/company";
import type { PendingGroup } from "@/lib/inbox";
import type { Health } from "@/lib/claude-cli";
import Dashboard from "./components/Dashboard";
import Intake from "./components/Intake";
import Companies from "./components/Companies";

const t = COPY;

type Tab = "dashboard" | "intake" | "companies";

/**
 * The shell owns the two long-lived collections — the filed documents and the
 * company roster — because all three tabs read from them: the dashboard
 * triages documents, intake adds to them, and the companies tab changes how
 * they are grouped.
 */
export default function Home() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [health, setHealth] = useState<Health | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [pending, setPending] = useState<PendingGroup[]>([]);
  const [running, setRunning] = useState(false);
  const [effort, setEffort] = useState("high");
  const [hasElectronBridge, setHasElectronBridge] = useState(false);
  const [fileActionError, setFileActionError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  const refreshDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents", { cache: "no-store" });
      const data = await res.json();
      setDocuments(data.documents ?? []);
      setCompanies(data.companies ?? []);
    } catch {
      /* transient */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ state: "unknown", detail: "network error" }));
    refreshDocuments();
    refreshPending();
  }, [refreshDocuments, refreshPending]);

  // The Inbox folder is also fed from a phone over the local upload server,
  // so it has to be polled — but never while a run is consuming it.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!running) refreshPending();
    }, 4000);
    return () => clearInterval(interval);
  }, [refreshPending, running]);

  /** Optimistic re-filing: the card moves immediately, the server confirms. */
  const patchDocument = useCallback(async (id: string, patch: DocumentPatch) => {
    setDocuments((docs) =>
      docs.map((d) => (d.id === id ? { ...d, ...patch, reviewedByUser: true, updatedAt: Date.now() } : d)),
    );
    try {
      const res = await fetch("/api/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (res.ok && data.document) {
        setDocuments((docs) => docs.map((d) => (d.id === id ? data.document : d)));
      }
    } catch {
      /* the optimistic state stands; a reload re-reads the truth */
    }
  }, []);

  const deleteDocument = useCallback(async (id: string) => {
    setDocuments((docs) => docs.filter((d) => d.id !== id));
    await fetch(`/api/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const openWorkbook = useCallback(async () => {
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

  const countsByCompany = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) counts.set(doc.companyId, (counts.get(doc.companyId) ?? 0) + 1);
    return counts;
  }, [documents]);

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

  const pendingCount = pending.reduce((sum, g) => sum + g.files.length, 0);
  const openCount = documents.filter((d) => d.status === "needs_action" || d.status === "review").length;

  return (
    <main className="page">
      <header className="app-head">
        <div>
          <h1>{t.appTitle}</h1>
          <p className="tagline">{t.tagline}</p>
        </div>
        <div className={`health health-${healthTone}`}>{healthText}</div>
      </header>

      <nav className="tabs">
        <button
          className={tab === "dashboard" ? "tab active" : "tab"}
          onClick={() => setTab("dashboard")}
        >
          {t.tabDashboard}
          {openCount > 0 && <span className="tab-count">{openCount}</span>}
        </button>
        <button className={tab === "intake" ? "tab active" : "tab"} onClick={() => setTab("intake")}>
          {t.tabIntake}
          {pendingCount > 0 && <span className="tab-count">{pendingCount}</span>}
          {running && <span className="tab-count">…</span>}
        </button>
        <button
          className={tab === "companies" ? "tab active" : "tab"}
          onClick={() => setTab("companies")}
        >
          {t.tabCompanies}
          <span className="tab-count">{companies.length}</span>
        </button>
      </nav>

      {tab === "dashboard" &&
        (loaded ? (
          <Dashboard
            documents={documents}
            companies={companies}
            onPatch={patchDocument}
            onDelete={deleteDocument}
            onOpenWorkbook={openWorkbook}
            onOpenFolder={hasElectronBridge ? openFolder : null}
            fileActionError={fileActionError}
          />
        ) : (
          <p className="empty-note">Loading…</p>
        ))}

      {tab === "intake" && (
        <Intake
          pending={pending}
          setPending={setPending}
          refreshPending={refreshPending}
          health={health}
          running={running}
          setRunning={setRunning}
          effort={effort}
          setEffort={setEffort}
          onFiled={(docs) => setDocuments((prev) => [...prev, ...docs])}
          onFinished={refreshDocuments}
        />
      )}

      {tab === "companies" && (
        <Companies
          companies={companies}
          counts={countsByCompany}
          onSaved={(next) => {
            setCompanies(next);
            refreshDocuments();
          }}
        />
      )}
    </main>
  );
}
