import importedSections from "./conhecimento-v5.json";
import { normalizeKnowledgeText } from "./knowledge-bank";

export type ImportedKnowledgeSection = {
  id: string;
  source: string;
  title: string;
  text: string;
};

export type KnowledgeSearchResult = ImportedKnowledgeSection & { score: number };

const sections = importedSections as ImportedKnowledgeSection[];
const STOP_WORDS = new Set([
  "qual", "quais", "como", "sobre", "explique", "fale", "diga", "para", "com",
  "uma", "que", "dos", "das", "por", "sao", "ser", "tem", "pode", "hoje",
]);

function terms(text: string): string[] {
  return [...new Set(
    normalizeKnowledgeText(text)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => (word.length >= 3 || /^\d{4,}$/.test(word)) && !STOP_WORDS.has(word)),
  )];
}

export function searchImportedKnowledge(question: string, limit = 3): KnowledgeSearchResult[] {
  const query = terms(question);
  if (!query.length || !Number.isInteger(limit) || limit < 1) return [];

  return sections.map((section) => {
    const titleTerms = new Set(terms(section.title));
    const bodyTerms = new Set(terms(section.text));
    let score = 0;
    for (const term of query) {
      if (titleTerms.has(term)) score += 3;
      if (bodyTerms.has(term)) score += 1;
    }
    const coverage = query.filter((term) => titleTerms.has(term) || bodyTerms.has(term)).length / query.length;
    return { ...section, score: query.length ? (score / query.length) * coverage : 0 };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.min(limit, 5));
}

export function importedKnowledgeStats() {
  return {
    documents: new Set(sections.map((section) => section.source)).size,
    sections: sections.length,
    characters: sections.reduce((total, section) => total + section.text.length, 0),
  };
}
