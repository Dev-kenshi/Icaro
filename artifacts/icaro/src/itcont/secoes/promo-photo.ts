export type PromoPhotoFormat = 'jpeg' | 'png' | 'webp' | 'heic' | 'other';

export const PROMO_PHOTO_MAX_BYTES = 20 * 1024 * 1024;
export const PROMO_PHOTO_MAX_SIDE = 2048;

type PromoPhotoFile = Pick<Blob, 'slice' | 'type'> & { name?: string };

const startsWithBytes = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, index) => bytes[index] === byte);

export function detectPromoPhotoFormat(bytes: Uint8Array): PromoPhotoFormat | null {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'webp';

  const isoBmff = String.fromCharCode(...bytes.slice(0, 64));
  if (/ftyp(?:heic|heix|hevc|hevx|heim|heis|mif1)/i.test(isoBmff)) return 'heic';
  return null;
}

export async function identifyPromoPhoto(file: PromoPhotoFile): Promise<PromoPhotoFormat | null> {
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const signatureFormat = detectPromoPhotoFormat(header);
  if (signatureFormat) return signatureFormat;

  const mime = file.type.toLowerCase().split(';', 1)[0].trim();
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpeg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  if (mime.startsWith('image/')) return 'other';

  const name = file.name?.toLowerCase() ?? '';
  if (/\.(jpe?g)$/.test(name)) return 'jpeg';
  if (/\.png$/.test(name)) return 'png';
  if (/\.webp$/.test(name)) return 'webp';
  if (/\.hei[cf]$/.test(name)) return 'heic';
  return null;
}

export function fitPromoPhotoDimensions(
  width: number,
  height: number,
  maxSide = PROMO_PHOTO_MAX_SIDE,
) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new RangeError('As dimensões da foto precisam ser positivas.');
  }
  if (!Number.isFinite(maxSide) || maxSide < 1) {
    throw new RangeError('O limite do lado maior precisa ser positivo.');
  }
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

type DecodedPhoto = {
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  close: () => void;
};

async function decodeWithImageBitmap(blob: Blob): Promise<DecodedPhoto> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('createImageBitmap não está disponível.');
  }
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => bitmap.close(),
  };
}

async function decodeWithImageElement(blob: Blob): Promise<DecodedPhoto> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  try {
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function decodePhoto(blob: Blob): Promise<DecodedPhoto> {
  const failures: Error[] = [];
  try {
    return await decodeWithImageBitmap(blob);
  } catch (error) {
    failures.push(new Error('createImageBitmap falhou.', { cause: error }));
  }
  try {
    return await decodeWithImageElement(blob);
  } catch (error) {
    failures.push(new Error('Image.decode falhou.', { cause: error }));
  }
  throw new AggregateError(failures, 'Nenhum decodificador do navegador conseguiu abrir a foto.');
}

function createResizeCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('O navegador não conseguiu exportar a foto reduzida.'));
    }, 'image/jpeg', 0.92);
  });
}

export async function decodeAndResizePromoPhoto(blob: Blob) {
  const decoded = await decodePhoto(blob);
  const outputSize = fitPromoPhotoDimensions(decoded.width, decoded.height);
  const canvas = createResizeCanvas(outputSize.width, outputSize.height);
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) {
    decoded.close();
    throw new Error('O navegador não disponibilizou um contexto 2D para reduzir a foto.');
  }

  try {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#fff';
    context.fillRect(0, 0, outputSize.width, outputSize.height);
    context.drawImage(decoded.source, 0, 0, outputSize.width, outputSize.height);
    const resized = await canvasToJpeg(canvas);
    return { blob: resized, ...outputSize };
  } finally {
    decoded.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
