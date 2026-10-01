export type KResult = {
  modo: "base" | "contexto" | "nada";
  texto: string;
  id?: string;
  titulo?: string;
  trechos: Array<{ id: string; titulo: string }>;
  confianca: number;
  contexto?: string;
};
declare const IcaroConhecimento: { create(base: unknown, opts?: Record<string, unknown>): { responder(q: string): KResult; buscar(q: string, k?: number): unknown[] } };
export default IcaroConhecimento;
