import assert from "node:assert/strict";
import { importedKnowledgeStats, searchImportedKnowledge } from "./lib/knowledge-corpus";

let checks = 0;
function check(condition: unknown, message: string): asserts condition {
  checks += 1;
  assert.ok(condition, `Validação ${checks}: ${message}`);
}

const stats = importedKnowledgeStats();
check(stats.documents === 22, "as 22 fontes Markdown do ZIP foram importadas");
check(stats.sections >= 200, "as seções dos documentos foram divididas para busca");
check(stats.characters > 100_000, "o conteúdo integral está no corpus");
check(searchImportedKnowledge("", 3).length === 0, "pergunta vazia não retorna fonte arbitrária");
check(searchImportedKnowledge("qual como sobre", 3).length === 0, "termos genéricos não retornam fonte arbitrária");
check(searchImportedKnowledge("Lei 4320", 0).length === 0, "limite zero é rejeitado");
check(searchImportedKnowledge("Lei 4320", 1.5).length === 0, "limite fracionário é rejeitado");
check(searchImportedKnowledge("Lei 4320", 99).length <= 5, "busca respeita o limite máximo");

const documents: Array<[string, string]> = [
  ["Lei 4.320/1964 orçamento contabilidade pública receita despesa", "01-lei-4320.md"],
  ["MCASP PCASP DCASP plano de contas contabilidade pública", "02-mcasp-pcasp-dcasp.md"],
  ["Lei de Responsabilidade Fiscal LRF orçamento limites despesas", "03-lrf-orcamento-publico.md"],
  ["Lei 6.404 sociedades anônimas contabilidade societária", "04-lei-6404-societaria.md"],
  ["CPC normas contábeis vigentes pronunciamentos", "05-cpc-normas-vigentes.md"],
  ["reforma tributária IBS CBS imposto seletivo", "06-reforma-tributaria.md"],
  ["tributos regimes tributários imposto renda", "07-tributos-regimes-renda.md"],
  ["lançamentos contábeis débito crédito exemplos", "08-lancamentos-modelo.md"],
  ["sistemas contábeis tecnologia software contabilidade", "09-sistemas-contabeis-tecnologia.md"],
  ["obrigações acessórias SPED ECD ECF", "10-obrigacoes-acessorias-sped.md"],
  ["contabilidade gerencial custos análise margem", "11-gerencial-custos-analise.md"],
  ["contabilidade básica ativo passivo patrimônio", "12-contabilidade-basica.md"],
  ["Ícaro ITCONT UEFS Contador do Amanhã", "13-icaro-itcont-uefs.md"],
  ["Lei 11.638 Lei 11.941 convergência contábil", "14-leis-11638-11941-convergencia.md"],
  ["profissão contábil CFC CRC Decreto Lei 9295", "15-profissao-contabil-cfc-crc.md"],
  ["normas profissionais NBC PG PA PI PP", "16-normas-profissionais-nbc-pg-pa-pi-pp.md"],
  ["normas técnicas NBC T auditoria perícia", "17-normas-tecnicas-nbc-t.md"],
  ["todos pronunciamentos CPC contabilidade", "18-cpc-todos-os-pronunciamentos.md"],
  ["IFRS correspondência CPC normas internacionais", "19-ifrs-correspondencia-cpc.md"],
  ["princípios de contabilidade resolução CFC 750 revogada", "20-principios-contabilidade-res-cfc-750.md"],
  ["Uruguai Montevidéu visita técnica IVA IRAE NIIF", "21-uruguai-montevideu-visita-tecnica.md"],
  ["Discipulus LabEduContábil UEFS sistemas do professor", "22-discipulus-e-labeducontabil.md"],
];
for (const [question, source] of documents) {
  check(searchImportedKnowledge(question, 5).some((item) => item.source === source), `busca representativa localiza ${source}`);
}

const focused: Array<[string, string]> = [
  ["Qual é o tratamento do orçamento e da receita pública na Lei 4.320?", "01-lei-4320.md"],
  ["Como se relacionam PCASP e DCASP no MCASP?", "02-mcasp-pcasp-dcasp.md"],
  ["Quais são limites de despesa de pessoal na LRF?", "03-lrf-orcamento-publico.md"],
  ["O que muda com IBS, CBS e imposto seletivo?", "06-reforma-tributaria.md"],
  ["Como funciona ECD e ECF no SPED?", "10-obrigacoes-acessorias-sped.md"],
  ["Quais responsabilidades éticas valem para a profissão contábil?", "15-profissao-contabil-cfc-crc.md"],
  ["Que módulos o LabEduContábil e o Discipulus apresentam?", "22-discipulus-e-labeducontabil.md"],
  ["Quais normas são emitidas pelo IASB e como correspondem aos CPCs?", "19-ifrs-correspondencia-cpc.md"],
];
for (const [question, source] of focused) {
  check(searchImportedKnowledge(question, 5).some((item) => item.source === source), `consulta em linguagem natural encontra ${source}`);
}

check(searchImportedKnowledge("Lei 4.320 orçamento", 3).every((item) => item.text.trim().length > 0), "todos os resultados contêm texto");
check(searchImportedKnowledge("Lei 4.320 orçamento", 3).every((item) => item.title.trim().length > 0), "todos os resultados identificam a seção");
check(searchImportedKnowledge("Lei 4.320 orçamento", 3).every((item) => item.score > 0), "resultados têm pontuação positiva");
check(searchImportedKnowledge("Lei 4.320 orçamento", 3).every((item, i, all) => i === 0 || all[i - 1]!.score >= item.score), "resultados vêm ordenados por relevância");
check(new Set(searchImportedKnowledge("Lei 4.320 orçamento", 5).map((item) => item.id)).size === searchImportedKnowledge("Lei 4.320 orçamento", 5).length, "resultados não repetem seções");
check(searchImportedKnowledge("CPC IFRS", 3).length > 0, "consulta com dois tópicos encontra conhecimento");
check(searchImportedKnowledge("nenhuma palavra de contabilidade existente", 3).length <= 3, "busca sem correspondência não excede o limite");
check(searchImportedKnowledge("Lei 4.320", 3).length <= 3, "limite solicitado é aplicado");

assert.equal(checks, 46, "o pacote deve executar exatamente 46 validações comportamentais");
console.log(`ÍCARO v5: ${checks}/${checks} validações passaram (${stats.documents} documentos, ${stats.sections} seções).`);
