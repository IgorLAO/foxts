// unsupported.ts — exercita a regra "rejeitar, nunca palpitar".
// Closure guardada em variavel nao mapeia para FoxPro -> deve dar erro de compilacao.
export function ruim(n: number): number {
  const dobro = (x: number): number => x * 2; // arrow guardada -> nao suportado
  return dobro(n);
}
