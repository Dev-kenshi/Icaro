import { useState, type FormEvent } from 'react';
import { ExternalLink, Map, Satellite, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { googleMapEmbedUrl, googleMapsLink, type GeoTarget, type MapView } from '@/lib/geo-fly';

type Props = {
  target: GeoTarget;
  onSearch: (query: string) => Promise<GeoTarget | null>;
  onClose: () => void;
};

const views: { id: MapView; label: string }[] = [
  { id: 'map', label: 'Mapa' },
  { id: 'satellite', label: 'Satélite' },
  { id: 'street', label: 'Street View' },
];

export function GeoMapPanel({ target: initialTarget, onSearch, onClose }: Props) {
  const [target, setTarget] = useState(initialTarget);
  const [query, setQuery] = useState(initialTarget.label);
  const [view, setView] = useState<MapView>('map');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await onSearch(query.trim());
      if (result) setTarget(result);
      else setError('Não encontrei esse endereço. Tente informar rua, cidade e país.');
    } catch {
      setError('A busca de locais está temporariamente indisponível.');
    } finally {
      setBusy(false);
    }
  };

  const hierarchy = [target.street, target.city, target.state, target.country]
    .filter((part, index, all): part is string => !!part && all.indexOf(part) === index);
  const external = googleMapsLink(target, view);

  return (
    <section className="fixed inset-x-3 bottom-24 top-20 z-[80] flex flex-col overflow-hidden rounded-2xl border border-cyan-300/30 bg-slate-950 text-white shadow-2xl sm:inset-x-8 sm:bottom-8 sm:top-20" aria-label="Mapa interativo de localização">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3 sm:p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-widest text-cyan-200">Ícaro · Navegação geográfica</p>
          <h2 className="truncate font-semibold">{target.label}</h2>
          <p className="truncate text-xs text-slate-300">{hierarchy.join(' · ')} · {target.latitude.toFixed(5)}, {target.longitude.toFixed(5)}</p>
        </div>
        <form onSubmit={submit} className="order-3 flex w-full gap-2 sm:order-none sm:w-auto sm:flex-1 sm:max-w-xl">
          <label className="sr-only" htmlFor="geo-map-search">País, estado, cidade, rua ou endereço</label>
          <input id="geo-map-search" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={160} placeholder="País, estado, cidade, rua ou endereço" className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400" />
          <Button type="submit" disabled={busy || !query.trim()} aria-label="Localizar endereço"><Search size={16} className="mr-1" />{busy ? 'Buscando' : 'Ir'}</Button>
        </form>
        <Button type="button" variant="outline" onClick={onClose} aria-label="Fechar mapa" className="border-white/30 text-white hover:bg-white/10"><X size={17} /></Button>
      </header>
      <nav className="flex gap-2 border-b border-white/10 px-3 py-2" aria-label="Camada do mapa">
        {views.map(({ id, label }) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`rounded-lg px-3 py-2 text-sm ${view === id ? 'bg-cyan-300 font-semibold text-slate-950' : 'bg-white/10 text-white hover:bg-white/20'}`}>{id === 'satellite' ? <Satellite className="mr-1 inline" size={15} /> : <Map className="mr-1 inline" size={15} />}{label}</button>)}
        <a href={external} target="_blank" rel="noreferrer" className="ml-auto self-center text-xs text-cyan-200 underline">Abrir no Google Maps <ExternalLink className="ml-1 inline" size={13} /></a>
      </nav>
      {error && <p role="alert" className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm">{error}</p>}
      <div className="min-h-0 flex-1 bg-slate-900">
        {view === 'street' ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="max-w-lg">
              <Map className="mx-auto text-cyan-200" size={44} />
              <h3 className="mt-4 text-xl font-semibold">Street View de {target.label}</h3>
              <p className="mt-2 text-sm text-slate-300">Abra o panorama oficial do Google Maps nas coordenadas exatas. A disponibilidade de imagens depende da cobertura desta rua.</p>
              <a href={external} target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-lg bg-cyan-300 px-4 py-3 font-semibold text-slate-950">Abrir Street View no Google Maps <ExternalLink className="ml-2" size={16} /></a>
            </div>
          </div>
        ) : (
          <iframe key={`${target.latitude},${target.longitude}:${view}`} title={`${view} — ${target.label}`} src={googleMapEmbedUrl(target, view)} className="h-full w-full border-0" allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        )}
      </div>
      <footer className="flex flex-wrap justify-between gap-2 border-t border-white/10 px-3 py-2 text-xs text-slate-300">
        <span>{view === 'street' ? 'Street View depende da cobertura do Google nesta rua.' : 'Mapa do Google · arraste, aproxime e explore.'}</span>
        <span>Geocodificação: OpenStreetMap/Photon</span>
      </footer>
    </section>
  );
}
