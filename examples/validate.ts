// validate.ts — Frente F: validação estilo Zod -> validador VFP.
//   export const Cliente = schema({ ... })  ->  PROCEDURE ValidarCliente(toObj)
// O validador devolve "" se válido, ou a 1ª mensagem de erro. Num form, o handler
// do Valid faria: IF NOT EMPTY(ValidarCliente(loObj)) ... MESSAGEBOX(...).
import { schema, str, num } from "../decorators";

export const Cliente = schema({
  nome: str().required().min(3).max(10).refine((v) => v !== "Root", "nome: reservado"),
  uf: str().len(2),
  email: str().email(),
  idade: num().min(18).max(120).refine((v) => v !== 99, "idade: 99 reservado"),
});
