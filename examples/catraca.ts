// catraca.ts — LÓGICA REAL de validação de acesso da catraca (modela o Pwi_VF9_CatracaPCI),
// escrita em TS tipado e compilada p/ PRG. Prova de PROFUNDIDADE (dogfood de app real):
// regras de negócio + manipulação de cursor (lookup por chave + UPDATE keyed) ponta a
// ponta no VFP. Surfou a necessidade de update/increment de cursor (antes inexistentes).
import { createCursor, Char, Numeric } from "../fox";
import { from } from "../decorators";

interface Ingresso {
  cracha: Char<10>;
  nome: Char<30>;
  total: Numeric<3>;  // ingressos comprados
  usado: Numeric<3>;  // ja utilizados
}

// popula a base de ingressos de teste (cracha A1 = 0/2, B2 = 1/1 esgotado).
function seed(): void {
  const c = createCursor<Ingresso>("ingressos");
  c.append({ cracha: "A1", nome: "Joao", total: 2, usado: 0 });
  c.append({ cracha: "B2", nome: "Maria", total: 1, usado: 1 });
}

// validar: regra de acesso. NAO ENCONTRADO (cracha inexistente) / SEM SALDO (usado>=total)
// / LIBERADO. Usa o query builder (count) p/ lookup — sem efeito colateral.
// NOTA: o parametro NAO pode se chamar "cracha" (colide com a coluna -> WHERE cracha =
// cracha vira campo=campo, sempre verdadeiro). Por isso `crachaId`.
function statusDe(crachaId: string): string {
  const achou = from("ingressos").where("cracha", crachaId).count();
  if (achou == 0) {
    return "NAO ENCONTRADO";
  }
  const livre = from("ingressos").where("cracha", crachaId).where("usado < total").count();
  if (livre == 0) {
    return "SEM SALDO";
  }
  return "LIBERADO";
}

// casos de status (sem consumir): A1 livre -> LIBERADO; B2 esgotado -> SEM SALDO; Z9 -> NAO ENCONTRADO
export function statusA1(): string { seed(); return statusDe("A1"); }
export function statusB2(): string { seed(); return statusDe("B2"); }
export function statusZ9(): string { seed(); return statusDe("Z9"); }

// nomeDe: lookup por OBJETO-LINHA (.first()) + checagem de null (== null -> ISNULL).
// Devolve o nome do titular ou "?" se o cracha nao existir. Prova o caminho .first()+null.
export function nomeDe(crachaId: string): string {
  const loRow = from("ingressos").where("cracha", crachaId).orderBy("cracha").first();
  if (loRow == null) {
    return "?";
  }
  return loRow.nome;
}
export function nomeA1(): string { seed(); return nomeDe("A1"); }
export function nomeZ9(): string { seed(); return nomeDe("Z9"); }

// consumosA1: consome o cracha A1 (total 2) em laço; cada consumo valido faz increment
// keyed em "usado". Prova o UPDATE de cursor + a persistencia entre validacoes.
// Esperado: exatamente 2 consumos liberados (o 3o cai em SEM SALDO).
export function consumosA1(): number {
  const c = createCursor<Ingresso>("ingressos");
  c.append({ cracha: "A1", nome: "Joao", total: 2, usado: 0 });
  let ok = 0;
  let i = 0;
  while (i < 5) {
    const livre = from("ingressos").where("cracha", "A1").where("usado < total").count();
    if (livre > 0) {
      c.increment("usado", 1, "cracha", "A1");
      ok = ok + 1;
    }
    i = i + 1;
  }
  return ok; // 2
}

// resetUsado: update absoluto (usado := 0) e confirma que o cracha volta a ter saldo.
export function resetUsado(): number {
  const c = createCursor<Ingresso>("ingressos");
  c.append({ cracha: "A1", nome: "Joao", total: 2, usado: 2 });
  c.update("usado", 0, "cracha", "A1");
  const livre = from("ingressos").where("cracha", "A1").where("usado < total").count();
  return livre; // 1 (voltou a ter saldo)
}
