// preview/runtime/misc.ts — símbolos NÃO-visuais de @vfp/core (query/validação/menu).
// São lógica de build-time (viram SQL/PROCEDURE no VFP). No preview são no-ops, só p/
// que forms que os importem carreguem sem erro. Não participam do render().
const chain: any = new Proxy(() => chain, { get: () => () => chain });
export function from(_table: string): any { return chain; }
export function str(): any { return chain; }
export function num(): any { return chain; }
export function schema(_shape: Record<string, any>): any { return null; }
export function menu(_pads: any[]): any { return null; }
export function pad(_p: string, _bars: any[]): any { return null; }
export function bar(_p: string, _a?: any): any { return null; }
export function separator(): any { return null; }
