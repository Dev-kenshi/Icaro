export const PROMO_PHRASE_OPTIONS = [
  { id: 'eu-vou', label: 'Eu vou!' },
  { id: 'estarei-la', label: 'Estarei lá!' },
  { id: 'partiu-itcont', label: 'Partiu ITCONT!' },
  { id: 'presenca-confirmada', label: 'Presença confirmada!' },
  { id: 'vaga-garantida', label: 'Já garanti minha vaga!' },
  { id: 'te-vejo-la', label: 'Te vejo lá!' },
  { id: 'bora-aprender-ia', label: 'Bora aprender IA!' },
  { id: 'contador-futuro', label: 'Contador do futuro!' },
  { id: 'nao-vou-perder', label: 'Eu não vou perder!' },
] as const;

export type PromoPhraseId = (typeof PROMO_PHRASE_OPTIONS)[number]['id'];
export type PromoPhraseChoiceId = PromoPhraseId | 'custom';

const PROFANITY = new Set([
  'arrombado',
  'bosta',
  'buceta',
  'cacete',
  'caralho',
  'cu',
  'desgraca',
  'foda',
  'foder',
  'fodido',
  'fuck',
  'merda',
  'piranha',
  'porra',
  'pqp',
  'puta',
  'puto',
  'shit',
]);

const UNSUPPORTED_EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0E\uFE0F\u200D\u20E3\u{1F1E6}-\u{1F1FF}]/gu;
const DASHES = /[-\u2010-\u2015\u2212\u2E3A\u2E3B\uFE58\uFE63\uFF0D]/gu;

export function sanitizeCustomPromoPhrase(value: string): string {
  const withoutUnsupportedCharacters = value
    .replace(UNSUPPORTED_EMOJI, '')
    .replace(DASHES, ' ')
    .replace(/\p{L}+/gu, (word) => {
      const normalized = word.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
      return PROFANITY.has(normalized) ? '' : word;
    })
    .replace(/\s+([,.;!?])/gu, '$1')
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/^[ \t]+/u, '');

  return Array.from(withoutUnsupportedCharacters).slice(0, 22).join('');
}
