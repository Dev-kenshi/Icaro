import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ExternalLink, LocateFixed, X } from 'lucide-react';
import type { GeoTarget } from '@/lib/geo-fly';
import { googleMapsLink } from '@/lib/geo-fly';

type Props = {
  target: GeoTarget;
  onClose: () => void;
  onSpeak?: (text: string) => void;
};

const stages = (target: GeoTarget) => [
  { label: 'Ícaro Earth', spoken: 'Saindo da órbita.', center: [-43, -10] as [number, number], zoom: 3, duration: 3000 },
  { label: target.country?.toUpperCase() || 'BRASIL', spoken: target.country || 'Brasil.', center: [-43, -10] as [number, number], zoom: 3, duration: 3000 },
  { label: target.state?.toUpperCase() || 'BAHIA', spoken: target.state || 'Bahia.', center: [-39.5, -12] as [number, number], zoom: 5.5, duration: 3000 },
  { label: target.city || target.label, spoken: target.city || target.label, center: [target.longitude, target.latitude] as [number, number], zoom: 11, duration: 3500 },
  { label: `${target.label} Earth`, spoken: `E aqui está ${target.label}.`, center: [target.longitude, target.latitude] as [number, number], zoom: 16.5, pitch: 50, duration: 4000 },
];

export function IcaroEarthFlight({ target, onClose, onSpeak }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [stage, setStage] = useState('Ícaro Earth');
  const [error, setError] = useState('');
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [0, 10],
      zoom: 1.35,
      pitch: 0,
      projection: { type: 'globe' },
      attributionControl: true,
      cooperativeGestures: true,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.on('load', async () => {
      try {
        const symbol = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id;
        map.addSource('icaro-earth-imagery', {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: 'Imagens © Esri, Maxar, Earthstar Geographics',
        });
        map.addLayer({ id: 'icaro-earth-imagery', type: 'raster', source: 'icaro-earth-imagery', paint: { 'raster-opacity': 1 } }, symbol);
        for (const item of stages(target)) {
          if (cancelled) return;
          setStage(item.label);
          onSpeak?.(item.spoken);
          await new Promise<void>((resolve) => {
            map.once('moveend', () => resolve());
            map.flyTo({
              center: item.center,
              zoom: item.zoom,
              pitch: item.pitch ?? 0,
              bearing: item.pitch ? 12 : 0,
              curve: 1.4,
              duration: reducedMotion ? 1000 : item.duration,
              essential: true,
            });
          });
        }
        if (!cancelled) {
          markerRef.current = new maplibregl.Marker({ color: '#35d7b4' })
            .setLngLat([target.longitude, target.latitude]).addTo(map);
        }
      } catch {
        if (!cancelled) setError('Não foi possível carregar o mapa. O globo do Ícaro continua disponível atrás desta tela.');
      }
    });
    map.on('error', () => setError('O mapa está com dificuldade para carregar as imagens; tente novamente quando a conexão voltar.'));
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', closeOnEscape);
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [target, onClose, onSpeak, reducedMotion]);

  const recenter = () => mapRef.current?.flyTo({
    center: [target.longitude, target.latitude], zoom: 16.5, pitch: 50, bearing: 12,
    curve: 1.4, duration: reducedMotion ? 1000 : 1800, essential: true,
  });

  return (
    <section className="fixed inset-0 z-[90] bg-[#06120f] text-white" aria-label="Ícaro Earth">
      <div ref={containerRef} className="absolute inset-0" />
      <header className="absolute inset-x-0 top-0 z-10 flex items-start gap-3 border-b border-white/10 bg-slate-950/85 p-4 backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[.24em] text-emerald-200">Ícaro Earth · navegação cinematográfica</p>
          <h2 className="mt-1 truncate text-lg font-semibold">{stage}</h2>
          <p className="truncate text-sm text-slate-200">{target.label} · {target.latitude.toFixed(5)}, {target.longitude.toFixed(5)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar Ícaro Earth" className="rounded-lg border border-white/20 p-2 hover:bg-white/10"><X size={18} /></button>
      </header>
      <div className="absolute bottom-5 left-4 z-10 flex flex-wrap gap-2 rounded-xl border border-white/15 bg-slate-950/85 p-2 backdrop-blur">
        <button type="button" onClick={recenter} className="inline-flex items-center gap-2 rounded-lg bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950"><LocateFixed size={16} /> Recentralizar</button>
        <a href={googleMapsLink(target, 'map')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10">Abrir no Google Maps <ExternalLink size={14} /></a>
        <button type="button" onClick={onClose} className="rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10">Fechar</button>
        <span className="self-center px-2 text-xs text-slate-300">Imagens © Esri, Maxar, Earthstar Geographics · Mapa © OpenFreeMap</span>
      </div>
      {error && <p role="status" className="absolute bottom-24 left-4 z-10 max-w-lg rounded-lg bg-slate-950/90 p-3 text-sm">{error}</p>}
    </section>
  );
}
