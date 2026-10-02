"use client";

import { useMemo, useState } from "react";
import { COPY } from "@/lib/i18n";
import { compareForTriage, isOverdue, type DocumentRecord } from "@/lib/document";
import { DOC_TYPES, DOC_TYPE_META, STATUS_META, STATUS_ORDER, type DocType } from "@/lib/taxonomy";
import type { Company } from "@/lib/company";
import type { DocumentPatch } from "@/lib/documents";
import { companyStyle, toneStyle } from "@/lib/ui";
import DocumentCard from "./DocumentCard";

const t = COPY;

type Props = {
  documents: DocumentRecord[];
  companies: Company[];
  onPatch: (id: string, patch: DocumentPatch) => void;
  onDelete: (id: string) => void;
  onOpenWorkbook: () => void;
  onOpenFolder: (() => void) | null;
  fileActionError: string | null;
};

/** "" is the Unassigned pile; null means every company at once. */
type CompanyFilter = string | null;

function matchesSearch(doc: DocumentRecord, needle: string): boolean {
  if (!needle) return true;
  const haystack = [
    doc.subject,
    doc.sender,
    doc.recipient,
    doc.reference,
    doc.short_summary,
    doc.action_needed,
    doc.companyGuess,
    doc.note,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

/**
 * The triage view: pick a company, then read down the buckets in order of
 * how much they need you. Everything is filtered client-side — the whole
 * store is small enough that it is already in memory, and keeping it local
 * means re-filing a card re-sorts it instantly.
 */
export default function Dashboard({
  documents,
  companies,
  onPatch,
  onDelete,
  onOpenWorkbook,
  onOpenFolder,
  fileActionError,
}: Props) {
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<DocType | "">("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const knownIds = useMemo(() => new Set(companies.map((c) => c.id)), [companies]);

  const countsByCompany = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) {
      const key = knownIds.has(doc.companyId) ? doc.companyId : "";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [documents, knownIds]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return documents.filter((doc) => {
      const key = knownIds.has(doc.companyId) ? doc.companyId : "";
      if (companyFilter !== null && key !== companyFilter) return false;
      if (typeFilter && doc.docType !== typeFilter) return false;
      if (overdueOnly && !isOverdue(doc)) return false;
      return matchesSearch(doc, needle);
    });
  }, [documents, companyFilter, typeFilter, overdueOnly, search, knownIds]);

  const buckets = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        items: visible.filter((d) => d.status === status).sort((a, b) => compareForTriage(a, b)),
      })),
    [visible],
  );

  const openCount = visible.filter((d) => d.status === "needs_action" || d.status === "review").length;
  const overdueCount = visible.filter((d) => isOverdue(d)).length;
  const outstanding = useMemo(() => {
    const byCurrency = new Map<string, number>();
    for (const doc of visible) {
      if (doc.status !== "needs_action" && doc.status !== "scheduled") continue;
      const value = Number(doc.amount);
      if (!Number.isFinite(value) || value === 0) continue;
      const code = doc.currency || "—";
      byCurrency.set(code, (byCurrency.get(code) ?? 0) + value);
    }
    return [...byCurrency.entries()]
      .map(([code, sum]) => `${code} ${sum.toLocaleString("en-US", { maximumFractionDigits: 2 })}`)
      .join(" · ");
  }, [visible]);

  if (documents.length === 0) {
    return <p className="empty-note">{t.emptyDashboard}</p>;
  }

  return (
    <>
      {companies.length === 0 && <p className="empty-note">{t.noCompaniesYetDashboard}</p>}

      <div className="company-rail">
        <button
          className={companyFilter === null ? "company-chip active" : "company-chip"}
          onClick={() => setCompanyFilter(null)}
        >
          {t.allCompanies} <span className="count">{documents.length}</span>
        </button>
        {companies.map((c) => (
          <button
            key={c.id}
            className={companyFilter === c.id ? "company-chip active" : "company-chip"}
            style={companyStyle(c.color)}
            onClick={() => setCompanyFilter(c.id)}
          >
            <span className="company-dot" style={{ background: "var(--tone)" }} />
            {c.name} <span className="count">{countsByCompany.get(c.id) ?? 0}</span>
          </button>
        ))}
        {(countsByCompany.get("") ?? 0) > 0 && (
          <button
            className={companyFilter === "" ? "company-chip active" : "company-chip"}
            onClick={() => setCompanyFilter("")}
          >
            {t.unassigned} <span className="count">{countsByCompany.get("")}</span>
          </button>
        )}
      </div>

      <div className="toolbar">
        <input
          className="grow"
          type="search"
          placeholder={t.filterSearch}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as DocType | "")}>
          <option value="">{t.filterType}</option>
          {DOC_TYPES.map((d) => (
            <option key={d} value={d}>
              {DOC_TYPE_META[d].label}
            </option>
          ))}
        </select>
        <label className="toggle">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          {t.filterOverdue}
        </label>
        <button className="secondary-btn" onClick={onOpenWorkbook}>
          {t.openFileButton}
        </button>
        {onOpenFolder && (
          <button className="secondary-btn" onClick={onOpenFolder}>
            {t.openFolderButton}
          </button>
        )}
      </div>
      {fileActionError && <p className="error-line">{fileActionError}</p>}

      <div className="summary-strip">
        <div className="summary-tile">
          <span className="n">{openCount}</span>
          <span className="k">To handle</span>
        </div>
        <div className={overdueCount > 0 ? "summary-tile alert" : "summary-tile"}>
          <span className="n">{overdueCount}</span>
          <span className="k">Overdue</span>
        </div>
        <div className="summary-tile">
          <span className="n">{visible.length}</span>
          <span className="k">Shown</span>
        </div>
        {outstanding && (
          <div className="summary-tile">
            <span className="n" style={{ fontSize: "1rem" }}>
              {outstanding}
            </span>
            <span className="k">Outstanding</span>
          </div>
        )}
      </div>

      {buckets.map(({ status, items }) => {
        if (items.length === 0) return null;
        const meta = STATUS_META[status];
        return (
          <section className="bucket" key={status} style={toneStyle(meta.tone)}>
            <div className="bucket-head">
              <h2>{meta.label}</h2>
              <span className="count">{items.length}</span>
              <span className="hint">{meta.hint}</span>
            </div>
            <div className="bucket-list">
              {items.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  companies={companies}
                  onPatch={onPatch}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </section>
        );
      })}

      {visible.length === 0 && <p className="empty-note">{t.emptyBucket}</p>}
    </>
  );
}
