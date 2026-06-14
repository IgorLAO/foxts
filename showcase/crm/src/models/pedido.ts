// models/pedido.ts — schema do pedido. num().int() forca inteiro; .refine adiciona
// uma regra custom (predicado estilo Zod, TRUE = valido) transpilada para FoxPro.
import { schema, str, num } from "@vfp/core";

export const Pedido = schema({
  cliente: str().required().min(3),
  total: num().min(0),
  itens: num().int().min(1).refine((v) => v <= 50, "maximo 50 itens por pedido"),
});
