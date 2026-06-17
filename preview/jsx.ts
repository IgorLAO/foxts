// preview/jsx.ts — a fábrica JSX do React Preview Runtime (o "keystone").
//
// O Vite injeta `import { h, Fragment } from "foxts/preview/jsx"` em todo .tsx
// (jsxInject) e usa `jsxFactory: "h"`. Assim TODO JSX do projeto — forms, @Components
// do usuário e os componentes do runtime — passa por aqui.
//
// Dispatch (espelha o desugar do transpilador parseJsx/<Slot/>):
//   • tag minúscula ("div")            -> React.createElement (host real)
//   • FC do runtime (Column, Card…)    -> React.createElement (componente React)
//   • CLASSE FoxTS (form / @Component)  -> instancia, injeta props+children, .render()
//
// Uma classe é "FoxTS" quando tem prototype.render e NÃO é React.Component. Forms
// (extends FoxForm) e @Components do usuário caem aqui — o React não os renderiza
// nativamente, então nós os materializamos na hora (componentes estruturais; estado
// e eventos vêm do form via FormInstanceContext, provido pelo host).
import React from "react";

export const Fragment = React.Fragment;

/** marca opcional posta pelos decorators (@Form/@Component) — reforça o discriminador. */
export const FOX_CLASS: unique symbol = Symbol.for("foxts.previewClass");

function isFoxClass(type: any): boolean {
  return (
    typeof type === "function" &&
    type.prototype &&
    typeof type.prototype.render === "function" &&
    !type.prototype.isReactComponent // React.Component tem isReactComponent no prototype
  );
}

export function h(type: any, props: any, ...children: any[]): any {
  props = props || {};
  if (isFoxClass(type) || type?.[FOX_CLASS]) {
    const inst: any = new type();
    Object.assign(inst, props); // props viram campos da instância (@Prop / campos do form)
    inst.children = children.length <= 1 ? children[0] : children; // <Slot/> lê inst.children
    return inst.render();
  }
  return React.createElement(type, props, ...children);
}
