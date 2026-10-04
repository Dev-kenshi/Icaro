import type { KnowledgeEntry } from "../knowledge-bank";
import { CONTABILIDADE } from "./contabilidade";
import { GERAL } from "./geral";
import { HISTORIA } from "./historia";
import { IA } from "./ia";
import { MATEMATICA } from "./matematica";
import { PESQUISA } from "./pesquisa";
import { UNIVERSIDADES } from "./universidades";

/** Bancos de conhecimento ampliados, por área. Contabilidade vem primeiro:
 * em empate de pontuação, vence a entrada que aparece antes. */
export const CONHECIMENTO_AMPLIADO: KnowledgeEntry[] = [
  ...CONTABILIDADE,
  ...PESQUISA,
  ...IA,
  ...MATEMATICA,
  ...UNIVERSIDADES,
  ...HISTORIA,
  ...GERAL,
];
