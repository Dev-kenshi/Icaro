export type BrainPart = { tipo: "gravado"; chave: string; texto: string } | { tipo: "lacuna"; prompt: string; max_tokens: number };
export type BrainResult = {
  mode: "local" | "puzzle" | "hint" | "llm";
  text?: string;
  parts?: BrainPart[];
  context?: string;
};
declare const IcaroBrain: {
  create(bank: unknown, opts?: Record<string, unknown>): { answer(q: string): BrainResult; reset(): void };
};
export default IcaroBrain;
