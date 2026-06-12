// calc.ts — exemplo do subconjunto suportado pelo foxts (v1).
// Voce programa em TypeScript tipado; o `npm run build` transplanta para FoxPro.

// while + aritmetica
export function fatorial(n: number): number {
  let r: number = 1;
  let i: number = 1;
  while (i <= n) {
    r = r * i;
    i = i + 1;
  }
  return r;
}

// for + operador % (vira MOD) + if
export function somaPares(ate: number): number {
  let soma: number = 0;
  for (let i: number = 1; i <= ate; i++) {
    if (i % 2 === 0) {
      soma += i;
    }
  }
  return soma;
}

// strings: builtin .toUpperCase() (vira UPPER) + concatenacao
export function grita(texto: string): string {
  return texto.toUpperCase() + "!";
}

// boolean com && / || e comparacoes — regra de "dia util"
export function ehDiaUtil(diaDaSemana: number): boolean {
  return diaDaSemana !== 1 && diaDaSemana !== 7;
}

// type-directed: number + string concatena via TRANSFORM()
export function etiqueta(qtd: number): string {
  return "total: " + qtd;
}

// arrays -> Collection do VFP: [] vira CREATEOBJECT, .push -> .Add,
// .length -> .Count, xs[i] -> xs.Item(i+1)
export function somaQuadrados(n: number): number {
  let xs: number[] = [];
  for (let i: number = 1; i <= n; i++) {
    xs.push(i * i);
  }
  let total: number = 0;
  for (let j: number = 0; j < xs.length; j++) {
    total = total + xs[j];
  }
  return total;
}

// array literal com elementos + indexacao
export function maiorDe3(a: number, b: number, c: number): number {
  let xs: number[] = [a, b, c];
  let m: number = xs[0];
  for (let i: number = 1; i < xs.length; i++) {
    if (xs[i] > m) {
      m = xs[i];
    }
  }
  return m;
}

// switch -> DO CASE: break, cases agrupados (1/2) e default sem break
export function classifica(n: number): string {
  let r: string = "";
  switch (n) {
    case 0:
      r = "zero";
      break;
    case 1:
    case 2:
      r = "pequeno";
      break;
    default:
      r = "grande";
  }
  return r;
}
