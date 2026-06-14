// guard_badvar.ts — Frente D / dívida técnica: variável de 1 letra a-j que segura
// um OBJETO e é usada como recv.prop colide com as letras de WORK AREA do VFP
// (c.campo é lido como ALIAS(C).campo -> "Variable not found"). O transpilador
// REJEITA (CompileError com linha/coluna) sugerindo nome >=2 letras (loRow).
// Este arquivo NÃO compila por design — é o caso negativo de verifyguard.js.
import { from } from "../decorators";
import { Char } from "../fox";

interface Cli { nome: Char<10>; uf: Char<2>; }

export function primeiro(): Char<10> {
  const c = from("cli").first(); // c segura um objeto-linha
  return c.nome; // <- REJEITADO: c.nome vira ALIAS(C).nome no VFP
}
