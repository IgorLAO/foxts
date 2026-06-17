// preview/runtime/forms-shim.ts — versões de NAVEGADOR de @vfp/core que não são UI:
// decorators, classe base e navegação. No build VFP estes são no-ops lidos da AST;
// aqui precisam de comportamento real para o form rodar no React.
import { FOX_CLASS } from "../jsx";

// ── navegação ────────────────────────────────────────────────────────────────
// O host registra um navegador (troca o form ativo). FormManager.open(X) recebe a
// CLASSE do form de destino. Atenção: nos forms, outros forms costumam vir de
// `declare class LoginPage {}` (erasado no runtime) — o host registra cada form em
// globalThis pelo nome, então a referência erasada resolve para a classe real e a
// identidade bate aqui. Ver preview/host/main.tsx.
type Nav = (form: any, params?: Record<string, any>) => any;
let navigator: Nav | null = null;
export function __setNavigator(fn: Nav | null) { navigator = fn; }

export const FormManager = {
  open(form: any, params?: Record<string, any>) { return navigator?.(form, params); },
  showModal(form: any, params?: Record<string, any>) { return navigator?.(form, params); },
};

export interface Router { open: Nav; showModal: Nav; }
export const router: Router = {
  open: (f, p) => FormManager.open(f, p),
  showModal: (f, p) => FormManager.showModal(f, p),
};

// ── classe base ────────────────────────────────────────────────────────────────
export class FoxForm {
  router: Router = router;
  caption = "";
  width = 400;
  height = 300;
  Release(): void { /* no-op no preview: o host controla a montagem */ }
  Refresh(): void { /* no-op */ }
  [key: string]: any;
}

// ── decorators (marcam a classe p/ a fábrica h instanciar) ───────────────────────
type Deco = (target: any, key?: any, desc?: any) => any;
const mark = (target: any) => { try { target[FOX_CLASS] = true; } catch { /* ignore */ } return target; };

export function Form(cfg?: Record<string, any>): ClassDecorator {
  return (target: any) => { target.__formConfig = cfg || {}; return mark(target); };
}
export function Component(_cfg?: Record<string, any>): ClassDecorator {
  return (target: any) => mark(target);
}
export function Injectable(_cfg?: Record<string, any>): ClassDecorator { return (t: any) => t; }
export function Prop(): Deco { return () => {}; }
export function Route(path: string): ClassDecorator {
  return (target: any) => { target.__route = path; return target; };
}
