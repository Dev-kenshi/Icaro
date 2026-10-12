import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ITCONT } from '../dados';
import { contagem, dataExtenso, faseDoEvento, horaCurta, sessoesOrdenadas } from '../logica';

type Props = { ativo: boolean; onSair: () => void };

function qrModules(payload: string) {
  const version = 5;
  const size = version * 4 + 17;
  const dataCapacity = 108;
  const eccCapacity = 26;
  const bytes = Array.from(new TextEncoder().encode(payload));
  const bits: number[] = [];
  const append = (value: number, length: number) => {
    for (let shift = length - 1; shift >= 0; shift--) bits.push((value >>> shift) & 1);
  };
  append(4, 4);
  append(bytes.length, 8);
  bytes.forEach((byte) => append(byte, 8));
  for (let i = 0; i < Math.min(4, dataCapacity * 8 - bits.length); i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  for (let pad = 0; data.length < dataCapacity; pad++) data.push(pad % 2 ? 0x11 : 0xec);

  const multiply = (left: number, right: number) => {
    let result = 0;
    for (let i = 7; i >= 0; i--) {
      result = (result << 1) ^ ((result >>> 7) * 0x11d);
      if (((right >>> i) & 1) !== 0) result ^= left;
    }
    return result;
  };
  const multiplyPoly = (left: number[], right: number[]) => {
    const result = Array(left.length + right.length - 1).fill(0) as number[];
    left.forEach((a, i) => right.forEach((b, j) => { result[i + j] ^= multiply(a, b); }));
    return result;
  };
  let generator = [1];
  for (let i = 0; i < eccCapacity; i++) {
    let root = 1;
    for (let n = 0; n < i; n++) root = multiply(root, 2);
    generator = multiplyPoly(generator, [1, root]);
  }
  const remainder = [...data, ...Array(eccCapacity).fill(0)] as number[];
  for (let i = 0; i < data.length; i++) {
    const factor = remainder[i];
    if (factor !== 0) for (let j = 0; j < generator.length; j++) remainder[i + j] ^= multiply(generator[j], factor);
  }
  const codewords = [...data, ...remainder.slice(data.length)];
  const matrix: Array<Array<boolean | null>> = Array.from({ length: size }, () => Array(size).fill(null));
  const finder = (ox: number, oy: number) => {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const x = ox + dx, y = oy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const edge = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && Math.max(Math.abs(dx - 3), Math.abs(dy - 3)) === 3;
      const center = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      matrix[y][x] = edge || center;
    }
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) matrix[28 + y][28 + x] = Math.max(Math.abs(x - 2), Math.abs(y - 2)) !== 1;
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }
  for (let i = 0; i <= 5; i++) matrix[i][8] = false;
  matrix[7][8] = false;
  matrix[8][8] = false;
  matrix[8][7] = false;
  for (let i = 9; i < 15; i++) matrix[8][14 - i] = false;
  for (let i = 0; i < 8; i++) matrix[8][size - 1 - i] = false;
  for (let i = 8; i < 15; i++) matrix[size - 15 + i][8] = false;
  matrix[size - 8][8] = true;

  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let vert = 0; vert < size; vert++) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vert : vert;
      for (let offset = 0; offset < 2; offset++) {
        const x = right - offset;
        if (matrix[y][x] !== null) continue;
        const bit = bitIndex < codewords.length * 8 ? ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) : 0;
        matrix[y][x] = (bit === 1) !== ((x + y) % 2 === 0);
        bitIndex++;
      }
    }
  }
  const formatData = 8;
  let formatRemainder = formatData << 10;
  for (let bit = 14; bit >= 10; bit--) if (((formatRemainder >>> bit) & 1) !== 0) formatRemainder ^= 0x537 << (bit - 10);
  const format = ((formatData << 10) | formatRemainder) ^ 0x5412;
  for (let i = 0; i <= 5; i++) matrix[i][8] = ((format >>> i) & 1) !== 0;
  matrix[7][8] = ((format >>> 6) & 1) !== 0;
  matrix[8][8] = ((format >>> 7) & 1) !== 0;
  matrix[8][7] = ((format >>> 8) & 1) !== 0;
  for (let i = 9; i < 15; i++) matrix[8][14 - i] = ((format >>> i) & 1) !== 0;
  for (let i = 0; i < 8; i++) matrix[8][size - 1 - i] = ((format >>> i) & 1) !== 0;
  for (let i = 8; i < 15; i++) matrix[size - 15 + i][8] = ((format >>> i) & 1) !== 0;
  matrix[size - 8][8] = true;
  return matrix;
}

function QrInline() {
  const url = `${window.location.origin}${window.location.pathname}`;
  const matrix = qrModules(url);
  const size = matrix.length;
  return <svg className="itc-qr" viewBox={`0 0 ${size + 8} ${size + 8}`} role="img" aria-label={`QR code para abrir ${url}`}>
    <rect width={size + 8} height={size + 8} fill="var(--itc-branco)" />
    {matrix.flatMap((row, y) => row.map((cell, x) => cell ? <rect key={`${x}-${y}`} x={x + 4} y={y + 4} width="1" height="1" fill="var(--itc-abismo)" /> : null))}
  </svg>;
}

export default function ModoTelao({ ativo, onSair }: Props) {
  const [panel, setPanel] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const exitRef = useRef(onSair);
  exitRef.current = onSair;
  useEffect(() => {
    if (!ativo) return;
    const rotation = window.setInterval(() => setPanel((current) => (current + 1) % 3), 12_000);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const exit = (event: KeyboardEvent) => { if (event.key === 'Escape') exitRef.current(); };
    window.addEventListener('keydown', exit);
    return () => { window.clearInterval(rotation); window.clearInterval(clock); window.removeEventListener('keydown', exit); };
  }, [ativo]);
  if (!ativo) return null;
  const phase = faseDoEvento(now);
  const countdown = contagem(now);
  const sessions = sessoesOrdenadas();
  return (
    <section className="itc-kiosk" aria-label="Modo auditório do ITCONT" data-testid="screen-kiosk">
      <div className="itc-kiosk-content">
        <div className="itc-eyebrow">{ITCONT.sigla} · {ITCONT.local.instituicao}</div>
        {panel === 0 && <>
          <div className="itc-kiosk-title">{ITCONT.titulo}</div>
          <div className="itc-kiosk-count">{String(countdown.dias).padStart(2, '0')} : {String(countdown.horas).padStart(2, '0')} : {String(countdown.minutos).padStart(2, '0')}</div>
          <p>{dataExtenso(ITCONT.inicio)} — {dataExtenso(ITCONT.fim)} · {ITCONT.local.nome}</p>
        </>}
        {panel === 1 && <>
          <div className="itc-eyebrow">{phase.fase === 'ao-vivo' ? 'AGORA NO PALCO' : 'STATUS DO EVENTO'}</div>
          <h2>{phase.fase === 'ao-vivo' ? phase.atual.titulo : phase.fase === 'intervalo' ? 'A SEGUIR' : phase.fase === 'encerrado' ? 'Obrigado por participar' : 'A próxima imersão começa em breve'}</h2>
          {phase.fase !== 'ao-vivo' && phase.fase !== 'encerrado' && <p>{phase.fase === 'intervalo' ? phase.proxima.titulo : sessions[0].titulo}</p>}
          <div className="itc-kiosk-row"><span>Horário de Brasília<strong>{phase.fase === 'ao-vivo' ? horaCurta(phase.atual.inicio) : horaCurta(sessions[0].inicio)}</strong></span><span>Presencial<strong>{ITCONT.local.nome}</strong></span></div>
        </>}
        {panel === 2 && <>
          <h2>Uma imersão em novas possibilidades</h2>
          <div className="itc-kiosk-speakers">{ITCONT.convidados.map(({ nome }) => <span key={nome}>{nome}</span>)}</div>
          <QrInline />
          <p>{ITCONT.resumo}</p>
        </>}
      </div>
      <button type="button" className="itc-secondary itc-exit-kiosk" onClick={onSair} data-testid="button-exit-kiosk"><X size={16} aria-hidden="true" /> Sair do modo telão</button>
      <span className="sr-only" aria-live="polite">{panel + 1} de 3</span>
    </section>
  );
}
