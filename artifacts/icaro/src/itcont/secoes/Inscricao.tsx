import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Copy, Download, ImagePlus, Share2 } from 'lucide-react';
import { ITCONT } from '../dados';
import { dataExtenso, whatsappUrl } from '../logica';
import QrEvento from './QrEvento';
import { MarcaIcone } from './MarcaIcone';
import {
  decodeAndResizePromoPhoto,
  identifyPromoPhoto,
  PROMO_PHOTO_MAX_BYTES,
  type PromoPhotoFormat,
} from './promo-photo';

const LOGO_OFICIAL = 'https://static.even3.com/logos/ImagemdoCodex21deset.de202609_39_23.91a8f584302f4c68b0fa.png';
const PROMO_WIDTH = 1080;
const PROMO_HEIGHTS = { feed: 1350, stories: 1920 } as const;
const PROMO_FRAME_INSET = 32;
const PROMO_TEXT_MARGIN = 56;
const PROMO_CONTENT_INSET = PROMO_FRAME_INSET + PROMO_TEXT_MARGIN;
const PROMO_LOGO_PHOTO_CLEARANCE = 32;
const PROMO_PHOTO_RING_OUTSET = 27;
const PROMO_PHOTO_SHADOW_BREATHING = 13;
const PROMO_LOGO_PHOTO_GAP = PROMO_LOGO_PHOTO_CLEARANCE + PROMO_PHOTO_RING_OUTSET + PROMO_PHOTO_SHADOW_BREATHING;
const PROMO_CORNER_RIBBON_WIDTH = 76;
const PROMO_CORNER_RIBBON_INNER_WIDTH = 60;
type PromoFormat = keyof typeof PROMO_HEIGHTS;
type LogoState = 'loading' | 'loaded' | 'failed';
type LogoCrop = { x: number; y: number; width: number; height: number };

function findLogoContentBounds(image: HTMLImageElement): LogoCrop {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !width || !height) throw new Error('Não foi possível inspecionar a logo oficial.');
  try {
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data;
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (pixels[(y * width + x) * 4 + 3] <= 8) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    return right >= left && bottom >= top
      ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
      : { x: 0, y: 0, width, height };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export default function Inscricao() {
  const [copied, setCopied] = useState('');
  const [name, setName] = useState('');
  const [format, setFormat] = useState<PromoFormat>('feed');
  const [phrase, setPhrase] = useState<'eu-vou' | 'estarei-la'>('eu-vou');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoPosition, setPhotoPosition] = useState({ x: 0, y: 0 });
  const [photoReady, setPhotoReady] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [photoSize, setPhotoSize] = useState<{ width: number; height: number } | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [logoState, setLogoState] = useState<LogoState>('loading');
  const [promoVisible, setPromoVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);
  const photoSelectionRef = useRef(0);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const logoCropRef = useRef<LogoCrop | null>(null);
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
    logo.onload = () => {
      logoRef.current = logo;
      try {
        logoCropRef.current = findLogoContentBounds(logo);
      } catch (error) {
        logoCropRef.current = { x: 0, y: 0, width: logo.naturalWidth, height: logo.naturalHeight };
        console.warn('[ITCONT] Não foi possível recortar as bordas transparentes da logo:', error);
      }
      setLogoState('loaded');
    };
    logo.onerror = () => {
      logoRef.current = null;
      logoCropRef.current = null;
      setLogoState('failed');
    };
    logo.src = LOGO_OFICIAL;
    return () => { logo.onload = null; logo.onerror = null; };
  }, [promoVisible]);

  useEffect(() => {
    photoRef.current = null;
    setPhotoReady(false);
    if (!photoUrl) return;
    const photo = new Image();
    let active = true;
    photo.decoding = 'async';
    photo.src = photoUrl;
    photo.decode().then(() => {
      if (!active) return;
      photoRef.current = photo;
      setPhotoReady(true);
      setPhotoError('');
    }).catch((error) => {
      if (!active) return;
      photoRef.current = null;
      setPhotoReady(false);
      setPhotoError('A foto preparada não abriu neste navegador. Escolha outra imagem.');
      console.warn('[ITCONT] Falha ao exibir a foto local preparada:', error);
    });
    return () => { active = false; };
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
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
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

    const drawCornerRibbon = (mirror: boolean) => {
      const point = (x: number, y: number) => mirror ? { x: width - x, y: height - y } : { x, y };
      const p0 = point(88, 450);
      const p1 = point(75, 365);
      const p2 = point(66, 270);
      const p3 = point(66, 205);
      const p4 = point(66, 145);
      const p5 = point(86, 83);
      const p6 = point(130, 72);
      const gradient = context.createLinearGradient(p0.x, p0.y, p6.x, p6.y);
      gradient.addColorStop(0, 'rgb(7 43 119)');
      gradient.addColorStop(.38, 'rgb(20 88 214)');
      gradient.addColorStop(.7, 'rgb(21 139 255)');
      gradient.addColorStop(1, 'rgb(8 67 171)');
      context.save();
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(p0.x, p0.y);
      context.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      context.bezierCurveTo(p4.x, p4.y, p5.x, p5.y, p6.x, p6.y);
      context.strokeStyle = 'rgba(194, 211, 233, .98)';
      context.lineWidth = PROMO_CORNER_RIBBON_WIDTH;
      context.stroke();
      context.strokeStyle = gradient;
      context.lineWidth = PROMO_CORNER_RIBBON_INNER_WIDTH;
      context.stroke();
      context.strokeStyle = 'rgba(255, 255, 255, .94)';
      context.lineWidth = 4;
      context.stroke();
      context.restore();
    };
    drawCornerRibbon(false);
    drawCornerRibbon(true);

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

    const centerX = width / 2;
    const usableWidth = width - PROMO_CONTENT_INSET * 2;
    const contentGapCount = 8;
    const minGap = story ? 8 : 10;
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
      context.fillText(line.text, centerX, y + line.ascent, usableWidth);
    };
    const nameFontSize = story ? 100 : 110;
    const nameMaxWidth = usableWidth * .92;
    const wrapName = (text: string, maxWidth: number) => {
      const words = text.split(/\s+/).filter(Boolean);
      const lines: ReturnType<typeof measure>[] = [];
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && measure(candidate, 900, nameFontSize).width > maxWidth) {
          lines.push(measure(current, 900, nameFontSize));
          current = word;
        } else current = candidate;
      }
      if (current) lines.push(measure(current, 900, nameFontSize));
      return lines.length ? lines : [measure('SEU NOME', 900, nameFontSize)];
    };
    const nameLines = wrapName(cardName ? cardName.toLocaleUpperCase('pt-BR') : 'SEU NOME', nameMaxWidth);
    const phraseLine = measure(canvasPhrase, 800, story ? 44 : 48);
    const eventLine = measure('IMERSÃO TECNOLÓGICA', 800, story ? 46 : 52);
    const accountingLine = measure('Contábil', 900, story ? 90 : 100);
    const dateParts = [dataExtenso(ITCONT.inicio), dataExtenso(ITCONT.fim)];
    const combinedDate = `${dateParts[0]} · ${dateParts[1]}`;
    const dateSize = story ? 27 : 28;
    const oneLineDate = measure(combinedDate, 700, dateSize);
    const dateLines = oneLineDate.width <= usableWidth
      ? [oneLineDate]
      : dateParts.map((line) => measure(line, 700, dateSize));
    const venueSize = story ? 26 : 28;
    const oneLineVenue = measure(`${ITCONT.local.nome} · ${ITCONT.local.cidade}/${ITCONT.local.uf}`, 500, venueSize);
    const venueLines = oneLineVenue.width <= usableWidth * .98
      ? [oneLineVenue]
      : [
        measure(ITCONT.local.nome, 500, venueSize),
        measure(`${ITCONT.local.cidade}/${ITCONT.local.uf}`, 500, venueSize),
      ];
    const ctaLine = measure('Inscrição gratuita', 800, story ? 40 : 42);
    const footerLine = measure('Cartão de divulgação · não substitui a inscrição oficial', 500, story ? 20 : 24);
    const phraseHeight = story ? 80 : 96;
    const ctaHeight = story ? 80 : 92;
    const nameLineGap = story ? 7 : 8;
    const nameHeight = nameLines.reduce((sum, line) => sum + line.height, 0)
      + Math.max(0, nameLines.length - 1) * nameLineGap;
    const dateHeight = dateLines.reduce((sum, line) => sum + line.height, 0)
      + Math.max(0, dateLines.length - 1) * 8;
    const venueHeight = venueLines.reduce((sum, line) => sum + line.height, 0)
      + Math.max(0, venueLines.length - 1) * 8;
    const logoWidth = (width - PROMO_FRAME_INSET * 2) * (story ? .70 : .62);
    const logoCrop = logoRef.current && logoState === 'loaded'
      ? (logoCropRef.current ?? { x: 0, y: 0, width: logoRef.current.naturalWidth, height: logoRef.current.naturalHeight })
      : null;
    const logoRatio = logoCrop
      ? logoCrop.height / logoCrop.width
      : .55;
    const logoHeight = logoWidth * logoRatio;
    const fixedContentHeight = logoHeight + nameHeight + phraseHeight + eventLine.height
      + accountingLine.height + dateHeight + venueHeight + ctaHeight + footerLine.height;
    const safeHeight = height - top - bottomSafe;
    const desiredPhotoDiameter = story ? 520 : 320;
    const minPhotoDiameter = story ? 340 : 180;
    const availablePhotoHeight = Math.floor(
      safeHeight - fixedContentHeight - PROMO_LOGO_PHOTO_GAP
        - PROMO_PHOTO_RING_OUTSET - minGap * contentGapCount,
    );
    const photoDiameter = Math.max(
      minPhotoDiameter,
      Math.min(desiredPhotoDiameter, availablePhotoHeight),
    );
    const gap = Math.max(
      minGap,
      Math.floor(
        (safeHeight - fixedContentHeight - PROMO_LOGO_PHOTO_GAP
          - PROMO_PHOTO_RING_OUTSET - photoDiameter) / contentGapCount,
      ),
    );
    const radius = photoDiameter / 2;
    if (logoRef.current && logoState === 'loaded') {
      context.drawImage(
        logoRef.current,
        logoCrop!.x,
        logoCrop!.y,
        logoCrop!.width,
        logoCrop!.height,
        centerX - logoWidth / 2,
        top,
        logoWidth,
        logoHeight,
      );
    } else {
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      context.fillStyle = 'rgb(13 65 143)';
      context.font = '900 46px Arial, sans-serif';
      context.fillText('I IMERSÃO TECNOLÓGICA CONTÁBIL', centerX, top + 54, usableWidth);
      context.font = '800 25px Arial, sans-serif';
      context.fillText('I T C O N T', centerX, top + 91);
    }

    const photoX = centerX;
    const photoTop = top + logoHeight + PROMO_LOGO_PHOTO_GAP;
    const cy = photoTop + radius;
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
      anchorX = centerX,
      maxWidth = usableWidth * .92,
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
          context.fillText(line.text, anchorX, baseline + layer, maxWidth);
        }
      }
      context.fillStyle = gradient;
      context.fillText(line.text, anchorX, baseline, maxWidth);
      context.strokeStyle = 'rgba(255, 255, 255, .72)';
      context.lineWidth = 1.4;
      context.strokeText(line.text, anchorX, baseline - 1, maxWidth);
    };
    const drawPhrase = (phraseTop: number, maxWidth: number) => {
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

    let cursor = photoTop + photoDiameter + PROMO_PHOTO_RING_OUTSET + gap;
    nameLines.forEach((line, index) => {
      drawMetalLine(line, cursor, true, centerX, usableWidth * .92);
      cursor += line.height + (index < nameLines.length - 1 ? nameLineGap : 0);
    });
    cursor += gap;
    drawPhrase(cursor, usableWidth * .72);
    cursor += phraseHeight + gap;
    drawMeasured(eventLine, cursor, 'rgb(11 65 145)');
    cursor += eventLine.height + gap;
    drawMetalLine(accountingLine, cursor, false, centerX, usableWidth * .92);
    cursor += accountingLine.height + gap;
    dateLines.forEach((line, index) => {
      drawMeasured(line, cursor, 'rgb(8 37 86)');
      cursor += line.height + (index < dateLines.length - 1 ? 8 : 0);
    });
    cursor += gap;
    venueLines.forEach((line, index) => {
      drawMeasured(line, cursor, 'rgb(8 37 86)');
      cursor += line.height + (index < venueLines.length - 1 ? 8 : 0);
    });
    cursor += gap;

    const badgeTop = cursor;
    const badgeWidth = Math.min(usableWidth * .7, ctaLine.width + 72);
    const badgeGradient = context.createLinearGradient(centerX - badgeWidth / 2, badgeTop, centerX + badgeWidth / 2, badgeTop + ctaHeight);
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
    context.roundRect(centerX - badgeWidth / 2, badgeTop, badgeWidth, ctaHeight, ctaHeight / 2);
    context.fill();
    context.stroke();
    context.restore();
    const ctaBaseline = badgeTop + (ctaHeight - ctaLine.height) / 2 + ctaLine.ascent;
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillStyle = 'white';
    context.font = ctaLine.font;
    context.fillText(ctaLine.text, centerX, ctaBaseline);
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
    setPhotoError('');
    setPhotoSize(null);
    setPhotoProcessing(true);
    let format: PromoPhotoFormat | null = null;
    try {
      if (file.size > PROMO_PHOTO_MAX_BYTES) {
        throw new Error('A foto precisa ter até 20 MB.');
      }
      format = await identifyPromoPhoto(file);
      if (!format) throw new Error('Escolha uma imagem JPG, PNG, WebP ou HEIC válida.');

      let prepared: Awaited<ReturnType<typeof decodeAndResizePromoPhoto>>;
      try {
        prepared = await decodeAndResizePromoPhoto(file);
      } catch (initialDecodeError) {
        if (format !== 'heic') throw initialDecodeError;
        try {
          const { default: heic2any } = await import('heic2any');
          const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: .92 });
          const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
          if (!convertedBlob) throw new Error('A conversão HEIC não retornou uma imagem.');
          prepared = await decodeAndResizePromoPhoto(convertedBlob);
        } catch (conversionError) {
          throw new AggregateError(
            [initialDecodeError, conversionError],
            'Falharam a leitura direta do HEIC e a conversão local para JPG.',
          );
        }
      }
      if (selectionId !== photoSelectionRef.current) {
        return;
      }
      const nextUrl = URL.createObjectURL(prepared.blob);
      setPhotoPosition({ x: 0, y: 0 });
      setPhotoZoom(1);
      setPhotoSize({ width: prepared.width, height: prepared.height });
      setPhotoError('');
      setPhotoUrl(nextUrl);
    } catch (error) {
      if (selectionId !== photoSelectionRef.current) return;
      setPhotoError(format === 'heic'
        ? 'Não foi possível abrir nem converter este HEIC neste navegador. Exporte a foto como JPG e tente novamente.'
        : error instanceof Error && error.message.includes('20 MB')
          ? error.message
          : 'Não foi possível abrir esta foto. Tente um JPG, PNG, WebP ou HEIC válido.');
      console.warn('[ITCONT] Falha ao preparar a foto local no navegador.', {
        format: format ?? 'não identificado',
        bytes: file.size,
        cause: error,
      });
    } finally {
      if (selectionId === photoSelectionRef.current) setPhotoProcessing(false);
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
                {photoProcessing && <p className="itc-promo-privacy" role="status" aria-live="polite" data-testid="promo-photo-status">Preparando a foto neste navegador…</p>}
                {photoSize && <p className="itc-promo-privacy" data-testid="promo-photo-dimensions" data-width={photoSize.width} data-height={photoSize.height}>Foto otimizada: {photoSize.width} × {photoSize.height} px.</p>}
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
                  data-photo-width={photoSize?.width ?? ''}
                  data-photo-height={photoSize?.height ?? ''}
                  data-logo-percent={format === 'stories' ? 70 : 62}
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
