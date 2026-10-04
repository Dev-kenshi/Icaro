/**
 * Registro de avatares do palco. O usuário pode adicionar novos retratos em
 * `public/avatars/` e declará-los aqui; a escolha fica salva neste dispositivo.
 */

export type AvatarKind = 'engine' | 'portrait';

export interface AvatarDefinition {
  id: string;
  label: string;
  description: string;
  /** 'engine' = rosto clássico com sincronia de boca; 'portrait' = retrato holográfico realista. */
  kind: AvatarKind;
  /** Caminho sob `public/` para avatares do tipo 'portrait'. */
  image?: string;
}

export const AVATARS: AvatarDefinition[] = [
  {
    id: 'feirense',
    label: 'Ícaro Feirense',
    description: 'Holograma realista inspirado em Feira de Santana',
    kind: 'portrait',
    image: 'avatars/feirense-hd.png',
  },
  {
    id: 'classico',
    label: 'Ícaro clássico',
    description: 'Rosto original com sincronia de boca fonema a fonema',
    kind: 'engine',
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
