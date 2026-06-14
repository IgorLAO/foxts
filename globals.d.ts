// globals.d.ts — ambientes globais minimos que o foxts reconhece e mapeia para
// comandos VFP (ex.: console.log -> ?). Incluido em todo programa pelo loadProgram;
// nunca e emitido (o compile so percorre o arquivo de entrada).

declare const console: {
  log(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
};

// JSX type-safe: o foxts lê a árvore JSX estruturalmente (não há React em runtime),
// mas a tipagem serve ao EDITOR/tsc. As tags reais (Column/TextBox/Grid/...) são
// IMPORTADAS e CAPITALIZADAS, então são checadas pelo VALOR importado (DualTag/FC
// tipados em decorators.ts), NÃO por este mapa. `IntrinsicElements` rege só tags
// minúsculas — que o framework não usa; deixá-lo vazio faz qualquer `<div>`/`<foo>`
// (typo de tag) virar erro, em vez de passar como `any`.
declare namespace JSX {
  interface Element {}
  interface ElementClass {}
  // a prop que carrega os filhos de um componente (habilita `children` nos Props).
  interface ElementChildrenAttribute { children: {}; }
  interface IntrinsicElements {}
}
