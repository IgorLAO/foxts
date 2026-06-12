// globals.d.ts — ambientes globais minimos que o foxts reconhece e mapeia para
// comandos VFP (ex.: console.log -> ?). Incluido em todo programa pelo loadProgram;
// nunca e emitido (o compile so percorre o arquivo de entrada).

declare const console: {
  log(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
};

// JSX permissivo: o foxts lê a árvore JSX estruturalmente (não há React em runtime).
// Element = {} faz qualquer componente (mesmo os factories de decorator) ser aceito.
declare namespace JSX {
  interface Element {}
  interface ElementClass {}
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
