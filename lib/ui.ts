import type { CSSProperties } from "react";
import type { Company } from "./company";

/**
 * Maps the abstract tone names in the taxonomy onto the CSS custom properties
 * in globals.css. Components set `--tone` / `--tone-soft` on an element and
 * every nested badge, border and heading picks the same colour up.
 */
export function toneStyle(tone: string): CSSProperties {
  return {
    ["--tone" as string]: `var(--tone-${tone})`,
    ["--tone-soft" as string]: `var(--tone-${tone}-soft)`,
  };
}

export function companyStyle(color: string | undefined): CSSProperties {
  if (!color) return { ["--tone" as string]: "var(--ink-faint)" };
  return { ["--tone" as string]: `var(--co-${color})` };
}

export function companyById(companies: Company[], id: string): Company | undefined {
  return id ? companies.find((c) => c.id === id) : undefined;
}
