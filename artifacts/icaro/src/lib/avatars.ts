/**
 * Registro de avatares do palco. O usuário pode adicionar novos retratos em
 * `public/avatars/` e declará-los aqui; a escolha fica salva neste dispositivo.
 */

export interface AvatarDefinition {
  id: string;
  label: string;
  description: string;
  /** Imagem alternativa do rosto. Enquadramento, efeitos e controles são compartilhados. */
  image?: string;
  /**
   * Linha da boca no retrato, em frações da imagem quadrada: centro horizontal,
   * linha entre os lábios (ou base dos dentes superiores) e largura dos lábios.
   * Medida em cada imagem; sem ela a boca do retrato não acompanha a fala.
   * `open` é a abertura máxima como fração da largura (padrão 0.22).
   */
  mouth?: { x: number; y: number; width: number; open?: number };
}

export const AVATARS: AvatarDefinition[] = [
  {
    id: 'feirense',
    label: 'Ícaro Feirense',
    description: 'Aparência inspirada em Feira de Santana',
    image: 'avatars/feirense-hd.png',
    mouth: { x: 0.503, y: 0.543, width: 0.15 },
  },
  {
    id: 'classico',
    label: 'Ícaro clássico',
    description: 'Aparência original do Ícaro',
    image: 'avatar-portrait/base.jpg',
    mouth: { x: 0.5, y: 0.684, width: 0.26, open: 0.13 },
  },
];

export const AVATAR_CHOICE_STORAGE_KEY = 'icaro.stage.avatar-choice';
export const DEFAULT_AVATAR_ID = 'feirense';

export function avatarById(id: string | null | undefined): AvatarDefinition {
  return AVATARS.find((avatar) => avatar.id === id) ?? AVATARS[0];
}

export function readAvatarChoice(): AvatarDefinition {
  try {
    return avatarById(localStorage.getItem(AVATAR_CHOICE_STORAGE_KEY));
  } catch {
    return avatarById(DEFAULT_AVATAR_ID);
  }
}

export function saveAvatarChoice(id: string): boolean {
  try {
    localStorage.setItem(AVATAR_CHOICE_STORAGE_KEY, avatarById(id).id);
    return true;
  } catch {
    return false;
  }
}
