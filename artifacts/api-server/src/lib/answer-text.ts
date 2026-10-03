const DASHES = /[—–―]/g;

export function normalizeAnswerText(answer: string): string {
  return answer
    .split(/\r\n?|\n/)
    .map((line) => line
      .replace(/\[(?:entusiasmo|s[eé]rio|curioso|alerta|sorriso)\]/gi, "")
      .replace(/^\s*[—–―]\s*/, "")
      .replace(/(\d)[ \t]*[—–―][ \t]*(?=[+-]?\d)/g, "$1 a ")
      .replace(DASHES, ", ")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/ +([,.;:!?])/g, "$1")
      .replace(/, +([,.;:!?])/g, "$1")
      .trim())
    .join("\n")
    .trim();
}