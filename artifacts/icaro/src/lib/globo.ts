/** Regras do planeta do palco (sem dependência do MapLibre, para poderem ser testadas). */

export type Lugar = { nome: string; regiao?: string; pais?: string; lat: number; lon: number; tipo?: 'cidade' | 'local' };

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** "Departamento de Montevidéu" para Montevidéu não acrescenta nada: só mostra a região quando é outra. */
export function subtituloLugar(l: Lugar): string {
  const regiao = l.regiao && !norm(l.regiao).includes(norm(l.nome)) ? l.regiao : '';
  return [regiao, l.pais].filter(Boolean).join(' · ');
}

/** Cidade aparece inteira; rua ou endereço chega mais perto. */
export const zoomPara = (l: Lugar) => (l.tipo === 'local' ? 15 : 11);
