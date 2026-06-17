// preview/runtime/theme.ts — vfp.theme.json -> CSS custom properties.
//
// Os componentes do runtime estilizam SÓ por estes tokens (var(--primary), …), nunca por
// cor literal — assim trocar um token no vfp.theme.json re-estiliza tudo ao vivo, igual
// ao "restyle-by-recompile" do build VFP. Light/dark: `mode` + o bloco `dark` (merge).
import type React from "react";

export interface Theme {
  mode?: "light" | "dark";
  font?: string;
  fontTitle?: string;
  fontBody?: string;
  fontData?: string;
  win11?: boolean;
  flat?: boolean;
  colors?: Record<string, string>;
  dark?: Record<string, string>;
}

/** nomes de token de cor reconhecidos (mesmos do scaffold/transpilador). */
export const COLOR_TOKENS = [
  "primary", "onPrimary", "success", "danger", "warning",
  "surface", "onSurface", "border", "altRow", "muted", "bg",
] as const;

const DEFAULTS: Record<string, string> = {
  primary: "#2563eb", onPrimary: "#ffffff", success: "#16a34a", danger: "#dc2626",
  warning: "#f59e0b", surface: "#ffffff", onSurface: "#0f172a", border: "#e2e8f0",
  altRow: "#f1f5f9", muted: "#64748b", bg: "#f8fafc",
};

/** referência a um token como CSS var, com fallback opcional: token("primary") -> var(--primary). */
export const token = (name: string, fallback?: string) =>
  `var(--${name}${fallback ? `, ${fallback}` : ""})`;

/** monta as CSS vars (--primary, --font, …) p/ aplicar na raiz do preview de um form. */
export function themeToCss(theme: Theme = {}, mode?: "light" | "dark"): React.CSSProperties {
  const m = mode || theme.mode || "light";
  const colors = { ...DEFAULTS, ...(theme.colors || {}), ...(m === "dark" ? theme.dark || {} : {}) };
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(colors)) vars[`--${k}`] = v;
  vars["--font"] = theme.font || "Segoe UI";
  vars["--font-title"] = theme.fontTitle || theme.font || "Segoe UI";
  vars["--font-body"] = theme.fontBody || theme.font || "Segoe UI";
  vars["--font-data"] = theme.fontData || "Consolas";
  vars["--radius"] = theme.win11 === false ? "2px" : "8px";
  return vars as React.CSSProperties;
}
