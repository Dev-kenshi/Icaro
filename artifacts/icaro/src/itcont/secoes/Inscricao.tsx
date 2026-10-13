import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Copy, Download, ImagePlus, Share2 } from 'lucide-react';
import { ITCONT } from '../dados';
import { dataExtenso, whatsappUrl } from '../logica';
import QrEvento from './QrEvento';
import { MarcaIcone } from './MarcaIcone';

const LOGO_OFICIAL = 'https://static.even3.com/logos/ImagemdoCodex21deset.de202609_39_23.91a8f584302f4c68b0fa.png';
const PROMO_WIDTH = 1080;
const PROMO_HEIGHTS = { feed: 1350, stories: 1920 } as const;
type PromoFormat = keyof typeof PROMO_HEIGHTS;
type LogoState = 'loading' | 'loaded' | 'failed';

export default function Inscricao() {
  const [copied, setCopied] = useState('');
  const [name, setName] = useState('');
  const [format, setFormat] = useState<PromoFormat>('feed');
  const [phrase, setPhrase] = useState<'eu-vou' | 'estarei-la'>('eu-vou');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoPosition, setPhotoPosition] = useState({ x: 0, y: 0 });
  const [photoReady, setPhotoReady] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [logoState, setLogoState] = useState<LogoState>('loading');
  const [promoVisible, setPromoVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const siteUrl = typeof window !== 'undefined' ? window.location.href : ITCONT.fonteUrl;
  const cardName = name.trim().slice(0, 24);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (!('IntersectionObserver' in window)) { setPromoVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setPromoVisible(true);
      observer.disconnect();
    }, { rootMargin: '240px 0px', threshold: 0 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!promoVisible) return;
    const logo = new Image();
    logo.crossOrigin = 'anonymous';
    logo.onload = () => { logoRef.current = logo; setLogoState('loaded'); };
    logo.onerror = () => { logoRef.current = null; setLogoState('failed'); };
    logo.src = LOGO_OFICIAL;
    return () => { logo.onload = null; logo.onerror = null; };
  }, [promoVisible]);

  useEffect(() => {
    photoRef.current = null;
    setPhotoReady(false);
    if (!photoUrl) return;
    const photo = new Image();
    photo.onload = () => { photoRef.current = photo; setPhotoReady(true); setPhotoError(''); };
    photo.onerror = () => { photoRef.current = null; setPhotoReady(false); setPhotoError('Este navegador não conseguiu abrir essa imagem. Tente JPG, PNG ou WebP.'); };
    photo.src = photoUrl;
    return () => { photo.onload = null; photo.onerror = null; };
  }, [photoUrl]);

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !promoVisible) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = PROMO_WIDTH;
    const height = PROMO_HEIGHTS[format];
    const ratio = 2;
    const story = format === 'stories';
    const top = story ? 290 : 58;
    const canvasPhrase = phrase === 'eu-vou' ? 'Eu vou!' : 'Estarei lá';
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, 'rgb(0 61 153)');
    gradient.addColorStop(.52, 'rgb(0 87 184)');
    gradient.addColorStop(1, 'rgb(0 107 156)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    for (const [x, y, radius, alpha] of [[180, height * .18, 390, .20], [900, height * .54, 450, .18], [300, height * .88, 350, .14]] as const) {
      const glow = context.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `rgba(31, 231, 255, ${alpha})`);
      glow.addColorStop(1, 'rgba(31, 231, 255, 0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
    }
    context.save();
    context.globalAlpha = .10;
    context.strokeStyle = 'rgb(167 243 255)';
    context.lineWidth = 2;
    for (let x = -height; x < width + height; x += 42) {
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x + height, height); context.stroke();
    }
    context.restore();
    const edge = context.createLinearGradient(0, 0, width, height);
    edge.addColorStop(0, 'rgb(154 244 255)');
    edge.addColorStop(.48, 'rgb(230 239 255)');
    edge.addColorStop(1, 'rgb(71 223 255)');
    context.strokeStyle = edge;
    context.lineWidth = 8;
    context.strokeRect(22, 22, width - 44, height - 44);

    let logoHeight = 72;
    if (logoRef.current && logoState === 'loaded') {
      const logo = logoRef.current;
      const logoWidth = (width - 172) * .7;
      logoHeight = logoWidth * logo.naturalHeight / logo.naturalWidth;
      context.drawImage(logo, (width - logoWidth) / 2, top, logoWidth, logoHeight);
    } else {
      context.textAlign = 'center';
      context.fillStyle = 'white';
      context.font = '800 44px Arial, sans-serif';
      context.fillText('I ITCONT', width / 2, top + 62);
      context.textAlign = 'left';
    }

    const cx = width / 2;
    const radius = story ? 205 : 174;
    const cy = top + logoHeight + 48 + radius;
    context.save();
    context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.clip();
    if (photoRef.current && photoReady) {
      const photo = photoRef.current;
      const scale = Math.max(radius * 2 / photo.naturalWidth, radius * 2 / photo.naturalHeight) * photoZoom;
      const drawnWidth = photo.naturalWidth * scale;
      const drawnHeight = photo.naturalHeight * scale;
      context.drawImage(photo, cx - drawnWidth / 2 + photoPosition.x, cy - drawnHeight / 2 + photoPosition.y, drawnWidth, drawnHeight);
    } else {
      const portrait = context.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
      portrait.addColorStop(0, 'rgb(231 238 247)');
      portrait.addColorStop(1, 'rgb(132 152 179)');
      context.fillStyle = portrait;
      context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      context.fillStyle = 'rgb(33 55 80)';
      context.beginPath(); context.arc(cx, cy - 46, 60, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.ellipse(cx, cy + 112, 116, 98, 0, Math.PI, 0); context.fill();
      context.textAlign = 'center';
      context.font = '700 22px Arial, sans-serif';
      context.fillStyle = 'rgb(23 55 85)';
      context.fillText('SUA FOTO', cx, cy + radius - 18);
      context.textAlign = 'left';
    }
    context.restore();
    context.strokeStyle = edge;
    context.lineWidth = 18;
    context.beginPath(); context.arc(cx, cy, radius + 5, 0, Math.PI * 2); context.stroke();
    context.strokeStyle = 'rgb(48 231 255)';
    context.lineWidth = 3;
    context.beginPath(); context.arc(cx, cy, radius + 18, 0, Math.PI * 2); context.stroke();

    const nameY = Math.max(story ? 1040 : 620, cy + radius + 48);
    context.textAlign = 'center';
    context.fillStyle = 'white';
    context.font = '800 70px Arial, sans-serif';
    context.fillText(cardName || 'Seu nome', cx, nameY, 900);
    context.fillStyle = 'rgb(182 245 255)';
    context.font = '700 36px Arial, sans-serif';
    context.fillText(canvasPhrase, cx, nameY + 60);
    context.fillStyle = 'white';
    context.font = '700 38px Arial, sans-serif';
    context.fillText('IMERSÃO TECNOLÓGICA', cx, nameY + 132);
    context.fillStyle = 'rgb(231 237 245)';
    context.font = '800 72px Arial, sans-serif';
    context.fillText('Contábil', cx, nameY + 208);
    context.textAlign = 'left';
    const detailsY = Math.max(story ? 1430 : 970, nameY + 208 + 48);
    context.fillStyle = 'white';
    context.font = '700 30px Arial, sans-serif';
    context.fillText(`${dataExtenso(ITCONT.inicio)} · ${dataExtenso(ITCONT.fim)}`, 86, detailsY, width - 172);
    context.font = '500 27px Arial, sans-serif';
    context.fillText(`${ITCONT.local.nome}`, 86, detailsY + 52, width - 172);
    context.fillText(`${ITCONT.local.cidade}/${ITCONT.local.uf}`, 86, detailsY + 94);
    const badgeY = Math.max(story ? 1620 : 1145, detailsY + 130);
    context.textAlign = 'center';
    context.fillStyle = 'white';
    context.font = '800 31px Arial, sans-serif';
    context.fillText('Inscrição gratuita', cx, badgeY);
    context.fillStyle = 'rgb(229 250 255)';
    context.font = '500 18px Arial, sans-serif';
    const footerY = height - (story ? 180 : 65);
    context.fillText('Cartão de divulgação · não substitui a inscrição oficial', cx, footerY);
    context.textAlign = 'left';
  }, [cardName, format, phrase, photoPosition, photoReady, photoZoom, logoState, promoVisible]);

  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      setPhotoError('Escolha uma imagem JPG, PNG, WebP ou HEIC.');
      event.currentTarget.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError('A foto precisa ter até 10 MB.');
      event.currentTarget.value = '';
      return;
    }
    setPhotoError('');
    setPhotoPosition({ x: 0, y: 0 });
    setPhotoUrl(URL.createObjectURL(file));
    event.currentTarget.value = '';
  };

  const movePhoto = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const width = PROMO_WIDTH;
    const scale = width / rect.width;
    setPhotoPosition((position) => ({
      x: Math.max(-420, Math.min(420, position.x + (event.clientX - drag.x) * scale)),
      y: Math.max(-420, Math.min(420, position.y + (event.clientY - drag.y) * scale)),
    }));
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const createPromoBlob = () => new Promise<Blob | null>((resolve) => {
    const preview = canvasRef.current;
    if (!preview) return resolve(null);
    const width = PROMO_WIDTH;
    const height = PROMO_HEIGHTS[format];
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const context = output.getContext('2d');
    if (!context) return resolve(null);
    context.drawImage(preview, 0, 0, width, height);
    output.toBlob(resolve, 'image/png');
  });

  const downloadCard = async () => {
    const blob = await createPromoBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.download = `itcont-${format === 'feed' ? 'feed-4x5' : 'stories-9x16'}.png`;
    anchor.href = url;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const shareCard = async () => {
    if (!navigator.share || !navigator.canShare) return;
    const blob = await createPromoBlob();
    if (!blob) return;
    const file = new File([blob], 'cartao-itcont.png', { type: 'image/png' });
    if (!navigator.canShare({ files: [file] })) return;
    try { await navigator.share({ files: [file], title: `${ITCONT.sigla} · ${ITCONT.titulo}` }); }
    catch { setCopied('Compartilhamento cancelado.'); }
  };

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!photoReady) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const canShareCard = typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare;

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
  return (
    <section ref={sectionRef} className="itc-section" id="inscricao" aria-labelledby="itc-register-title">
      <div className="itc-shell">
        <header className="itc-section-head">
          <h2 id="itc-register-title"><span>05 · Inscrição</span>Faça parte dessa imersão</h2>
          <p>Inscrições abertas até {dataExtenso(ITCONT.inscricoesAte)}.</p>
        </header>
        <div className="itc-register-grid">
          <section className="itc-register-main itc-register-highlight itc-card" aria-labelledby="itc-register-choice">
            <span className="itc-eyebrow">Inscrição gratuita</span>
            <h3 id="itc-register-choice">Escolha sua categoria</h3>
            <p>As três opções são gratuitas. Selecione a categoria na página oficial do evento:</p>
            <div className="itc-categories" role="list" aria-label="Categorias gratuitas">
              {ITCONT.categorias.map((category) => <div className="itc-category" role="listitem" key={category.nome} data-testid={`category-${category.nome.toLowerCase().replaceAll(' ', '-')}`}>
                <span>{category.nome}</span>
                <strong>Entrada gratuita</strong>
              </div>)}
            </div>
            <a className="itc-primary itc-register-cta" href={ITCONT.inscricaoUrl} target="_blank" rel="noopener noreferrer" data-testid="link-register-official">
              Fazer inscrição oficial <span aria-hidden="true">↗</span>
            </a>
            <div className="itc-share-row">
              <button type="button" className="itc-secondary" onClick={share} data-testid="button-share-event"><MarcaIcone marca="whatsapp" /> Compartilhar</button>
              <button type="button" className="itc-secondary" onClick={copy} data-testid="button-copy-event-link"><Copy size={16} aria-hidden="true" /> Copiar link</button>
            </div>
            <p className="itc-copy-note" role="status" aria-live="polite" data-testid="status-copy-link">{copied && <><Check size={14} aria-hidden="true" /> {copied}</>}</p>
          </section>
          <div className="itc-register-side">
            <section className="itc-qr-card itc-card" aria-labelledby="itc-qr-title">
              <span className="itc-eyebrow">Acesso rápido</span>
              <h3 id="itc-qr-title">Abra o site pelo celular</h3>
              <QrEvento />
            </section>
            <aside className="itc-promo itc-card">
              <span className="itc-eyebrow">Compartilhe com sua rede</span>
              <h3>Gere seu cartão de divulgação</h3>
              <div className="itc-promo-controls">
                <label htmlFor="itc-name">Nome para o cartão (até 24 caracteres)</label>
                <input id="itc-name" value={name} onChange={(event) => setName(event.target.value.slice(0, 24))} maxLength={24} placeholder="Seu nome" autoComplete="given-name" data-testid="input-promo-name" />
                <div className="itc-promo-tabs" role="group" aria-label="Frase do cartão">
                  <button type="button" className={phrase === 'eu-vou' ? 'itc-primary' : 'itc-secondary'} aria-pressed={phrase === 'eu-vou'} onClick={() => setPhrase('eu-vou')}>Eu vou!</button>
                  <button type="button" className={phrase === 'estarei-la' ? 'itc-primary' : 'itc-secondary'} aria-pressed={phrase === 'estarei-la'} onClick={() => setPhrase('estarei-la')}>Estarei lá</button>
                </div>
                <input ref={fileInputRef} className="sr-only" type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif" onChange={choosePhoto} aria-label="Anexe sua melhor foto" data-testid="input-promo-photo" />
                <button type="button" className="itc-secondary itc-promo-photo-button" onClick={() => fileInputRef.current?.click()}><ImagePlus size={17} aria-hidden="true" /> {photoUrl ? 'Trocar foto' : 'Anexe sua melhor foto'}</button>
                {photoReady && <label className="itc-promo-zoom" htmlFor="itc-photo-zoom">Zoom da foto
                  <input id="itc-photo-zoom" type="range" min="1" max="3" step=".01" value={photoZoom} onChange={(event) => setPhotoZoom(Number(event.target.value))} />
                </label>}
                {photoError && <p className="itc-promo-error" role="alert">{photoError}</p>}
                <p className="itc-promo-privacy">A foto fica apenas neste navegador; não é enviada nem salva.</p>
                <div className="itc-promo-tabs" role="tablist" aria-label="Formato do cartão">
                  <button type="button" role="tab" aria-selected={format === 'feed'} className={format === 'feed' ? 'itc-primary' : 'itc-secondary'} onClick={() => setFormat('feed')} data-testid="promo-format-feed">Feed 4:5</button>
                  <button type="button" role="tab" aria-selected={format === 'stories'} className={format === 'stories' ? 'itc-primary' : 'itc-secondary'} onClick={() => setFormat('stories')} data-testid="promo-format-stories">Stories 9:16</button>
                </div>
                <div className="itc-promo-actions">
                  <button type="button" className="itc-primary" onClick={downloadCard} data-testid="button-download-promo"><Download size={16} aria-hidden="true" /> Baixar PNG</button>
                  {canShareCard && <button type="button" className="itc-secondary" onClick={shareCard} data-testid="button-share-promo"><Share2 size={16} aria-hidden="true" /> Compartilhar</button>}
                </div>
                <p className="itc-promo-mobile-help">Abra o Instagram e escolha a imagem baixada.</p>
              </div>
              <div className="itc-promo-preview">
                <span>Prévia ao vivo</span>
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label={`Prévia ${format === 'feed' ? 'Feed 4:5' : 'Stories 9:16'} do cartão ${cardName ? `de ${cardName}` : 'personalizado'}${photoReady ? '. Arraste para ajustar a foto.' : ''}`}
                  onPointerDown={pointerDown}
                  onPointerMove={movePhoto}
                  onPointerUp={() => { dragRef.current = null; }}
                  onPointerCancel={() => { dragRef.current = null; }}
                  data-card-format={format}
                  data-testid="canvas-promo-card"
                />
              </div>
              {logoState === 'failed' && <p className="itc-promo-error" role="status">A logo oficial não carregou; o download sairá sem a logo.</p>}
              {logoState === 'loading' && <p className="itc-promo-privacy" role="status">Carregando a logo oficial do ITCONT…</p>}
              <p>Este cartão é apenas para divulgação e não substitui a inscrição oficial.</p>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
