// cursor.ts — criar e percorrer um cursor inteiramente em TypeScript.
// O schema do cursor vem da interface `Dia` (os tipos viram C(13)/L/D no DBF).

import { createCursor, Char, Logical, DateF, Int, dowOf, addDays } from "../fox";

interface Dia {
  dia: DateF;       // -> dia D
  semana: Char<13>; // -> semana C(13)
  util: Logical;    // -> util L
}

function nomeDia(tnDow: Int): Char<13> {
  if (tnDow === 1) return "Domingo";
  if (tnDow === 7) return "Sabado";
  return "Dia de semana";
}

// monta um cursor com uma linha por dia do intervalo e devolve o total de linhas
export function totalLinhas(ini: DateF, fim: DateF): number {
  const cur = createCursor<Dia>("cdias");
  let d: DateF = ini;
  while (d <= fim) {
    let dow: Int = dowOf(d);
    cur.append({ dia: d, semana: nomeDia(dow), util: dow !== 1 && dow !== 7 });
    d = addDays(d, 1);
  }
  let n: number = cur.count();
  cur.use(false);
  return n;
}

// percorre o cursor com goTop/eof/skip e conta quantos dias sao uteis
export function contarUteis(ini: DateF, fim: DateF): number {
  const cur = createCursor<Dia>("cuteis");
  let d: DateF = ini;
  while (d <= fim) {
    let dow: Int = dowOf(d);
    cur.append({ dia: d, semana: nomeDia(dow), util: dow !== 1 && dow !== 7 });
    d = addDays(d, 1);
  }
  let n: number = 0;
  cur.goTop();
  while (!cur.eof()) {
    if (cur.field("util")) {
      n = n + 1;
    }
    cur.skip();
  }
  cur.use(false);
  return n;
}
