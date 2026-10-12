import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Copy, Download, Share2 } from 'lucide-react';
import { ITCONT } from '../dados';
import { dataExtenso, whatsappUrl } from '../logica';

export default function Inscricao() {
  const [copied, setCopied] = useState('');
  const [name, setName] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const siteUrl = typeof window !== 'undefined' ? window.location.href : ITCONT.fonteUrl;
  const firstName = name.trim().split(/\s+/)[0]?.slice(0, 24) ?? '';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const root = document.querySelector('.itc');
    const styles = root ? getComputedStyle(root) : getComputedStyle(document.documentElement);
    const color = (token: string) => styles.getPropertyValue(token).trim() || 'transparent';
    canvas.width = 900;
    canvas.height = 520;
    const gradient = context.createLinearGradient(0, 0, 900, 520);
    gradient.addColorStop(0, color('--itc-marinho'));
    gradient.addColorStop(1, color('--itc-abismo'));
    context.fillStyle = gradient;
    context.fillRect(0, 0, 900, 520);
    context.strokeStyle = color('--itc-eletrico');
    context.lineWidth = 3;
    context.strokeRect(20, 20, 860, 480);
    context.fillStyle = color('--itc-neon');
    context.font = '700 26px sans-serif';
    context.fillText(ITCONT.sigla.split('').join(' '), 58, 78);
    context.fillStyle = color('--itc-branco');
    context.font = '900 116px sans-serif';
    context.fillText('I', 58, 245);
    context.font = '700 50px sans-serif';
    context.fillText(firstName || 'Seu nome', 185, 214);
    context.font = '500 24px sans-serif';
    context.fillText(ITCONT.titulo, 185, 260, 620);
    context.fillStyle = color('--itc-gelo');
    context.font = '500 22px sans-serif';
    context.fillText(`${dataExtenso(ITCONT.inicio)} — ${dataExtenso(ITCONT.fim)}`, 58, 390);
    context.fillText(`${ITCONT.local.nome} · ${ITCONT.local.cidade}`, 58, 434, 780);
    context.font = '700 15px sans-serif';
    context.fillText('DIVULGAÇÃO · NÃO SUBSTITUI A INSCRIÇÃO OFICIAL', 58, 474);
  }, [firstName]);

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: `${ITCONT.sigla} · ${ITCONT.titulo}`, text: ITCONT.resumo, url: siteUrl }); }
      catch { setCopied('Compartilhamento cancelado.'); }
      return;
    }
    window.open(whatsappUrl(siteUrl), '_blank', 'noopener,noreferrer');
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(siteUrl);
      setCopied('Link copiado.');
    } catch {
      setCopied(`Copie este link: ${siteUrl}`);
    }
  };
  const downloadCard = () => {
    if (!firstName || !canvasRef.current) return;
    const anchor = document.createElement('a');
    anchor.download = 'cartao-divulgacao-itcont.png';
    anchor.href = canvasRef.current.toDataURL('image/png');
    anchor.click();
  };
  const submitCard = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    downloadCard();
  };
  return (
    <section className="itc-section" id="inscricao" aria-labelledby="itc-register-title">
      <div className="itc-shell">
        <header className="itc-section-head">
          <h2 id="itc-register-title"><span>Inscrição gratuita</span>Faça parte dessa imersão</h2>
          <p>Inscrições abertas até {dataExtenso(ITCONT.inscricoesAte)}.</p>
        </header>
        <div className="itc-register-grid">
          <div className="itc-register-main itc-card">
            <p>Escolha a categoria adequada na página oficial de inscrição:</p>
            <div className="itc-categories">
              {ITCONT.categorias.map((category) => <span className="itc-category" key={category.nome} data-testid={`category-${category.nome.toLowerCase().replaceAll(' ', '-')}`}>{category.nome} · Gratuita</span>)}
            </div>
            <a className="itc-primary" href={ITCONT.inscricaoUrl} target="_blank" rel="noopener noreferrer" data-testid="link-register-official">
              Garantir minha vaga <span aria-hidden="true">↗</span>
            </a>
            <div className="itc-share-row">
              <button type="button" className="itc-secondary" onClick={share} data-testid="button-share-event"><Share2 size={16} aria-hidden="true" /> Compartilhar</button>
              <button type="button" className="itc-secondary" onClick={copy} data-testid="button-copy-event-link"><Copy size={16} aria-hidden="true" /> Copiar link</button>
            </div>
            <p className="itc-copy-note" role="status" aria-live="polite" data-testid="status-copy-link">{copied && <><Check size={14} aria-hidden="true" /> {copied}</>}</p>
          </div>
          <aside className="itc-promo itc-card">
            <span className="itc-eyebrow">Compartilhe com sua rede</span>
            <h3>Gere seu cartão de divulgação</h3>
            <form onSubmit={submitCard}>
              <label className="sr-only" htmlFor="itc-name">Seu primeiro nome</label>
              <input id="itc-name" value={name} onChange={(event) => setName(event.target.value.slice(0, 24))} maxLength={24} placeholder="Seu primeiro nome" autoComplete="given-name" data-testid="input-promo-name" />
              <button type="button" className="itc-primary" onClick={downloadCard} disabled={!firstName} data-testid="button-download-promo"><Download size={16} aria-hidden="true" /> Baixar PNG</button>
            </form>
            <canvas ref={canvasRef} role="img" aria-label={`Cartão de divulgação do ${ITCONT.sigla}${firstName ? ` com o nome ${firstName}` : ''}`} data-testid="canvas-promo-card" />
            <p>Cartão de divulgação: não substitui a inscrição oficial. O nome permanece apenas neste dispositivo; nada é salvo nem enviado.</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
