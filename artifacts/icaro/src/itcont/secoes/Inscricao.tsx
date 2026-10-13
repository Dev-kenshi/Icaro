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
    const paper = context.createLinearGradient(0, 0, width * .82, height);
    paper.addColorStop(0, 'rgb(255 255 255)');
    paper.addColorStop(.56, 'rgb(248 250 253)');
    paper.addColorStop(1, 'rgb(238 243 249)');
    context.fillStyle = paper;
    context.fillRect(0, 0, width, height);
    const paperGlow = context.createRadialGradient(width * .5, height * .48, 80, width * .5, height * .48, height * .78);
    paperGlow.addColorStop(0, 'rgba(255, 255, 255, .98)');
    paperGlow.addColorStop(1, 'rgba(219, 229, 241, .28)');
    context.fillStyle = paperGlow;
    context.fillRect(0, 0, width, height);

    const blueMetal = context.createLinearGradient(0, 0, width, height);
    blueMetal.addColorStop(0, 'rgb(8 45 116)');
    blueMetal.addColorStop(.24, 'rgb(25 121 230)');
    blueMetal.addColorStop(.48, 'rgb(220 241 255)');
    blueMetal.addColorStop(.68, 'rgb(17 82 180)');
    blueMetal.addColorStop(1, 'rgb(5 39 105)');
    context.strokeStyle = blueMetal;
    context.lineWidth = 6;
    context.strokeRect(14, 14, width - 28, height - 28);
    context.strokeStyle = 'rgb(25 85 164)';
    context.lineWidth = 2;
    context.strokeRect(27, 27, width - 54, height - 54);
    context.strokeStyle = 'rgba(255, 255, 255, .94)';
    context.lineWidth = 2;
    context.strokeRect(35, 35, width - 70, height - 70);

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = 'rgba(22, 96, 193, .14)';
    context.lineWidth = 34;
    context.beginPath();
    context.moveTo(28, 236);
    context.bezierCurveTo(154, 178, 118, 79, 347, 29);
    context.stroke();
    context.strokeStyle = 'rgba(177, 195, 216, .55)';
    context.lineWidth = 12;
    context.beginPath();
    context.moveTo(24, 278);
    context.bezierCurveTo(160, 205, 150, 111, 366, 31);
    context.stroke();
    context.strokeStyle = blueMetal;
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(28, 226);
    context.bezierCurveTo(142, 166, 120, 76, 330, 28);
    context.stroke();

    context.strokeStyle = 'rgba(22, 96, 193, .14)';
    context.lineWidth = 34;
    context.beginPath();
    context.moveTo(width - 28, height - 238);
    context.bezierCurveTo(width - 154, height - 180, width - 118, height - 80, width - 347, height - 29);
    context.stroke();
    context.strokeStyle = 'rgba(177, 195, 216, .62)';
    context.lineWidth = 12;
    context.beginPath();
    context.moveTo(width - 24, height - 280);
    context.bezierCurveTo(width - 160, height - 205, width - 150, height - 111, width - 366, height - 31);
    context.stroke();
    context.strokeStyle = blueMetal;
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(width - 28, height - 228);
    context.bezierCurveTo(width - 142, height - 168, width - 120, height - 76, width - 330, height - 28);
    context.stroke();
    context.restore();

    context.save();
    context.globalAlpha = .15;
    context.strokeStyle = 'rgb(135 158 185)';
    context.lineWidth = 1;
    for (let x = 48; x < 390; x += 18) {
      context.beginPath();
      context.moveTo(x, 36);
      context.lineTo(x - 185, 262);
      context.stroke();
    }
    context.restore();

    let logoHeight = 108;
    if (logoRef.current && logoState === 'loaded') {
      const logo = logoRef.current;
      const logoWidth = (width - 172) * .7;
      logoHeight = logoWidth * logo.naturalHeight / logo.naturalWidth;
      context.drawImage(logo, (width - logoWidth) / 2, top, logoWidth, logoHeight);
    } else {
      context.textAlign = 'center';
      context.fillStyle = 'rgb(13 65 143)';
      context.font = '900 46px Arial, sans-serif';
      context.fillText('I IMERSÃO TECNOLÓGICA CONTÁBIL', width / 2, top + 54, width - 120);
      context.font = '800 25px Arial, sans-serif';
      context.fillText('I T C O N T', width / 2, top + 91);
      context.textAlign = 'left';
    }

    const cx = width / 2;
    const radius = story ? 205 : 174;
    const cy = top + logoHeight + 48 + radius;
    context.save();
    context.shadowColor = 'rgba(11, 52, 112, .24)';
    context.shadowBlur = 25;
    context.shadowOffsetY = 12;
    context.fillStyle = 'white';
    context.beginPath();
    context.arc(cx, cy, radius + 31, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.strokeStyle = blueMetal;
    context.lineWidth = 12;
    context.beginPath();
    context.arc(cx, cy, radius + 25, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = 'rgb(177 192 210)';
    context.lineWidth = 5;
    context.beginPath();
    context.arc(cx, cy, radius + 13, 0, Math.PI * 2);
    context.stroke();
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
      portrait.addColorStop(0, 'rgb(240 245 250)');
      portrait.addColorStop(1, 'rgb(184 199 216)');
      context.fillStyle = portrait;
      context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      context.fillStyle = 'rgb(39 65 99)';
      context.beginPath(); context.arc(cx, cy - 46, 60, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.ellipse(cx, cy + 112, 116, 98, 0, Math.PI, 0); context.fill();
      context.textAlign = 'center';
      context.font = '700 22px Arial, sans-serif';
      context.fillStyle = 'white';
      context.fillText('SUA FOTO', cx, cy + radius - 18);
      context.textAlign = 'left';
    }
    context.restore();
    context.strokeStyle = 'white';
    context.lineWidth = 5;
    context.beginPath();
    context.arc(cx, cy, radius + 3, 0, Math.PI * 2);
    context.stroke();

    const nameY = Math.max(story ? 1040 : 620, cy + radius + 80);
    context.textAlign = 'center';
    context.save();
    context.shadowColor = 'rgba(12, 53, 117, .25)';
    context.shadowBlur = 10;
    context.shadowOffsetY = 5;
    const nameGradient = context.createLinearGradient(cx - 340, nameY - 70, cx + 340, nameY + 4);
    nameGradient.addColorStop(0, 'rgb(13 75 167)');
    nameGradient.addColorStop(.42, 'rgb(37 143 246)');
    nameGradient.addColorStop(.7, 'rgb(11 78 169)');
    nameGradient.addColorStop(1, 'rgb(4 47 117)');
    context.fillStyle = nameGradient;
    context.font = '900 78px Arial, sans-serif';
    context.fillText(cardName ? cardName.toLocaleUpperCase('pt-BR') : 'SEU NOME', cx, nameY, 900);
    context.restore();

    const phraseGradient = context.createLinearGradient(cx - 155, nameY + 20, cx + 155, nameY + 78);
    phraseGradient.addColorStop(0, 'rgb(255 255 255)');
    phraseGradient.addColorStop(.5, 'rgb(222 231 241)');
    phraseGradient.addColorStop(1, 'rgb(255 255 255)');
    context.fillStyle = phraseGradient;
    context.strokeStyle = 'rgb(105 129 156)';
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(cx - 153, nameY + 15, 306, 62, 31);
    context.fill();
    context.stroke();
    context.fillStyle = 'rgb(17 73 150)';
    context.font = '800 39px Arial, sans-serif';
    context.fillText(canvasPhrase, cx, nameY + 60);

    context.fillStyle = 'rgb(13 62 137)';
    context.font = '800 38px Arial, sans-serif';
    context.fillText('IMERSÃO TECNOLÓGICA', cx, nameY + 132);
    context.save();
    context.shadowColor = 'rgba(8, 48, 112, .2)';
    context.shadowBlur = 8;
    context.shadowOffsetY = 4;
    const eventGradient = context.createLinearGradient(cx - 190, nameY + 145, cx + 190, nameY + 214);
    eventGradient.addColorStop(0, 'rgb(6 60 142)');
    eventGradient.addColorStop(.42, 'rgb(45 143 241)');
    eventGradient.addColorStop(.72, 'rgb(10 72 158)');
    eventGradient.addColorStop(1, 'rgb(5 47 116)');
    context.fillStyle = eventGradient;
    context.font = '900 72px Arial, sans-serif';
    context.fillText('Contábil', cx, nameY + 208);
    context.restore();
    context.textAlign = 'left';
    const detailsY = Math.max(story ? 1430 : 970, nameY + 208 + 48);
    context.textAlign = 'center';
    context.fillStyle = 'rgb(28 53 88)';
    context.font = '700 25px Arial, sans-serif';
    context.fillText(`${dataExtenso(ITCONT.inicio)} · ${dataExtenso(ITCONT.fim)}`, cx, detailsY, width - 140);
    context.font = '500 27px Arial, sans-serif';
    context.fillText(ITCONT.local.nome, cx, detailsY + 48, width - 140);
    context.fillText(`${ITCONT.local.cidade}/${ITCONT.local.uf}`, cx, detailsY + 88, width - 140);
    const badgeY = Math.max(story ? 1620 : 1145, detailsY + 130);
    const badgeGradient = context.createLinearGradient(cx - 180, badgeY - 40, cx + 180, badgeY + 25);
    badgeGradient.addColorStop(0, 'rgb(9 58 143)');
    badgeGradient.addColorStop(.5, 'rgb(31 119 222)');
    badgeGradient.addColorStop(1, 'rgb(5 49 122)');
    context.fillStyle = badgeGradient;
    context.strokeStyle = 'rgb(163 198 235)';
    context.lineWidth = 3;
    context.beginPath();
    context.roundRect(cx - 182, badgeY - 40, 364, 62, 31);
    context.fill();
    context.stroke();
    context.textAlign = 'center';
    context.fillStyle = 'white';
    context.font = '800 31px Arial, sans-serif';
    context.fillText('Inscrição gratuita', cx, badgeY);
    context.fillStyle = 'rgb(55 70 90)';
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
