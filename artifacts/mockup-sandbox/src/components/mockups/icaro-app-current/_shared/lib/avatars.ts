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
}

export const AVATARS: AvatarDefinition[] = [
  {
    id: 'feirense',
    label: 'Ícaro Feirense',
    description: 'Aparência inspirada em Feira de Santana',
    image: 'icaro-assets/avatars/feirense-hd.png',
  },
  {
    id: 'classico',
    label: 'Ícaro clássico',
    description: 'Aparência original do Ícaro',
    image: 'icaro-assets/avatar-portrait/base.jpg',
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
