// preview/vite.config.mjs — Vite dev server do React Preview Runtime (FoxTS).
//
// É o config que o PACOTE foxts envia; o `vfp dev` spawna o vite local do projeto
// apontando `--config` para cá e passando o projeto-alvo via env. Renderiza os
// forms TSX do projeto no navegador com HMR, usando a 2ª impl de @vfp/core
// (preview/runtime/index.ts). NÃO gera VFP.
//
// Env esperadas (setadas pelo cmdDev em vfp.js):
//   FOXTS_PROJECT  caminho absoluto do projeto-alvo (ex.: showcase/catraca-app)
//   FOXTS_SRC      srcDir do projeto (default "src")
//   FOXTS_THEME    caminho do vfp.theme.json (opcional)
//   FOXTS_PORT     porta do dev server (default 5173)
import { defineConfig } from "vite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join, basename } from "node:path";
import fs from "node:fs";

const PREVIEW_DIR = dirname(fileURLToPath(import.meta.url));
const RUNTIME = resolve(PREVIEW_DIR, "runtime/index.ts");
const JSX_FACTORY = resolve(PREVIEW_DIR, "jsx.ts");

const PROJECT = process.env.FOXTS_PROJECT
  ? resolve(process.env.FOXTS_PROJECT)
  : resolve(PREVIEW_DIR, "../showcase/catraca-app"); // fallback p/ smoke-test
const SRC = process.env.FOXTS_SRC || "src";
const THEME_FILE = process.env.FOXTS_THEME || join(PROJECT, "vfp.theme.json");
const PORT = Number(process.env.FOXTS_PORT) || 5173;
const REPO_ROOT = resolve(PREVIEW_DIR, "..");

const FORMS_DIR = join(PROJECT, SRC, "forms");
const ICONS_DIR = join(PROJECT, "icons");

// import string injetado em todo .tsx (file URL p/ funcionar no Windows)
const JSX_INJECT = `import { h, Fragment } from ${JSON.stringify(pathToFileURL(JSX_FACTORY).href)};`;

// ── módulo virtual "virtual:foxts-forms" ───────────────────────────────────────
// Varre src/forms/*.form.tsx e expõe theme + lista de forms + loaders dinâmicos.
const VIRTUAL_ID = "virtual:foxts-forms";
const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID;

function readTheme() {
  try {
    return fs.existsSync(THEME_FILE) ? JSON.parse(fs.readFileSync(THEME_FILE, "utf8")) : {};
  } catch {
    return {};
  }
}

function listForms() {
  if (!fs.existsSync(FORMS_DIR)) return [];
  return fs
    .readdirSync(FORMS_DIR)
    .filter((f) => f.endsWith(".form.tsx"))
    .map((f) => ({ name: basename(f, ".form.tsx"), file: join(FORMS_DIR, f) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildVirtualModule() {
  const theme = readTheme();
  const forms = listForms();
  const names = forms.map((f) => f.name);
  // entry: cfg.entry do vfp.config.json, senão o primeiro form
  let entry = names[0] || "";
  try {
    const cfgFile = join(PROJECT, "vfp.config.json");
    if (fs.existsSync(cfgFile)) {
      const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
      if (cfg.entry && names.includes(cfg.entry)) entry = cfg.entry;
    }
  } catch {
    /* ignore */
  }
  const loaders = forms
    .map((f) => `  ${JSON.stringify(f.name)}: () => import(${JSON.stringify(pathToFileURL(f.file).href)})`)
    .join(",\n");
  return [
    `export const theme = ${JSON.stringify(theme)};`,
    `export const formNames = ${JSON.stringify(names)};`,
    `export const entry = ${JSON.stringify(entry)};`,
    `export const forms = {\n${loaders}\n};`,
  ].join("\n");
}

function foxtsFormsPlugin() {
  return {
    name: "foxts-forms",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) return buildVirtualModule();
      return null;
    },
    configureServer(server) {
      // 0) index.html vive em host/ (fora da raiz `preview/`): reescreve "/" e
      //    "/index.html" -> "/host/index.html" ANTES do transform de HTML do Vite.
      server.middlewares.use((req, res, next) => {
        // casa o pathname ignorando a query (?form=X) — a query fica na URL do browser
        // (location.search), não precisa ser propagada ao arquivo servido.
        const path = (req.url || "").split("?")[0];
        if (path === "/" || path === "/index.html") req.url = "/host/index.html";
        next();
      });

      // 1) servir os ícones do projeto em /icons/<arquivo>
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith("/icons/")) return next();
        const rel = decodeURIComponent(req.url.slice("/icons/".length).split("?")[0]);
        // bloqueia path traversal
        const filePath = resolve(ICONS_DIR, rel);
        if (!filePath.startsWith(resolve(ICONS_DIR))) {
          res.statusCode = 403;
          return res.end("forbidden");
        }
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.statusCode = 404;
            return res.end("not found");
          }
          const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
          const type =
            ext === ".png" ? "image/png" :
            ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
            ext === ".svg" ? "image/svg+xml" :
            ext === ".gif" ? "image/gif" :
            ext === ".webp" ? "image/webp" : "application/octet-stream";
          res.setHeader("Content-Type", type);
          res.setHeader("Cache-Control", "no-cache");
          res.end(data);
        });
      });

      // 2) HMR: criar/remover form ou editar o tema -> invalida o virtual + full reload
      const invalidateAndReload = () => {
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      };
      const watched = [FORMS_DIR, THEME_FILE].filter((p) => p && fs.existsSync(p));
      for (const p of watched) server.watcher.add(p);
      const onFsEvent = (file) => {
        const f = String(file).replace(/\\/g, "/");
        if (f.endsWith(".form.tsx") || f === THEME_FILE.replace(/\\/g, "/")) {
          invalidateAndReload();
        }
      };
      server.watcher.on("add", onFsEvent);
      server.watcher.on("unlink", onFsEvent);
      server.watcher.on("change", (file) => {
        // mudança no tema também precisa rebuildar o virtual (forms têm HMR próprio)
        if (String(file).replace(/\\/g, "/") === THEME_FILE.replace(/\\/g, "/")) invalidateAndReload();
      });
    },
  };
}

export default defineConfig({
  root: PREVIEW_DIR,
  // NÃO usamos @vitejs/plugin-react: ele assume o runtime automático do React
  // (jsx: "react-jsx") e conflita com nosso jsxFactory "h". HMR vem do builtin
  // do Vite + re-render manual no host (host/main.tsx).
  plugins: [foxtsFormsPlugin()],
  resolve: {
    alias: {
      "@vfp/core": RUNTIME,
    },
  },
  esbuild: {
    // jsx: "transform" => runtime CLÁSSICO via fábrica `h` (Vite 8 usa OXC; sem isto o
    // switch de conversão esbuild->oxc não aplica pragma e o tsconfig `jsx:preserve`
    // do projeto/repo vence, deixando JSX cru -> falha no import-analysis).
    jsx: "transform",
    jsxFactory: "h",
    jsxFragment: "Fragment",
    jsxInject: JSX_INJECT,
    // tsconfigRaw sobrepõe o `jsx: "preserve"` herdado do tsconfig.json (necessário só
    // p/ o transpilador VFP). experimentalDecorators p/ os @Form/@Component nos forms.
    tsconfigRaw: {
      compilerOptions: {
        jsx: "react",
        jsxFactory: "h",
        jsxFragmentFactory: "Fragment",
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
  server: {
    port: PORT,
    fs: {
      // forms/runtime vivem fora do `root` (preview/) -> liberar projeto + repo
      allow: [PREVIEW_DIR, PROJECT, REPO_ROOT],
    },
  },
});
