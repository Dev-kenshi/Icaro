import { useEffect, useRef } from 'react';

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ01234567890ΣΔΩ∆≡';

export function RainCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const size = 18;
    let cols = 0;
    let drops: number[] = [];
    let raf = 0;
    let last = 0;
    const resize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
      cols = Math.ceil(c.width / size);
      drops = Array.from({ length: cols }, () => Math.random() * -40);
    };
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 55) return;
      last = t;
      ctx.fillStyle = 'rgba(1,4,8,0.14)';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.font = `${size}px monospace`;
      for (let i = 0; i < cols; i++) {
        const y = drops[i] * size;
        ctx.fillStyle = Math.random() > 0.96 ? '#e6f7ff' : '#5fd8ff';
        ctx.globalAlpha = 0.75;
        ctx.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)], i * size, y);
        ctx.globalAlpha = 1;
        if (y > c.height && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 1;
      }
    };
    resize();
    ctx.fillStyle = '#010408';
    ctx.fillRect(0, 0, c.width, c.height);
    window.addEventListener('resize', resize);
    if (reduce) { for (let i = 0; i < 40; i++) draw(i * 100); cancelAnimationFrame(raf); } else raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="lg-rain" aria-hidden="true" />;
}
