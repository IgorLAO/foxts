// preview/runtime/context.ts — a instância do form viva durante o preview.
//
// O host instancia o form e o provê aqui. Atributos de evento no JSX são STRINGS com o
// nome de um método do form (onClick="continuar"); os componentes do runtime resolvem
// esse nome contra a instância via useFormEvent — espelhando o `ThisForm.<m>()` do VFP.
import React from "react";

/** instância do form atualmente montado (provida pelo host). */
export const FormInstanceContext = React.createContext<any>(null);

/** resolve um nome de método ("continuar") -> handler () => inst.continuar(); senão undefined. */
export function useFormEvent(name?: string): (() => void) | undefined {
  const inst = React.useContext(FormInstanceContext);
  if (!name || !inst || typeof inst[name] !== "function") return undefined;
  return () => inst[name]();
}

/** lê uma propriedade dinâmica da instância (p/ bind/value vindos do form). */
export function useFormValue(name?: string): any {
  const inst = React.useContext(FormInstanceContext);
  return name && inst ? inst[name] : undefined;
}
