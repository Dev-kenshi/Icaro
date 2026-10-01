import { useEffect, useRef } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext('2d')!;
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { w = c.clientWidth; h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); window.addEventListener('resize', resize);
    const n = Math.min(260, Math.round((w * h) / 6000));
    const ps = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.4 + .3, v: Math.random() * .35 + .08, a: Math.random() * .6 + .1, d: Math.random() * Math.PI * 2 }));
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.y -= p.v; p.d += .01; p.x += Math.sin(p.d) * .15;
        if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
        ctx.fillStyle = `rgba(120,210,255,${p.a * (0.6 + 0.4 * Math.sin(p.d * 2))})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduced()) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="particles" aria-hidden />;
}

export function Waveform({ energy, analyser }: { energy: number; analyser: AnalyserNode | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const eRef = useRef(energy); eRef.current = energy;
  const aRef = useRef(analyser); aRef.current = analyser;
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext('2d')!;
    let raf = 0, t = 0, cur = .1;
    const buf = new Uint8Array(256);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const tick = () => {
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      let target = eRef.current;
      const an = aRef.current;
      if (an) { an.getByteTimeDomainData(buf); let s = 0; for (const b of buf) s += Math.abs(b - 128); target = Math.max(target * .5, Math.min(1, s / buf.length / 18)); }
      cur += (target - cur) * .08; t += .03 + cur * .06;
      const traces = [{ c: '95,216,255', k: 1, o: 0, lw: 2 }, { c: '47,143,255', k: .7, o: 1.7, lw: 1.4 }, { c: '200,240,255', k: .45, o: 3.1, lw: 1 }];
      for (const tr of traces) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const u = x / w; const env = Math.sin(Math.PI * u) ** 2;
          const y = h / 2 + env * h * .42 * (cur * tr.k + .04) * (Math.sin(u * 14 + t * 2 + tr.o) * .6 + Math.sin(u * 31 - t * 3.3 + tr.o) * .3 + Math.sin(u * 5 + t) * .3);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${tr.c},.85)`; ctx.lineWidth = tr.lw; ctx.shadowColor = `rgba(${tr.c},.9)`; ctx.shadowBlur = 12; ctx.stroke();
      }
      if (!reduced()) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="wave" aria-hidden />;
}
