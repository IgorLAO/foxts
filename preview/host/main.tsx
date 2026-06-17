// preview/host/main.tsx — o app-shell do React Preview Runtime (estilo Storybook/Vite).
//
// Lista os forms do projeto numa sidebar, renderiza o form ativo no palco, com toggle
// light/dark. Wireia a navegação (FormManager.open) registrando cada classe de form em
// globalThis (as referências `declare class X {}` nos forms são erasadas no runtime ->
// resolvem para globalThis.X). HMR via re-render manual (sem plugin-react).
import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { forms, formNames, theme as projectTheme, entry } from "virtual:foxts-forms";
import { themeToCss } from "../runtime/theme";
import { FormInstanceContext } from "../runtime/context";
import { __setNavigator } from "../runtime/forms-shim";

type FormModule = Record<string, any>;
const moduleCache = new Map<string, FormModule>();

// escolhe a classe @Form exportada do módulo: preferir export cujo nome bate com o
// base name do arquivo; senão o primeiro export que é função/classe com .render no proto.
function pickFormClass(mod: FormModule, name: string): any {
  if (typeof mod[name] === "function") return mod[name];
  if (mod.default && typeof mod.default === "function") return mod.default;
  for (const v of Object.values(mod)) {
    if (typeof v === "function" && v.prototype && typeof v.prototype.render === "function") return v;
  }
  for (const v of Object.values(mod)) {
    if (typeof v === "function") return v;
  }
  return null;
}

// registra a classe em globalThis sob o nome do export e o .name da classe, p/ que
// `FormManager.open(LoginPage)` (LoginPage = ref erasada -> globalThis) resolva.
function registerGlobals(mod: FormModule) {
  for (const [k, v] of Object.entries(mod)) {
    if (typeof v === "function") {
      (globalThis as any)[k] = v;
      if (v.name && v.name !== k) (globalThis as any)[v.name] = v;
    }
  }
}

async function loadForm(name: string): Promise<FormModule | null> {
  const loader = (forms as Record<string, () => Promise<FormModule>>)[name];
  if (!loader) return null;
  const mod = await loader();
  moduleCache.set(name, mod);
  registerGlobals(mod);
  return mod;
}

// resolve o destino de uma navegação (classe ou string) para um nome de form conhecido.
function resolveFormName(target: any): string | null {
  if (typeof target === "string") {
    return formNames.includes(target) ? target : null;
  }
  if (typeof target === "function") {
    // 1) identidade contra os módulos já carregados
    for (const [name, mod] of moduleCache) {
      if (Object.values(mod).includes(target)) return name;
    }
    // 2) pelo nome da classe
    if (target.name && formNames.includes(target.name)) return target.name;
  }
  return null;
}

function App() {
  const stored = (typeof localStorage !== "undefined" && localStorage.getItem("foxts:mode")) as
    | "light"
    | "dark"
    | null;
  const [mode, setMode] = useState<"light" | "dark">(stored || (projectTheme as any)?.mode || "light");
  const urlForm =
    typeof location !== "undefined" && new URLSearchParams(location.search).get("form");
  const [active, setActive] = useState<string>(
    (urlForm && formNames.includes(urlForm) && urlForm) ||
      (entry && formNames.includes(entry) ? entry : formNames[0] || "")
  );
  const [inst, setInst] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // força re-instanciar (HMR / navegação repetida)

  // pré-carrega TODOS os forms no mount: registra cada classe em globalThis, p/ que
  // FormManager.open(LoginPage) resolva mesmo antes de a LoginPage ter sido aberta
  // (LoginPage = `declare class` erasada -> globalThis.LoginPage). São poucos forms.
  useEffect(() => {
    formNames.forEach((n) => { void loadForm(n); });
  }, []);

  // navegador: FormManager.open(X) -> troca o form ativo
  useEffect(() => {
    __setNavigator((target: any) => {
      const name = resolveFormName(target);
      if (name) {
        setActive(name);
        setTick((t) => t + 1);
      } else {
        console.warn("[foxts] navegação não resolvida:", target);
      }
      return undefined;
    });
    return () => __setNavigator(null);
  }, []);

  // instancia o form ativo (re-importa no HMR/navegação)
  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadForm(active)
      .then((mod) => {
        if (cancelled) return;
        if (!mod) {
          setInst(null);
          setError(`form não encontrado: ${active}`);
          return;
        }
        const FormClass = pickFormClass(mod, active);
        if (!FormClass) {
          setInst(null);
          setError(`nenhuma classe @Form em ${active}`);
          return;
        }
        try {
          setInst(new FormClass());
        } catch (e: any) {
          setInst(null);
          setError(String(e?.message || e));
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message || e));
      });
    return () => {
      cancelled = true;
    };
  }, [active, tick]);

  useEffect(() => {
    try {
      localStorage.setItem("foxts:mode", mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  const themeVars = themeToCss(projectTheme as any, mode);
  const cfg = inst && (inst.constructor as any).__formConfig;
  const stageW = (cfg && cfg.width) || inst?.width || 560;
  const stageH = (cfg && cfg.height) || inst?.height || 460;
  const caption = (cfg && cfg.caption) || inst?.caption || active;

  const isDark = mode === "dark";
  const chrome = {
    bg: isDark ? "#0b1220" : "#f1f5f9",
    panel: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#e2e8f0" : "#0f172a",
    sub: isDark ? "#94a3b8" : "#64748b",
    border: isDark ? "#1e293b" : "#e2e8f0",
    active: isDark ? "#1e293b" : "#eff6ff",
    accent: "#2563eb",
  };

  return (
    <div style={{ display: "flex", height: "100%", background: chrome.bg, color: chrome.text }}>
      {/* sidebar */}
      <aside
        style={{
          width: 232,
          flexShrink: 0,
          borderRight: `1px solid ${chrome.border}`,
          background: chrome.panel,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${chrome.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.2 }}>FoxTS Preview</div>
          <div style={{ fontSize: 11, color: chrome.sub, marginTop: 2 }}>
            {formNames.length} {formNames.length === 1 ? "form" : "forms"}
          </div>
        </div>
        <nav style={{ padding: 8, overflowY: "auto", flex: 1 }}>
          {formNames.map((name) => {
            const sel = name === active;
            return (
              <button
                key={name}
                onClick={() => {
                  setActive(name);
                  setTick((t) => t + 1);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  marginBottom: 2,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 13,
                  fontWeight: sel ? 600 : 400,
                  color: sel ? chrome.accent : chrome.text,
                  background: sel ? chrome.active : "transparent",
                }}
              >
                {name}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* main */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* top bar */}
        <header
          style={{
            height: 48,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: `1px solid ${chrome.border}`,
            background: chrome.panel,
          }}
        >
          <div style={{ fontSize: 13, color: chrome.sub }}>{caption}</div>
          <button
            onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}
            title="Alternar tema"
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: `1px solid ${chrome.border}`,
              background: "transparent",
              color: chrome.text,
              cursor: "pointer",
              font: "inherit",
              fontSize: 12,
            }}
          >
            {isDark ? "Escuro" : "Claro"}
          </button>
        </header>

        {/* stage */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: 32,
          }}
        >
          {error ? (
            <pre
              style={{
                color: "#dc2626",
                fontFamily: "Consolas, monospace",
                fontSize: 13,
                whiteSpace: "pre-wrap",
                maxWidth: 560,
              }}
            >
              {error}
            </pre>
          ) : inst ? (
            <div
              style={{
                ...(themeVars as React.CSSProperties),
                width: stageW,
                minHeight: stageH,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                boxShadow: isDark ? "0 8px 30px rgba(0,0,0,.4)" : "0 8px 30px rgba(15,23,42,.08)",
                overflow: "hidden",
                fontFamily: "var(--font-body)",
              }}
            >
              {/* chrome do form (title bar) */}
              <div
                style={{
                  height: 34,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  gap: 8,
                  borderBottom: "1px solid var(--border)",
                  background: "var(--altRow)",
                  color: "var(--onSurface)",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "var(--font-title)",
                }}
              >
                <span style={{ display: "flex", gap: 6 }}>
                  <i style={{ width: 11, height: 11, borderRadius: "50%", background: "#ff5f57", display: "inline-block" }} />
                  <i style={{ width: 11, height: 11, borderRadius: "50%", background: "#febc2e", display: "inline-block" }} />
                  <i style={{ width: 11, height: 11, borderRadius: "50%", background: "#28c840", display: "inline-block" }} />
                </span>
                <span style={{ marginLeft: 4 }}>{caption}</span>
              </div>
              <div style={{ background: "var(--bg)", minHeight: stageH - 34 }}>
                <FormInstanceContext.Provider value={inst}>{inst.render()}</FormInstanceContext.Provider>
              </div>
            </div>
          ) : (
            <div style={{ color: chrome.sub, fontSize: 13 }}>carregando…</div>
          )}
        </div>
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
function render() {
  root.render(<App />);
}
render();

// HMR: o virtual de forms e os módulos de form aceitam hot-update. A abordagem mais
// robusta com nosso jsxFactory custom (sem react-refresh) é re-renderizar a raiz; se o
// virtual mudar (form add/remove) ou o tema, o plugin já dispara full-reload.
if (import.meta.hot) {
  import.meta.hot.accept("virtual:foxts-forms", () => {
    // mudança na lista/tema -> recarrega a página (estado simples, dev tool)
    location.reload();
  });
  // self-accept: editar este shell re-renderiza sem reload total
  import.meta.hot.accept(() => render());
}
