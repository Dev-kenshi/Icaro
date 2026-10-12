import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'pt-BR' | 'es-UY';
const PREFIX = 'icaro-v5-lang:';

const STRINGS = {
  'pt-BR': {
    navOverview: 'Visão geral', navAnalysis: 'Explorar dados', navAssistant: 'Copiloto',
    navFinance: 'Finanças', navAgenda: 'Agenda', navMusic: 'Música', navDemos: 'Sistemas', navAdmin: 'Administração',
    navDocumentation: 'Documentação',
    financeTitle: 'Finanças e clima', financeKicker: 'Painel ao vivo',
    agendaTitle: 'Agenda e rotinas', musicTitle: 'Spotify',
    demosTitle: 'Sistemas do professor Rômulo',
    demosKicker: 'Demonstração guiada',
    next: 'Próximo', previous: 'Voltar', pause: 'Pausa', resume: 'Continuar', close: 'Fechar o sistema',
    langButton: 'ES', langLabel: 'Ativar modo espanhol (Uruguai)',
  },
  'es-UY': {
    navOverview: 'Panorama', navAnalysis: 'Explorar datos', navAssistant: 'Copiloto',
    navFinance: 'Finanzas', navAgenda: 'Agenda', navMusic: 'Música', navDemos: 'Sistemas', navAdmin: 'Administración',
    navDocumentation: 'Documentación',
    financeTitle: 'Finanzas y clima', financeKicker: 'Panel en vivo',
    agendaTitle: 'Agenda y rutinas', musicTitle: 'Spotify',
    demosTitle: 'Sistemas del profesor Rômulo',
    demosKicker: 'Demostración guiada',
    next: 'Siguiente', previous: 'Volver', pause: 'Pausa', resume: 'Continuar', close: 'Cerrar el sistema',
    langButton: 'PT', langLabel: 'Volver al modo portugués',
  },
} as const;

export type StringKey = keyof (typeof STRINGS)['pt-BR'];

const LangContext = createContext<{ lang: Lang; toggle: () => void; t: (key: StringKey) => string }>({
  lang: 'pt-BR', toggle: () => undefined, t: (key) => STRINGS['pt-BR'][key],
});

export function readLang(username: string | undefined): Lang {
  try { return localStorage.getItem(`${PREFIX}${username ?? 'guest'}`) === 'es-UY' ? 'es-UY' : 'pt-BR'; } catch { return 'pt-BR'; }
}

export function LangProvider({ username, children }: { username?: string; children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => readLang(username));
  useEffect(() => { setLang(readLang(username)); }, [username]);
  useEffect(() => {
    try { localStorage.setItem(`${PREFIX}${username ?? 'guest'}`, lang); } catch { /* storage unavailable */ }
    document.documentElement.lang = lang;
  }, [lang, username]);
  const toggle = useCallback(() => setLang((current) => current === 'pt-BR' ? 'es-UY' : 'pt-BR'), []);
  const t = useCallback((key: StringKey) => STRINGS[lang][key], [lang]);
  return <LangContext.Provider value={{ lang, toggle, t }}>{children}</LangContext.Provider>;
}

export function useLang() { return useContext(LangContext); }
