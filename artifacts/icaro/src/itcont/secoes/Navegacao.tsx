import { useEffect, useState } from 'react';
import { CalendarDays, CircleHelp, Home, MapPin, Users, UserRoundPlus } from 'lucide-react';
import { ITCONT } from '../dados';

const links = [
  { id: 'inicio', label: 'Início', Icon: Home },
  { id: 'programacao', label: 'Programação', Icon: CalendarDays },
  { id: 'convidados', label: 'Convidados', Icon: Users },
  { id: 'local', label: 'Local', Icon: MapPin },
  { id: 'inscricao', label: 'Inscrever', Icon: UserRoundPlus },
  { id: 'faq', label: 'Dúvidas', Icon: CircleHelp },
];

export default function Navegacao() {
  const [active, setActive] = useState('inicio');
  const [heroPassed, setHeroPassed] = useState(false);
  useEffect(() => {
    const targets = links.map(({ id }) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: '-25% 0px -55% 0px', threshold: [0, .15, .4] });
    targets.forEach((target) => observer.observe(target));
    const hero = document.getElementById('inicio');
    const stickyObserver = new IntersectionObserver(([entry]) => setHeroPassed(!entry.isIntersecting), { threshold: 0 });
    if (hero) stickyObserver.observe(hero);
    return () => { observer.disconnect(); stickyObserver.disconnect(); };
  }, []);
  return (
    <>
      <a className="itc-skip" href="#conteudo" data-testid="link-skip-content">Pular para o conteúdo</a>
      <div className="itc-topline" aria-hidden="true" />
      <nav className="itc-nav" aria-label="Seções do site">
        {links.map(({ id, label, Icon }) => (
          <a key={id} href={`#${id}`} aria-label={label} aria-current={active === id ? 'true' : undefined} data-testid={`nav-${id}`}>
            <Icon size={17} aria-hidden="true" /><span>{label}</span>
          </a>
        ))}
      </nav>
      <nav className="itc-bottom-nav" aria-label="Navegação principal">
        {links.filter(({ id }) => id !== 'faq').map(({ id, label, Icon }) => (
          <a key={id} href={`#${id}`} aria-current={active === id ? 'true' : undefined} data-testid={`mobile-nav-${id}`}>
            <Icon size={18} aria-hidden="true" /><span>{label}</span>
          </a>
        ))}
      </nav>
      <a className="itc-sticky-register itc-primary" data-visible={heroPassed} href={ITCONT.inscricaoUrl} target="_blank" rel="noopener noreferrer" data-testid="link-sticky-register">
        Garantir minha vaga
      </a>
    </>
  );
}
