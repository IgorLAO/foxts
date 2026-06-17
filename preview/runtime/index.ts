// preview/runtime/index.ts — a 2ª implementação de "@vfp/core" (renderizador React).
//
// O Vite faz alias "@vfp/core" -> este módulo SÓ no dev. O type-check e o build VFP
// continuam usando decorators.ts (paths do tsconfig). Cada símbolo exportado aqui
// corresponde 1:1 ao de decorators.ts, mas renderiza DOM real estilizado pelos tokens.
//
// Mapa de arquivos (conjuntos disjuntos p/ paralelizar a implementação):
//   forms-shim.ts  decorators, FoxForm, FormManager/router  (wiring — fundação)
//   layout.tsx     Column Row View Container Panel Card PageFrame Page Slot   (Agente A)
//   primitives.tsx Label TextBox EditBox Button … Shape Image OptionGroup     (Agente A)
//   kit.tsx        StatCard FormField Lookup FlatButton Toolbar Sidebar Grid… (Agente B)
//   icons.tsx      Icon + aliases (SaveIcon, …)                                (Agente B)
//   misc.ts        from/str/num/schema/menu… (no-ops; lógica é build-time)     (fundação)
export { Fragment } from "../jsx";

export {
  Form, FoxForm, Component, Injectable, Prop, Route, FormManager, router,
} from "./forms-shim";
export type { Router } from "./forms-shim";

export * from "./layout";
export * from "./primitives";
export * from "./kit";
export * from "./icons";
export * from "./misc";
