export const ICARO_EMOTIONS = ["entusiasmo", "sério", "curioso", "alerta", "sorriso"] as const;
export type IcaroEmotion = (typeof ICARO_EMOTIONS)[number];

const TAG = /\[(entusiasmo|s[eé]rio|curioso|alerta|sorriso)\]/gi;
const TAGS = ["[entusiasmo]", "[serio]", "[sério]", "[curioso]", "[alerta]", "[sorriso]"];

function canonicalEmotion(value: string): IcaroEmotion {
  return value.toLocaleLowerCase("pt-BR") === "serio" ? "sério" : value.toLocaleLowerCase("pt-BR") as IcaroEmotion;
}

export function stripEmotionTags(text: string): string {
  return text
    .replace(TAG, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?…])/g, "$1");
}

export function createEmotionTagStream(emitToken: (text: string) => void, emitEmotion: (emotion: IcaroEmotion) => void) {
  let pending = "";

  const drain = (final = false) => {
    while (pending) {
      const match = TAG.exec(pending);
      TAG.lastIndex = 0;
      if (match && match.index !== undefined) {
        if (match.index) emitToken(pending.slice(0, match.index));
        emitEmotion(canonicalEmotion(match[1]));
        pending = pending.slice(match.index + match[0].length);
        continue;
      }

      if (!final) {
        const opening = pending.lastIndexOf("[");
        if (opening >= 0) {
          const suffix = pending.slice(opening).toLocaleLowerCase("pt-BR");
          if (TAGS.some((tag) => tag.startsWith(suffix))) {
            if (opening) emitToken(pending.slice(0, opening));
            pending = pending.slice(opening);
            return;
          }
        }
      }

      emitToken(pending);
      pending = "";
    }
  };

  return {
    feed(text: string) {
      pending += text;
      drain();
    },
    flush() {
      drain(true);
    },
  };
}
