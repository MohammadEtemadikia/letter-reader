"use client";

import { useCallback, useState } from "react";
import { COPY, isRtlLang, LANG_DIR, LANG_LABEL } from "@/lib/i18n";
import {
  daysUntilDue,
  FIELD_LABELS,
  formatAmount,
  isOverdue,
  type DocumentRecord,
  type ExtractedFields,
} from "@/lib/document";
import {
  DOC_TYPES,
  DOC_TYPE_META,
  PRIORITIES,
  PRIORITY_META,
  STATUSES,
  STATUS_META,
} from "@/lib/taxonomy";
import type { Company } from "@/lib/company";
import { LANGS, type Lang } from "@/lib/prompt";
import { companyById, companyStyle, toneStyle } from "@/lib/ui";
import type { DocumentPatch } from "@/lib/documents";

const t = COPY;

type Props = {
  doc: DocumentRecord;
  companies: Company[];
  onPatch: (id: string, patch: DocumentPatch) => void;
  onDelete: (id: string) => void;
};

/**
 * One filed document. Collapsed it is a triage line — type, subject, who it
 * is from, what it costs, when it is due. Expanded it becomes the full read,
 * with the controls to re-file it and the translation chips.
 *
 * Every re-filing control writes straight through to the server; the parent
 * applies the returned record, so the spreadsheet and the dashboard can never
 * disagree about where a document sits.
 */
export default function DocumentCard({ doc, companies, onPatch, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [note, setNote] = useState(doc.note);

  // Translations are per card and per language, kept in memory for the
  // session — re-asking for one already fetched would be a wasted model call.
  const [translations, setTranslations] = useState<Partial<Record<Lang, ExtractedFields>>>({});
  const [view, setView] = useState<Lang | "original">("original");
  const [busyLang, setBusyLang] = useState<Lang | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const company = companyById(companies, doc.companyId);
  const overdue = isOverdue(doc);
  const days = daysUntilDue(doc);
  const amount = formatAmount(doc);
  const typeMeta = DOC_TYPE_META[doc.docType];

  const fields: ExtractedFields = view === "original" ? doc : (translations[view] ?? doc);
  const dir = view === "original" ? (isRtlLang(doc.language) ? "rtl" : "ltr") : LANG_DIR[view];

  const translate = useCallback(
    async (target: Lang) => {
      if (translations[target]) {
        setView(target);
        return;
      }
      setBusyLang(target);
      setTranslateError(null);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              language: doc.language,
              sender: doc.sender,
              recipient: doc.recipient,
              date: doc.date,
              subject: doc.subject,
              short_summary: doc.short_summary,
              full_description: doc.full_description,
              action_needed: doc.action_needed,
            },
            targetLang: target,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.fields) {
          setTranslateError(data.error ?? t.translateError);
          return;
        }
        setTranslations((prev) => ({ ...prev, [target]: data.fields }));
        setView(target);
      } catch (err) {
        setTranslateError(err instanceof Error ? err.message : t.translateError);
      } finally {
        setBusyLang(null);
      }
    },
    [doc, translations],
  );

  const dueBadge = (() => {
    if (days === null) return null;
    if (overdue) return <span className="badge" style={toneStyle("red")}>{t.overdueBadge(-days)}</span>;
    if (doc.status === "done" || doc.status === "archive") return null;
    if (days <= 7) return <span className="badge" style={toneStyle("amber")}>{t.dueBadge(days)}</span>;
    return <span className="badge" style={toneStyle("grey")}>{doc.dueDate}</span>;
  })();

  return (
    <article
      className={overdue ? "doc-card overdue" : "doc-card"}
      style={toneStyle(PRIORITY_META[doc.priority].tone)}
    >
      <div
        className="doc-top"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <span className="doc-icon" aria-hidden>
          {typeMeta.icon}
        </span>
        <div className="doc-main">
          <p className="doc-title" dir={dir}>
            {fields.subject || "—"}
          </p>
          {/*
            Separators are their own elements rather than ::before on each
            item: inside an RTL sender a pseudo-element lands on the wrong
            side and two dots end up side by side.
          */}
          <div className="doc-sub">
            <span>{typeMeta.label}</span>
            <span className="dot" aria-hidden>
              ·
            </span>
            <bdi>{fields.sender}</bdi>
            <span className="dot" aria-hidden>
              ·
            </span>
            {company ? (
              <span className="company-tag" style={companyStyle(company.color)}>
                <span className="company-dot" style={{ background: "var(--tone)" }} />
                {company.name}
              </span>
            ) : (
              <span>{t.unassigned}</span>
            )}
            {doc.reference && (
              <>
                <span className="dot" aria-hidden>
                  ·
                </span>
                <span>#{doc.reference}</span>
              </>
            )}
          </div>
        </div>
        <div className="doc-right">
          {amount && <span className="amount">{amount}</span>}
          {dueBadge}
          {doc.priority === "urgent" && (
            <span className="badge" style={toneStyle("red")}>
              {PRIORITY_META.urgent.label}
            </span>
          )}
        </div>
      </div>

      {!doc.reviewedByUser && doc.companyConfidence === "low" && companies.length > 0 && (
        <p className="error-line">
          {t.lowConfidenceWarning} {doc.companyGuess && <em>({doc.companyGuess})</em>}
        </p>
      )}

      <div className="doc-controls">
        <select
          value={doc.status}
          aria-label={FIELD_LABELS.status}
          onChange={(e) => onPatch(doc.id, { status: e.target.value as DocumentRecord["status"] })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <select
          value={doc.companyId}
          aria-label={FIELD_LABELS.company}
          onChange={(e) => onPatch(doc.id, { companyId: e.target.value })}
        >
          <option value="">{t.unassigned}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={doc.priority}
          aria-label={FIELD_LABELS.priority}
          onChange={(e) => onPatch(doc.id, { priority: e.target.value as DocumentRecord["priority"] })}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_META[p].label}
            </option>
          ))}
        </select>
        <select
          value={doc.docType}
          aria-label={FIELD_LABELS.docType}
          onChange={(e) => onPatch(doc.id, { docType: e.target.value as DocumentRecord["docType"] })}
        >
          {DOC_TYPES.map((d) => (
            <option key={d} value={d}>
              {DOC_TYPE_META[d].label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={doc.dueDate}
          aria-label={FIELD_LABELS.dueDate}
          onChange={(e) => onPatch(doc.id, { dueDate: e.target.value })}
        />
        <button className="link-btn" onClick={() => setOpen((v) => !v)}>
          {open ? "−" : "+"} {open ? "less" : "more"}
        </button>
      </div>

      {open && (
        <div className="doc-body">
          <div className="translate-row">
            <span className="translate-label">{t.translateLabel}</span>
            <button
              className={view === "original" ? "lang-chip active" : "lang-chip"}
              onClick={() => setView("original")}
            >
              {t.originalLabel}
              {doc.language ? ` (${doc.language.toUpperCase()})` : ""}
            </button>
            {LANGS.map((l) => (
              <button
                key={l}
                className={view === l ? "lang-chip active" : "lang-chip"}
                disabled={busyLang === l}
                onClick={() => translate(l)}
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
          {translateError && <p className="error-line">{translateError}</p>}

          <dl dir={dir} lang={fields.language || undefined}>
            <div className="row">
              <dt>{FIELD_LABELS.sender}</dt>
              <dd>{fields.sender}</dd>
            </div>
            <div className="row">
              <dt>{FIELD_LABELS.recipient}</dt>
              <dd>{fields.recipient}</dd>
            </div>
            <div className="row">
              <dt>{FIELD_LABELS.date}</dt>
              <dd>{fields.date}</dd>
            </div>
            <div className="row">
              <dt>{FIELD_LABELS.action_needed}</dt>
              <dd>{fields.action_needed}</dd>
            </div>
            <div className="row">
              <dt>{FIELD_LABELS.short_summary}</dt>
              <dd>{fields.short_summary}</dd>
            </div>
            <div className="row">
              <dt>{FIELD_LABELS.full_description}</dt>
              <dd>{fields.full_description}</dd>
            </div>
            <div className="row" dir="ltr">
              <dt>{FIELD_LABELS.reference}</dt>
              <dd className="mono">{doc.reference || "—"}</dd>
            </div>
            <div className="row" dir="ltr">
              <dt>{FIELD_LABELS.files}</dt>
              <dd className="mono">{doc.files.join(", ")}</dd>
            </div>
          </dl>

          <textarea
            className="note-input"
            rows={2}
            placeholder={t.noteePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (note !== doc.note) onPatch(doc.id, { note });
            }}
          />

          <div className="doc-extras">
            {doc.files.length > 0 && (
              <button className="link-btn" onClick={() => setShowScan((v) => !v)}>
                {showScan ? t.hideScanButton : t.openScanButton}
              </button>
            )}
            <button
              className="link-btn danger"
              onClick={() => {
                if (window.confirm(t.deleteDocumentConfirm)) onDelete(doc.id);
              }}
            >
              {t.deleteButton}
            </button>
          </div>

          {showScan && (
            <div className="scan-preview">
              {doc.files.map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={f} src={`/api/file?name=${encodeURIComponent(f)}`} alt={f} />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
