// preview/shot.mjs — captura headless das telas do React Preview Runtime (auto-verificação
// do loop visual). Sobe nada: assume o vite já no ar em FOXTS_PORT. Para cada form,
// navega via querystring ?form=<Nome>, espera o stage e tira PNG; coleta erros de
// console/página. Uso: node preview/shot.mjs <port> <Nome1> <Nome2> ...
import puppeteer from "puppeteer-core";
import fs from "fs";

// caminho do Chrome/Edge: env FOXTS_CHROME sobrepõe; default = instalação padrão do Chrome.
const CHROME = process.env.FOXTS_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = process.argv[2] || "5200";
const forms = process.argv.slice(3);
const outDir = "preview/dist";
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const errors = {};
for (const form of forms) {
  const page = await browser.newPage();
  await page.setViewport({ width: 760, height: 620, deviceScaleFactor: 2 });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  await page.goto(`http://localhost:${port}/?form=${form}`, { waitUntil: "networkidle0", timeout: 20000 });
  await new Promise((r) => setTimeout(r, 600)); // deixa o form montar/HMR assentar
  await page.screenshot({ path: `${outDir}/${form}.png` });
  errors[form] = errs;
  await page.close();
}
await browser.close();
let bad = 0;
for (const [f, errs] of Object.entries(errors)) {
  if (errs.length) { bad++; console.log(`\n[${f}] ${errs.length} erro(s):`); errs.slice(0, 6).forEach((e) => console.log("  - " + e)); }
  else console.log(`[${f}] OK (sem erros de console/página)`);
}
console.log(`\nshots -> ${outDir}/  (${forms.length} telas, ${bad} com erros)`);
process.exit(0);
