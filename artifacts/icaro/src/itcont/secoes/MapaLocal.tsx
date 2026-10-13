import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const CENTER: [number, number] = [-38.97132, -12.19997];

export default function MapaLocal() {
  const root = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    if (!('IntersectionObserver' in window)) {
      setVisivel(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisivel(true);
        observer.disconnect();
      }
    }, { rootMargin: '180px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visivel || !root.current) return;
    let map: MapLibreMap | null = null;
    let disposed = false;
    void import('maplibre-gl').then(({ default: maplibre }) => {
      if (disposed || !root.current) return;
      const marker = document.createElement('div');
      marker.className = 'itc-map-campus-marker';
      marker.textContent = 'UEFS · Auditório III do Módulo IV';
      map = new maplibre.Map({
        container: root.current,
        center: CENTER,
        zoom: 16,
        pitch: 18,
        bearing: -8,
        cooperativeGestures: true,
        attributionControl: { compact: false },
        style: {
          version: 8,
          sources: {
            satellite: {
              type: 'raster',
              tiles: [`${ESRI}World_Imagery/MapServer/tile/{z}/{y}/{x}`],
              tileSize: 256,
              maxzoom: 18,
              attribution: 'Imagens © Esri, Maxar, Earthstar Geographics',
            },
            labels: {
              type: 'raster',
              tiles: [`${ESRI}Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
              tileSize: 256,
              maxzoom: 18,
              attribution: 'Rótulos © Esri',
            },
          },
          layers: [
            { id: 'satellite', type: 'raster', source: 'satellite' },
            { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.9 } },
          ],
        },
      });
      new maplibre.Marker({ element: marker, anchor: 'bottom' }).setLngLat(CENTER).addTo(map);
    }).catch(() => {
      if (root.current) root.current.dataset.mapError = 'true';
    });
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [visivel]);

  return <div ref={root} className="itc-map" role="region" aria-label="Mapa de satélite do campus da UEFS">
    {!visivel && <span className="itc-map-loading">Mapa de satélite da UEFS</span>}
    <span className="itc-map-campus-note">Pino indicativo do campus, não da posição exata do módulo</span>
  </div>;
}
