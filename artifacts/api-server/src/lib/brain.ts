import IcaroBrain from "./cerebro/icaro-brain.cjs";
import bank from "./cerebro/banco-respostas.json";

const MAX_SESSIONS = 200;
const sessions = new Map<string, ReturnType<typeof IcaroBrain.create>>();

/** One brain instance per session (keeps "e depois?" continuity). */
export function brainFor(key: string) {
  let b = sessions.get(key);
  if (!b) {
    if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value as string);
    b = IcaroBrain.create(bank);
    sessions.set(key, b);
  }
  return b;
}

import IcaroConhecimento from "./conhecimento/icaro-conhecimento.cjs";
import base from "./conhecimento/base.json";
export const knowledge = IcaroConhecimento.create(base);

type Source = "banco" | "base" | "ia";
const stats = { banco: 0, base: 0, ia: 0, ms: 0, total: 0 };
export function recordAsk(fonte: Source, ms: number) {
  stats[fonte]++; stats.total++; stats.ms += ms;
}
export function askStats() {
  const pct = (n: number) => (stats.total ? Math.round((n / stats.total) * 1000) / 10 : 0);
  return {
    total: stats.total,
    banco: { n: stats.banco, pct: pct(stats.banco) },
    base: { n: stats.base, pct: pct(stats.base) },
    ia: { n: stats.ia, pct: pct(stats.ia) },
    msMedio: stats.total ? Math.round(stats.ms / stats.total) : 0,
  };
}
