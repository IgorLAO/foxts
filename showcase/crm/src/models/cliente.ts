// models/cliente.ts — schema de validacao (Frente F). Vira PROCEDURE ValidarCliente
// no PRG: devolve "" se valido ou a 1a mensagem de erro. Reusado pela validacao do
// form (@Form({ validate: Cliente })) e chamavel da logica.
import { schema, str, num } from "@vfp/core";

export const Cliente = schema({
  nome: str().required().min(3).max(40),
  uf: str().len(2),
  email: str().email(),
  limite: num().min(0).max(99999),
});
