// guard_okscalar.ts — caso POSITIVO da guarda de variável de 1 letra: contadores
// e escalares de 1 letra (i, n) NÃO são rejeitados — só receptores de OBJETO
// (recv.prop com recv não-primitivo) colidem com as work areas a-j do VFP.
// Aqui `i` é numérico e `s` é string: `s.length` é primitivo e passa direto.
export function soma(n: number): number {
  let total: number = 0;
  for (let i: number = 0; i < n; i = i + 1) {
    total = total + i;
  }
  return total;
}

export function tam(s: string): number {
  return s.length; // s é string (primitivo) -> LEN(s); NÃO é objeto, não rejeita
}
