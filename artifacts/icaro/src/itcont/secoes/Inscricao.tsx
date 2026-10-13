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
  const photoSelectionRef = useRef(0);
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
    photo.onerror = () => {
      photoRef.current = null;
      setPhotoReady(false);
      setPhotoError('Não foi possível decodificar esta foto no navegador. Escolha um JPG, PNG ou WebP válido.');
    };
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
    const top = story ? 250 : 32;
    const canvasPhrase = phrase === 'eu-vou' ? 'Eu vou!' : 'Estarei lá';
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const paper = context.createLinearGradient(0, 0, width * .82, height);
    paper.addColorStop(0, 'rgb(255 255 255)');
    paper.addColorStop(.56, 'rgb(248 250 253)');
    paper.addColorStop(1, 'rgb(234 242 255)');
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
    context.lineWidth = 4;
    context.strokeRect(24, 24, width - 48, height - 48);
    context.strokeStyle = 'rgb(132 178 231)';
    context.lineWidth = 1;
    context.strokeRect(32, 32, width - 64, height - 64);

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = 'rgba(16, 94, 214, .2)';
    context.lineWidth = 86;
    context.beginPath();
    context.moveTo(10, 242);
    context.bezierCurveTo(78, 188, 84, 80, 150, 26);
    context.stroke();
    context.strokeStyle = 'rgba(183, 203, 227, .78)';
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(14, 274);
    context.bezierCurveTo(82, 208, 88, 112, 158, 28);
    context.stroke();
    context.strokeStyle = blueMetal;
    context.lineWidth = 66;
    context.beginPath();
    context.moveTo(16, 222);
    context.bezierCurveTo(74, 166, 82, 72, 144, 25);
    context.stroke();
    context.strokeStyle = 'rgba(255, 255, 255, .92)';
    context.lineWidth = 10;
    context.beginPath();
    context.moveTo(17, 204);
    context.bezierCurveTo(70, 148, 78, 66, 138, 22);
    context.stroke();

    context.strokeStyle = 'rgba(16, 94, 214, .2)';
    context.lineWidth = 86;
    context.beginPath();
    context.moveTo(width - 10, height - 242);
    context.bezierCurveTo(width - 72, height - 188, width - 82, height - 80, width - 14, height - 26);
    context.stroke();
    context.strokeStyle = 'rgba(183, 203, 227, .78)';
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(width - 14, height - 274);
    context.bezierCurveTo(width - 80, height - 208, width - 82, height - 112, width - 22, height - 28);
    context.stroke();
    context.strokeStyle = blueMetal;
    context.lineWidth = 66;
    context.beginPath();
    context.moveTo(width - 16, height - 222);
    context.bezierCurveTo(width - 76, height - 166, width - 82, height - 72, width - 26, height - 25);
    context.stroke();
    context.strokeStyle = 'rgba(255, 255, 255, .92)';
    context.lineWidth = 10;
    context.beginPath();
    context.moveTo(width - 17, height - 204);
    context.bezierCurveTo(width - 74, height - 148, width - 82, height - 66, width - 34, height - 22);
    context.stroke();
    context.restore();

    context.save();
    context.globalAlpha = .23;
    context.strokeStyle = 'rgb(128 177 229)';
    context.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      context.beginPath();
      context.moveTo(34, 82 + i * 16);
      context.bezierCurveTo(70, 60 + i * 14, 116, 40 + i * 14, 150, 28 + i * 11);
      context.moveTo(width - 34, height - 82 - i * 16);
      context.bezierCurveTo(width - 70, height - 60 - i * 14, width - 116, height - 40 - i * 14, width - 150, height - 28 - i * 11);
      context.stroke();
    }
    context.restore();

    const cx = width / 2;
    const gap = story ? 32 : 24;
    const bottomSafe = story ? 250 : 32;
    const textFont = (weight: number, size: number) => `${weight} ${size}px Archivo, Arial, sans-serif`;
    const measure = (text: string, weight: number, size: number) => {
      const font = textFont(weight, size);
      context.font = font;
      const metrics = context.measureText(text);
      const ascent = Math.max(1, metrics.actualBoundingBoxAscent);
      const descent = Math.max(1, metrics.actualBoundingBoxDescent);
      return { text, font, width: metrics.width, ascent, descent, height: ascent + descent };
    };
    const drawMeasured = (line: ReturnType<typeof measure>, y: number, color: string) => {
      context.font = line.font;
      context.fillStyle = color;
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      context.fillText(line.text, cx, y + line.ascent, width - 64);
    };
    const nameMaxWidth = story ? width * .92 : width * .51;
    const wrapName = (text: string, maxWidth: number) => {
      const words = text.split(/\s+/).filter(Boolean);
      const lines: ReturnType<typeof measure>[] = [];
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && measure(candidate, 900, 110).width > maxWidth) {
          lines.push(measure(current, 900, 110));
          current = word;
        } else current = candidate;
      }
      if (current) lines.push(measure(current, 900, 110));
      return lines.length ? lines : [measure('SEU NOME', 900, 110)];
    };
    const nameLines = wrapName(cardName ? cardName.toLocaleUpperCase('pt-BR') : 'SEU NOME', nameMaxWidth);
    const phraseLine = measure(canvasPhrase, 800, 48);
    const eventLine = measure('IMERSÃO TECNOLÓGICA', 800, 52);
    const accountingLine = measure('Contábil', 900, 100);
    const dateParts = [dataExtenso(ITCONT.inicio), dataExtenso(ITCONT.fim)];
    const combinedDate = `${dateParts[0]} · ${dateParts[1]}`;
    const dateLines = story
      ? dateParts.map((line) => measure(line, 700, 34))
      : (measure(combinedDate, 700, 34).width <= width * .94
        ? [measure(combinedDate, 700, 34)]
        : dateParts.map((line) => measure(line, 700, 34)));
    const venueLines = [
      measure(ITCONT.local.nome, 500, 32),
      measure(`${ITCONT.local.cidade}/${ITCONT.local.uf}`, 500, 32),
    ];
    const ctaLine = measure('Inscrição gratuita', 800, 42);
    const footerLine = measure('Cartão de divulgação · não substitui a inscrição oficial', 500, 24);
    const nameHeight = nameLines.reduce((sum, line) => sum + line.height, 0)
      + Math.max(0, nameLines.length - 1) * 8 + 8;
    const dateHeight = dateLines.reduce((sum, line) => sum + line.height, 0)
      + Math.max(0, dateLines.length - 1) * 8;
    const venueHeight = venueLines.reduce((sum, line) => sum + line.height, 0) + 8;
    const phraseHeight = 96;
    const ctaHeight = 92;
    const logoWidth = width * (story ? .2 : .62);
    const logoRatio = logoRef.current && logoState === 'loaded'
      ? logoRef.current.naturalHeight / logoRef.current.naturalWidth
      : .5;
    const logoHeight = logoWidth * logoRatio;
    const storyBlocksHeight = nameHeight + phraseHeight + eventLine.height + accountingLine.height
      + dateHeight + venueHeight + ctaHeight + footerLine.height;
    const storyPhotoDiameter = Math.max(0, Math.min(
      story ? 520 : 380,
      Math.floor(height - top - bottomSafe - logoHeight - gap * 9 - 52 - storyBlocksHeight),
    ));
    const feedDetailsHeight = eventLine.height + accountingLine.height + dateHeight + venueHeight
      + ctaHeight + footerLine.height + gap * 5;
    const feedTextHeight = nameHeight + gap + phraseHeight;
    const feedRowAvailableHeight = height - top - bottomSafe - logoHeight - gap * 2 - feedDetailsHeight;
    const feedPhotoDiameter = Math.max(0, Math.min(380, Math.floor(feedRowAvailableHeight - 52)));
    const photoDiameter = story ? storyPhotoDiameter : feedPhotoDiameter;
    const radius = photoDiameter / 2;
    if (logoRef.current && logoState === 'loaded') {
      context.drawImage(logoRef.current, (width - logoWidth) / 2, top, logoWidth, logoHeight);
    } else {
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      context.fillStyle = 'rgb(13 65 143)';
      context.font = '900 46px Arial, sans-serif';
      context.fillText('I IMERSÃO TECNOLÓGICA CONTÁBIL', width / 2, top + 54, width - 120);
      context.font = '800 25px Arial, sans-serif';
      context.fillText('I T C O N T', width / 2, top + 91);
    }

    const photoBoxTop = top + logoHeight + gap;
    const feedRowHeight = Math.max(photoDiameter + 52, feedTextHeight);
    const photoX = story ? cx : width * .255;
    const cy = story ? photoBoxTop + radius + 26 : photoBoxTop + feedRowHeight / 2;
    context.save();
    context.shadowColor = 'rgba(11, 52, 112, .24)';
    context.shadowBlur = 32;
    context.shadowOffsetY = 8;
    context.fillStyle = 'white';
    context.beginPath();
    context.arc(photoX, cy, radius + 24, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.strokeStyle = blueMetal;
    context.lineWidth = 14;
    context.beginPath();
    context.arc(photoX, cy, radius + 17, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = 'rgb(173 207 244)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(photoX, cy, radius + 26, 0, Math.PI * 2);
    context.stroke();
    context.save();
    context.beginPath(); context.arc(photoX, cy, radius, 0, Math.PI * 2); context.clip();
    if (photoRef.current && photoReady) {
      const photo = photoRef.current;
      const scale = Math.max(radius * 2 / photo.naturalWidth, radius * 2 / photo.naturalHeight) * photoZoom;
      const drawnWidth = photo.naturalWidth * scale;
      const drawnHeight = photo.naturalHeight * scale;
      context.drawImage(photo, photoX - drawnWidth / 2 + photoPosition.x, cy - drawnHeight / 2 + photoPosition.y, drawnWidth, drawnHeight);
    } else {
      const portrait = context.createLinearGradient(photoX - radius, cy - radius, photoX + radius, cy + radius);
      portrait.addColorStop(0, 'rgb(240 245 250)');
      portrait.addColorStop(1, 'rgb(184 199 216)');
      context.fillStyle = portrait;
      context.fillRect(photoX - radius, cy - radius, radius * 2, radius * 2);
      context.fillStyle = 'rgb(39 65 99)';
      const avatarScale = Math.max(.58, Math.min(1, radius / 150));
      context.beginPath(); context.arc(photoX, cy - radius * .34, radius * .28, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.ellipse(photoX, cy + radius * .56, radius * .58, radius * .48, 0, Math.PI, 0); context.fill();
      context.textAlign = 'center';
      context.font = `700 ${Math.max(12, 22 * avatarScale)}px Arial, sans-serif`;
      context.fillStyle = 'white';
      context.fillText('SUA FOTO', photoX, cy + radius * .76);
      context.textAlign = 'left';
    }
    context.restore();
    context.strokeStyle = 'white';
    context.lineWidth = 10;
    context.beginPath();
    context.arc(photoX, cy, radius + 8, 0, Math.PI * 2);
    context.stroke();

    const drawMetalLine = (
      line: ReturnType<typeof measure>,
      y: number,
      depth: boolean,
      centerX = cx,
      maxWidth = width * .92,
    ) => {
      context.font = line.font;
      const baseline = y + line.ascent;
      const gradient = context.createLinearGradient(0, baseline - line.ascent, 0, baseline + line.descent + 3);
      gradient.addColorStop(0, 'rgb(58 112 181)');
      gradient.addColorStop(.22, 'rgb(30 105 190)');
      gradient.addColorStop(.56, 'rgb(15 76 170)');
      gradient.addColorStop(1, 'rgb(5 34 92)');
      context.textAlign = 'center';
      if (depth) {
        for (let layer = 8; layer >= 1; layer -= 1) {
          context.fillStyle = `rgb(${4 + layer} ${27 + layer * 2} ${72 + layer * 4})`;
          context.fillText(line.text, centerX, baseline + layer, maxWidth);
        }
      }
      context.fillStyle = gradient;
      context.fillText(line.text, centerX, baseline, maxWidth);
      context.strokeStyle = 'rgba(255, 255, 255, .72)';
      context.lineWidth = 1.4;
      context.strokeText(line.text, centerX, baseline - 1, maxWidth);
    };
    let cursor: number;
    const drawPhrase = (phraseTop: number, centerX: number, maxWidth: number) => {
    const phraseWidth = Math.min(maxWidth, phraseLine.width + 64);
    const phraseGradient = context.createLinearGradient(centerX - phraseWidth / 2, phraseTop, centerX + phraseWidth / 2, phraseTop + phraseHeight);
    phraseGradient.addColorStop(0, 'rgb(255 255 255)');
    phraseGradient.addColorStop(.48, 'rgb(211 219 230)');
    phraseGradient.addColorStop(1, 'rgb(255 255 255)');
    context.fillStyle = phraseGradient;
    context.strokeStyle = 'rgb(105 129 156)';
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(centerX - phraseWidth / 2, phraseTop, phraseWidth, phraseHeight, phraseHeight / 2);
    context.fill();
    context.stroke();
    context.font = phraseLine.font;
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillStyle = 'rgb(9 43 101)';
    context.fillText(canvasPhrase, centerX, phraseTop + (phraseHeight - phraseLine.height) / 2 + phraseLine.ascent);
    };
    if (story) {
      cursor = photoBoxTop + photoDiameter + 52 + gap;
      nameLines.forEach((line) => {
        drawMetalLine(line, cursor, true);
        cursor += line.height + 8;
      });
      cursor += gap - 8;
      drawPhrase(cursor, cx, width * .7);
      cursor += phraseHeight + gap;
    } else {
      const textCenterX = width * .745;
      const textMaxWidth = width * .51;
      const textBlockTop = photoBoxTop + (feedRowHeight - feedTextHeight) / 2;
      let nameCursor = textBlockTop;
      nameLines.forEach((line, index) => {
        drawMetalLine(line, nameCursor, true, textCenterX, textMaxWidth);
        nameCursor += line.height + (index < nameLines.length - 1 ? 8 : 0);
      });
      drawPhrase(nameCursor + gap, textCenterX, textMaxWidth);
      cursor = photoBoxTop + feedRowHeight + gap;
    }

    drawMeasured(eventLine, cursor, 'rgb(11 65 145)');
    cursor += eventLine.height + gap;
    drawMetalLine(accountingLine, cursor, false);
    cursor += accountingLine.height + gap;
    dateLines.forEach((line) => {
      drawMeasured(line, cursor, 'rgb(8 37 86)');
      cursor += line.height + 8;
    });
    cursor += gap - 8;
    venueLines.forEach((line) => {
      drawMeasured(line, cursor, 'rgb(8 37 86)');
      cursor += line.height + 8;
    });
    cursor += gap - 8;

    const badgeTop = cursor;
    const badgeWidth = Math.min(width * .7, ctaLine.width + 72);
    const badgeGradient = context.createLinearGradient(cx - badgeWidth / 2, badgeTop, cx + badgeWidth / 2, badgeTop + ctaHeight);
    badgeGradient.addColorStop(0, 'rgb(9 58 143)');
    badgeGradient.addColorStop(.5, 'rgb(23 101 193)');
    badgeGradient.addColorStop(1, 'rgb(5 49 122)');
    context.save();
    context.shadowColor = 'rgba(27, 111, 225, .42)';
    context.shadowBlur = 22;
    context.shadowOffsetY = 4;
    context.fillStyle = badgeGradient;
    context.strokeStyle = 'rgb(163 198 235)';
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(cx - badgeWidth / 2, badgeTop, badgeWidth, ctaHeight, ctaHeight / 2);
    context.fill();
    context.stroke();
    context.restore();
    const ctaBaseline = badgeTop + (ctaHeight - ctaLine.height) / 2 + ctaLine.ascent;
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillStyle = 'white';
    context.font = ctaLine.font;
    context.fillText(ctaLine.text, cx, ctaBaseline);
    cursor += ctaHeight + gap;
    drawMeasured(footerLine, cursor, 'rgb(55 70 90)');
    context.textAlign = 'left';
  }, [cardName, format, phrase, photoPosition, photoReady, photoZoom, logoState, promoVisible]);

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const input = event.currentTarget;
    input.value = '';
    const selectionId = ++photoSelectionRef.current;
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      setPhotoError('Escolha uma imagem JPG, PNG, WebP ou HEIC.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError('A foto precisa ter até 10 MB.');
      return;
    }
    setPhotoError('');
    const isHeic = /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    try {
      let imageBlob: Blob = file;
      if (isHeic) {
        setPhotoError('Convertendo HEIC para JPG neste navegador…');
        const { default: heic2any } = await import('heic2any');
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: .92 });
        const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
        if (!convertedBlob) throw new Error('A conversão não retornou uma imagem.');
        imageBlob = convertedBlob;
      }
      const nextUrl = URL.createObjectURL(imageBlob);
      await new Promise<void>((resolve, reject) => {
        const probe = new Image();
        probe.onload = () => resolve();
        probe.onerror = () => reject(new Error('O navegador não conseguiu decodificar a imagem.'));
        probe.src = nextUrl;
      });
      if (selectionId !== photoSelectionRef.current) {
        URL.revokeObjectURL(nextUrl);
        return;
      }
      setPhotoPosition({ x: 0, y: 0 });
      setPhotoError('');
      setPhotoUrl(nextUrl);
    } catch (error) {
      if (selectionId !== photoSelectionRef.current) return;
      setPhotoError(isHeic
        ? 'Não foi possível converter este HEIC neste navegador. Exporte a foto como JPG e tente novamente.'
        : 'Não foi possível abrir esta foto. Tente um JPG, PNG ou WebP válido.');
      if (error instanceof Error) console.warn('[ITCONT] Falha ao abrir a foto local:', error.message);
    }
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
