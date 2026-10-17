export type PromptHistoryMessage = { role: "user" | "assistant"; content: string };
export type RankedPromptSnippet = { score: number; content: string };

export function estimatePromptTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function summarizeRecentHistory(history: PromptHistoryMessage[]): PromptHistoryMessage[] {
  return history.slice(-6).map((message) => {
    const content = message.content.replace(/\s+/g, " ").trim();
    if (content.length <= 420) return { role: message.role, content };
    return { role: message.role, content: `${content.slice(0, 260).trimEnd()} … ${content.slice(-130).trimStart()}` };
  });
}

export function buildBudgetedPrompt(input: {
  fixedInstructions: string;
  baseContext: string;
  snippets: RankedPromptSnippet[];
  history: PromptHistoryMessage[];
  userMessage: string;
  tokenCap: number;
}) {
  let baseContext = input.baseContext;
  let snippets = [...input.snippets]
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((snippet) => ({ ...snippet, content: snippet.content.slice(0, 900) }));
  let history = summarizeRecentHistory(input.history);
  let userMessage = input.userMessage.trim();
  const render = () => [
    input.fixedInstructions,
    baseContext,
    ...snippets.map((snippet) => snippet.content),
  ].filter(Boolean).join("\n\n");
  let systemPrompt = render();
  const estimate = () => estimatePromptTokens(
    `${systemPrompt}\n${history.map((message) => message.content).join("\n")}\n${userMessage}`,
  );
  let estimatedTokens = estimate();

  while (estimatedTokens > input.tokenCap) {
    if (snippets.length) snippets.pop();
    else if (baseContext.length > 600) baseContext = baseContext.slice(0, Math.floor(baseContext.length * 0.8));
    else if (history.some((message) => message.content.length > 80)) {
      history = history.map((message) => ({
        ...message,
        content: message.content.length > 80 ? `${message.content.slice(0, 78)} …` : message.content,
      }));
    } else if (userMessage.length > 80) {
      const availableCharacters = Math.max(80, (input.tokenCap - estimatePromptTokens(systemPrompt) - estimatePromptTokens(history.map((message) => message.content).join("\n"))) * 4);
      userMessage = `${userMessage.slice(0, Math.floor(availableCharacters * 0.7))} … ${userMessage.slice(-Math.floor(availableCharacters * 0.3))}`;
    } else {
      break;
    }
    systemPrompt = render();
    estimatedTokens = estimate();
  }

  if (estimatedTokens > input.tokenCap) {
    throw new Error(`Prompt exceeds the ${input.tokenCap}-token context budget`);
  }
  return { systemPrompt, history, userMessage, estimatedTokens, snippets };
}
