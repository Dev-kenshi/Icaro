import { index, pgTable, text } from "drizzle-orm/pg-core";

export const icaroCalculos = pgTable(
  "icaro_calculos",
  {
    id: text("id").primaryKey(),
    familia: text("familia").notNull(),
    titulo: text("titulo").notNull(),
    pergunta: text("pergunta").notNull(),
    resposta: text("resposta").notNull(),
    numeros: text("numeros").array().notNull(),
    chave: text("chave").notNull(),
  },
  (table) => [
    index("icaro_calculos_familia_idx").on(table.familia),
    index("icaro_calculos_numeros_gin_idx").using("gin", table.numeros),
  ],
);

export type IcaroCalculo = typeof icaroCalculos.$inferSelect;
