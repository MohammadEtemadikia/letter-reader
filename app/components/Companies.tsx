"use client";

import { useState } from "react";
import { COPY } from "@/lib/i18n";
import { COMPANY_COLORS, type Company } from "@/lib/company";
import { companyStyle } from "@/lib/ui";

const t = COPY;

type Draft = {
  id: string | null;
  name: string;
  aliases: string;
  numbers: string;
  addresses: string;
  notes: string;
  color: string;
};

const EMPTY: Draft = { id: null, name: "", aliases: "", numbers: "", addresses: "", notes: "", color: COMPANY_COLORS[0] };

function toDraft(c: Company): Draft {
  return {
    id: c.id,
    name: c.name,
    aliases: c.aliases.join("\n"),
    numbers: c.numbers.join("\n"),
    addresses: c.addresses.join("\n"),
    notes: c.notes,
    color: c.color,
  };
}

type Props = {
  companies: Company[];
  counts: Map<string, number>;
  onSaved: (companies: Company[]) => void;
};

/**
 * The company roster is what makes filing possible at all: every string
 * entered here — trade names, VAT numbers, postal addresses — is handed to
 * the model as the evidence it matches a document's recipient against.
 */
export default function Companies({ companies, counts, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/companies", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save.");
        return;
      }
      onSaved(data.companies ?? []);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (company: Company) => {
    if (!window.confirm(t.deleteCompanyConfirm(company.name))) return;
    const res = await fetch(`/api/companies?id=${encodeURIComponent(company.id)}`, { method: "DELETE" });
    const data = await res.json();
    onSaved(data.companies ?? []);
  };

  return (
    <>
      {companies.length === 0 && <p className="empty-note">{t.noCompaniesYet}</p>}

      <div className="company-grid">
        {companies.map((c) => (
          <div className="company-card" key={c.id} style={companyStyle(c.color)}>
            <h3>{c.name}</h3>
            <span className="meta">{counts.get(c.id) ?? 0} document(s) filed</span>
            {c.aliases.length > 0 && (
              <span className="meta">
                <b>Also:</b> {c.aliases.join(", ")}
              </span>
            )}
            {c.numbers.length > 0 && (
              <span className="meta">
                <b>Numbers:</b> {c.numbers.join(", ")}
              </span>
            )}
            {c.addresses.length > 0 && (
              <span className="meta">
                <b>Addresses:</b> {c.addresses.join(" / ")}
              </span>
            )}
            {c.notes && <span className="meta">{c.notes}</span>}
            <div className="form-actions">
              <button className="link-btn" onClick={() => setDraft(toDraft(c))}>
                {t.editButton}
              </button>
              <button className="link-btn danger" onClick={() => remove(c)}>
                {t.deleteButton}
              </button>
            </div>
          </div>
        ))}
      </div>

      {draft === null ? (
        <p style={{ marginTop: "1.2rem" }}>
          <button className="primary-btn" onClick={() => setDraft({ ...EMPTY, color: COMPANY_COLORS[companies.length % COMPANY_COLORS.length] })}>
            {t.addCompanyButton}
          </button>
        </p>
      ) : (
        <div className="company-form" style={{ marginTop: "1.2rem" }}>
          <label className="field">
            {t.companyNameLabel}
            <input
              type="text"
              value={draft.name}
              autoFocus
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field">
            {t.companyAliasesLabel}
            <textarea
              rows={2}
              value={draft.aliases}
              onChange={(e) => setDraft({ ...draft, aliases: e.target.value })}
            />
            <span className="field-hint">{t.companyListHint}</span>
          </label>
          <label className="field">
            {t.companyNumbersLabel}
            <textarea
              rows={2}
              value={draft.numbers}
              onChange={(e) => setDraft({ ...draft, numbers: e.target.value })}
            />
            <span className="field-hint">{t.companyListHint}</span>
          </label>
          <label className="field">
            {t.companyAddressesLabel}
            <textarea
              rows={2}
              value={draft.addresses}
              onChange={(e) => setDraft({ ...draft, addresses: e.target.value })}
            />
            <span className="field-hint">{t.companyAddressHint}</span>
          </label>
          <label className="field">
            {t.companyNotesLabel}
            <textarea
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
          <div className="field">
            Colour
            <div className="swatches">
              {COMPANY_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  className={draft.color === color ? "swatch active" : "swatch"}
                  style={{ background: `var(--co-${color})` }}
                  onClick={() => setDraft({ ...draft, color })}
                />
              ))}
            </div>
          </div>
          {error && <p className="error-line">{error}</p>}
          <div className="form-actions">
            <button className="primary-btn" disabled={saving || !draft.name.trim()} onClick={save}>
              {t.saveButton}
            </button>
            <button className="secondary-btn" onClick={() => setDraft(null)}>
              {t.cancelButton}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
