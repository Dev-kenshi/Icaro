import { ArrowUpRight, Bot, ExternalLink } from 'lucide-react';
import { ITCONT } from '../dados';

export default function Rodape() {
  return (
    <footer className="itc-footer">
      <div className="itc-shell itc-footer-grid">
        <div>
          <span className="itc-eyebrow">{ITCONT.sigla}</span>
          <p><strong>{ITCONT.realizacao} · UEFS · DCIS</strong></p>
          <p>{ITCONT.local.instituicao}</p>
        </div>
        <div>
          <p><Bot size={16} aria-hidden="true" /> Assistente oficial: ÍCARO</p>
          <a href="/icaro" data-testid="link-icaro-stage">Acessar o palco do ÍCARO <ArrowUpRight size={15} aria-hidden="true" /></a>
          <p><a href={ITCONT.fonteUrl} target="_blank" rel="noopener noreferrer" data-testid="link-official-source">Página oficial do evento <ExternalLink size={14} aria-hidden="true" /></a></p>
        </div>
        <div>
          <p>{ITCONT.creditos}</p>
          <a href="#inicio" data-testid="link-back-to-top">Voltar ao topo ↑</a>
        </div>
      </div>
    </footer>
  );
}
