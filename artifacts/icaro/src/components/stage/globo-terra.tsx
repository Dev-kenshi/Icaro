import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Globe2, LocateFixed, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { subtituloLugar, zoomPara, type Lugar } from '@/lib/globo';
import { CENA_VELOCIDADE, subsolarDirection } from './cosmos/scene-assets';

export type { Lugar };

/**
 * Planeta Terra em 3D atrás do Ícaro (porte do ÍCARO v5): MapLibre GL com projeção de globo,
 * imagens de satélite e rótulos da Esri. Arrastar gira, a roda aproxima; por voz ele voa até
 * qualquer lugar, mostra o título e marca no mapa. Parado, o planeta gira devagar.
 */

export type GloboApi = {
  voar: (lugar: Lugar, opcoes?: { zoom?: number; aqui?: boolean }) => void;
  zoom: (delta: number) => void;
  girar: (delta: number) => void;
  posicionar: (lon: number, lat: number) => void;
  planeta: () => void;
};

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const VISTA_INICIAL = { center: [-38.97, -12.27] as [number, number], zoom: 2.35 };
const PAUSA_GIRO_APOS_INTERACAO_MS = 5000;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type Props = {
  /** Sem movimento automático (prefers-reduced-motion): mantém interação e voos curtos. */
  reduzido: boolean;
  onOnde?: () => void;
  onFalha?: (motivo: string) => void;
  onInteract?: () => void;
  ocultarControles?: boolean;
  /** Gira continuamente mesmo antes de expirar o tempo de inatividade. */
  giroContinuo?: boolean;
  /** Elemento decorativo sem gestos, foco ou captura de ponteiro. */
  decorativo?: boolean;
};

export const GloboTerra = forwardRef<GloboApi, Props>(function GloboTerra({
  reduzido, onOnde = () => undefined, onFalha = () => undefined, onInteract,
  ocultarControles, giroContinuo = false, decorativo = false,
}, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<typeof import('maplibre-gl') | null>(null);
  const pinosRef = useRef<Marker[]>([]);
  const aquiRef = useRef<Marker | null>(null);
  const keyHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);
  const ultimaMexida = useRef(0);
  const [titulo, setTitulo] = useState<{ nome: string; sub: string; chave: number } | null>(null);
  const tituloTimer = useRef(0);
  const falhaRef = useRef(onFalha); falhaRef.current = onFalha;
  const reduzidoRef = useRef(reduzido); reduzidoRef.current = reduzido;
  const giroContinuoRef = useRef(giroContinuo); giroContinuoRef.current = giroContinuo;
  // Voo pedido antes de o mapa carregar (ex.: "mostre Feira de Santana" ao abrir a página).
  const pendenteRef = useRef<{ lugar: Lugar; opcoes: { zoom?: number; aqui?: boolean } } | null>(null);
  const voarRef = useRef<(lugar: Lugar, opcoes?: { zoom?: number; aqui?: boolean }) => void>(() => undefined);
  const interactRef = useRef(onInteract); interactRef.current = onInteract;

  useEffect(() => {
    let vivo = true;
    let raf = 0;
    let removerVisibilidade: () => void = () => {};
    void (async () => {
      try {
        const lib = await import('maplibre-gl');
        if (!vivo || !hostRef.current) return;
        libRef.current = lib;
        const map = new lib.Map({
          container: hostRef.current,
          attributionControl: { compact: true },
          center: VISTA_INICIAL.center,
          zoom: VISTA_INICIAL.zoom,
          maxPitch: 70,
          interactive: !decorativo,
          dragPan: !decorativo,
          dragRotate: !decorativo,
          touchZoomRotate: !decorativo,
          scrollZoom: !decorativo,
          doubleClickZoom: !decorativo,
          keyboard: !decorativo,
          renderWorldCopies: false,
          fadeDuration: 0,
          style: {
            version: 8,
            projection: { type: 'globe' },
            sources: {
              sat: { type: 'raster', tileSize: 256, maxzoom: 18, tiles: [`${ESRI}World_Imagery/MapServer/tile/{z}/{y}/{x}`], attribution: 'Imagens: Esri, Maxar, Earthstar Geographics' },
              rot: { type: 'raster', tileSize: 256, maxzoom: 18, tiles: [`${ESRI}Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`], attribution: 'Rótulos: Esri' },
            },
            layers: [
              { id: 'fundo', type: 'background', paint: { 'background-color': '#04122a', 'background-opacity': decorativo ? 0 : 1 } },
              { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': 0.08, 'raster-fade-duration': 0 } },
              { id: 'rot', type: 'raster', source: 'rot', minzoom: 2.2, paint: { 'raster-opacity': decorativo ? 0 : 0.92, 'raster-fade-duration': 0 } },
            ],
          },
        });
        mapRef.current = map;
        const canvas = map.getCanvas();
        canvas.tabIndex = decorativo ? -1 : 0;
        if (decorativo) canvas.setAttribute('aria-hidden', 'true');
        else canvas.setAttribute('aria-label', 'Globo da Terra. Arraste para posicionar, use Ctrl e arraste para girar, setas para mover e Shift com as setas para inclinar. Tecla R recentraliza.');
        const onMapKeyDown = (event: KeyboardEvent) => {
          if (event.key.toLowerCase() !== 'r') return;
          event.preventDefault();
          ultimaMexida.current = 0;
          setTitulo(null);
          map.flyTo({ center: VISTA_INICIAL.center, zoom: VISTA_INICIAL.zoom, pitch: 0, bearing: 0, speed: 1.1, essential: true });
        };
        keyHandlerRef.current = onMapKeyDown;
        canvas.addEventListener('keydown', onMapKeyDown);
        const aplicarLuzSolar = (date: Date) => {
          const [x, y, z] = subsolarDirection(date);
          const azimuth = (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360;
          const polar = Math.acos(clamp(y, -1, 1)) * 180 / Math.PI;
          try {
            map.setLight({ anchor: 'map', position: [1.15, azimuth, polar], color: '#ffffff', intensity: .72 });
          } catch { /* versões sem iluminação de estilo mantêm o relevo base */ }
          const wrapper = hostRef.current?.closest<HTMLElement>('.itc-earth-backdrop');
          const sun = map.project([Math.atan2(-z, x) * 180 / Math.PI, Math.asin(clamp(y, -1, 1)) * 180 / Math.PI]);
          if (wrapper) {
            wrapper.style.setProperty('--itc-sun-x', `${clamp(sun.x / map.getCanvas().clientWidth * 100, 0, 100)}%`);
            wrapper.style.setProperty('--itc-sun-y', `${clamp(sun.y / map.getCanvas().clientHeight * 100, 0, 100)}%`);
          }
        };
        map.on('load', () => {
          aplicarLuzSolar(new Date());
          const pendente = pendenteRef.current;
          pendenteRef.current = null;
          if (pendente) voarRef.current(pendente.lugar, pendente.opcoes);
          try {
            map.setSky({
              'sky-color': '#0b2a5c', 'horizon-color': '#4fd1ff', 'fog-color': '#0a1730', 'sky-horizon-blend': 0.6,
              'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.6, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
            });
          } catch { /* atmosfera é opcional */ }
        });
        const mexeu = () => { ultimaMexida.current = Date.now(); interactRef.current?.(); };
        if (!decorativo) for (const ev of ['mousedown', 'touchstart', 'wheel', 'dragstart'] as const) map.on(ev, mexeu);
        map.on('error', (e) => {
          const msg = String((e as { error?: Error }).error?.message ?? '');
          if (msg && !/tile|Failed to fetch|NetworkError|AJAXError/i.test(msg)) console.warn('globo:', msg);
        });
        map.getCanvas().addEventListener('webglcontextlost', () => falhaRef.current('O navegador perdeu o contexto gráfico do globo.'));
        // Giro lento quando ninguém mexe e a câmera está longe.
        let anterior = performance.now();
        let proximaAtualizacaoSolar = anterior;
        const passo = (agora: number) => {
          raf = 0;
          if (!vivo || document.hidden) return;
          const dt = Math.min(0.1, (agora - anterior) / 1000); anterior = agora;
          if (agora >= proximaAtualizacaoSolar) {
            aplicarLuzSolar(new Date());
            proximaAtualizacaoSolar = agora + 60_000;
          }
          if (!reduzidoRef.current && map.loaded() && !map.isMoving()
            && (giroContinuoRef.current || Date.now() - ultimaMexida.current > PAUSA_GIRO_APOS_INTERACAO_MS)
            && map.getZoom() <= 3.2) {
            const spin = CENA_VELOCIDADE * (giroContinuoRef.current ? .5 : 1);
            const c = map.getCenter(); c.lng -= dt * spin * 180 / Math.PI; if (c.lng < -180) c.lng += 360;
            map.jumpTo({ center: c });
          }
          raf = requestAnimationFrame(passo);
        };
        const visibilidade = () => {
          if (document.hidden) {
            cancelAnimationFrame(raf);
            raf = 0;
          } else if (!raf) {
            anterior = performance.now();
            raf = requestAnimationFrame(passo);
          }
        };
        document.addEventListener('visibilitychange', visibilidade);
        removerVisibilidade = () => document.removeEventListener('visibilitychange', visibilidade);
        if (!document.hidden) raf = requestAnimationFrame(passo);
      } catch (error) {
        if (vivo) falhaRef.current(error instanceof Error ? error.message : 'WebGL indisponível');
      }
    })();
    return () => {
      vivo = false;
      cancelAnimationFrame(raf);
      removerVisibilidade();
      window.clearTimeout(tituloTimer.current);
      if (keyHandlerRef.current) mapRef.current?.getCanvas().removeEventListener('keydown', keyHandlerRef.current);
      keyHandlerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // O mapa é criado uma vez; reduzido só muda o giro automático.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** O lugar procurado aparece à esquerda do rosto, não escondido atrás dele. */
  const deslocamento = (): [number, number] => {
    const host = hostRef.current?.getBoundingClientRect();
    const face = document.querySelector('.stage .face-orb, .stage .face')?.getBoundingClientRect();
    if (!host || !face || !face.width) return [0, 0];
    const x = face.left - host.left > 220 ? face.left - 40 : face.left + face.width * 0.12;
    const y = face.top + face.height * 0.62;
    return [x - (host.left + host.width / 2), y - (host.top + host.height / 2)];
  };

  const zoomPor = (delta: number) => {
    const map = mapRef.current; if (!map) return;
    ultimaMexida.current = Date.now();
    map.easeTo({ zoom: clamp(map.getZoom() + delta, 0.8, 18), duration: 900, offset: deslocamento() });
  };
  const girarPor = (delta: number) => {
    const map = mapRef.current; if (!map) return;
    ultimaMexida.current = Date.now();
    map.easeTo({ bearing: map.getBearing() + delta, duration: 450 });
  };
  const posicionar = (lon: number, lat: number) => {
    const map = mapRef.current; if (!map) return;
    ultimaMexida.current = Date.now();
    const center = map.getCenter();
    map.easeTo({ center: [clamp(center.lng + lon, -180, 180), clamp(center.lat + lat, -85, 85)], duration: 650 });
  };
  const planeta = () => {
    const map = mapRef.current; if (!map) return;
    ultimaMexida.current = 0; setTitulo(null);
    map.flyTo({ center: VISTA_INICIAL.center, zoom: VISTA_INICIAL.zoom, pitch: 0, bearing: 0, speed: 1.1, essential: true });
  };

  const voar = (lugar: Lugar, opcoes: { zoom?: number; aqui?: boolean } = {}) => {
      const map = mapRef.current, lib = libRef.current;
      setTitulo({ nome: lugar.nome.toUpperCase(), sub: subtituloLugar(lugar), chave: Date.now() });
      window.clearTimeout(tituloTimer.current);
      tituloTimer.current = window.setTimeout(() => setTitulo(null), 12_000);
      if (!map || !lib || !map.loaded()) { pendenteRef.current = { lugar, opcoes }; return; }
      ultimaMexida.current = Date.now();
      const zoom = opcoes.zoom ?? zoomPara(lugar);
      map.flyTo({
        center: [lugar.lon, lugar.lat], zoom, pitch: zoom > 8 ? 50 : 20, bearing: zoom > 8 ? -12 : 0,
        speed: reduzido ? 2.4 : 0.85, curve: 1.45, essential: true, offset: deslocamento(),
      });
      const el = document.createElement('div');
      el.className = `pino${opcoes.aqui ? ' aqui' : ''}`;
      el.innerHTML = '<i></i><b></b>';
      (el.querySelector('b') as HTMLElement).textContent = lugar.nome;
      const marcador = new lib.Marker({ element: el, anchor: 'bottom' }).setLngLat([lugar.lon, lugar.lat]).addTo(map);
      if (opcoes.aqui) { aquiRef.current?.remove(); aquiRef.current = marcador; return; }
      pinosRef.current.push(marcador);
      while (pinosRef.current.length > 5) pinosRef.current.shift()?.remove();
  };
  voarRef.current = voar;

  useImperativeHandle(ref, () => ({
    voar,
    zoom: zoomPor,
    girar: girarPor,
    posicionar,
    planeta,
  }), [reduzido]);

  return (
    <>
      <div ref={hostRef} className="globo-terra" data-testid="globo-terra" style={decorativo ? { pointerEvents: 'none' } : undefined} />
      <div className="globo-veu" aria-hidden="true" />
      {titulo && (
        <div key={titulo.chave} className="lugar-titulo" role="status" aria-live="polite" data-testid="lugar-titulo">
          <b>{titulo.nome}</b>
          {titulo.sub && <small>{titulo.sub}</small>}
        </div>
      )}
      {!ocultarControles && (
        <div className="globo-controles" aria-label="Controles do planeta" title="Arraste para posicionar; use Ctrl+arraste ou os botões para girar; use a roda para aproximar">
          <button type="button" onClick={() => zoomPor(1.5)} aria-label="Aproximar" title="Aproximar" data-testid="globo-mais"><Plus size={15} /></button>
          <button type="button" onClick={() => zoomPor(-1.5)} aria-label="Afastar" title="Afastar" data-testid="globo-menos"><Minus size={15} /></button>
          <div className="globo-controles__posicao" role="group" aria-label="Posicionar o planeta">
            <button type="button" onClick={() => posicionar(0, 10)} aria-label="Mover a vista para o norte" title="Mover para cima" data-testid="globo-mover-norte"><ArrowUp size={15} /></button>
            <button type="button" onClick={() => posicionar(-10, 0)} aria-label="Mover a vista para oeste" title="Mover para a esquerda" data-testid="globo-mover-oeste"><ArrowLeft size={15} /></button>
            <button type="button" onClick={() => posicionar(10, 0)} aria-label="Mover a vista para leste" title="Mover para a direita" data-testid="globo-mover-leste"><ArrowRight size={15} /></button>
            <button type="button" onClick={() => posicionar(0, -10)} aria-label="Mover a vista para o sul" title="Mover para baixo" data-testid="globo-mover-sul"><ArrowDown size={15} /></button>
          </div>
          <button type="button" onClick={() => girarPor(-30)} aria-label="Girar para a esquerda" title="Girar para a esquerda" data-testid="globo-girar-esquerda"><RotateCcw size={15} /></button>
          <button type="button" onClick={() => girarPor(30)} aria-label="Girar para a direita" title="Girar para a direita" data-testid="globo-girar-direita"><RotateCw size={15} /></button>
          <button type="button" onClick={onOnde} aria-label="Onde estamos" title="Onde estamos" data-testid="globo-onde"><LocateFixed size={15} /></button>
          <button type="button" onClick={planeta} aria-label="Planeta inteiro" title="Planeta inteiro" data-testid="globo-planeta"><Globe2 size={15} /></button>
        </div>
      )}
    </>
  );
});
