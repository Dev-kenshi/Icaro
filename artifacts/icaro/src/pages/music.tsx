import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, Music2, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthUser } from '@/components/login/login-gate';
import { parseSpotifyLink, spotifyEmbedUrl, type SpotifyTrack } from '@/lib/spotify-links';

const PREFIX = 'icaro-v5-spotify:';
function loadTracks(key: string): SpotifyTrack[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): SpotifyTrack[] => {
      if (!item || typeof item !== 'object') return [];
      const track = item as Partial<SpotifyTrack>;
      const parsed = typeof track.url === 'string' ? parseSpotifyLink(track.url) : null;
      return parsed && typeof track.title === 'string' ? [{ ...parsed, title: track.title }] : [];
    });
  } catch { return []; }
}

export default function Music() {
  const user = useAuthUser();
  const key = `${PREFIX}${user?.username ?? 'guest'}`;
  const [tracks, setTracks] = useState<SpotifyTrack[]>(() => loadTracks(key));
  const previousKey = useRef(key);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [active, setActive] = useState<SpotifyTrack | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (previousKey.current !== key) {
      previousKey.current = key;
      setTracks(loadTracks(key));
      return;
    }
    localStorage.setItem(key, JSON.stringify(tracks));
  }, [key, tracks]);

  const add = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseSpotifyLink(url);
    if (!parsed || !title.trim()) { setError('Informe um nome e um link válido de faixa, álbum ou playlist do Spotify.'); return; }
    const next = { ...parsed, title: title.trim() };
    setTracks((current) => [next, ...current.filter((item) => item.id !== next.id)]);
    setActive(next); setTitle(''); setUrl(''); setError('');
  };

  return (
    <section className="mx-auto max-w-5xl space-y-6" aria-labelledby="music-title">
      <header><p className="text-xs font-mono-data uppercase tracking-[.16em] text-secondary">Música para a apresentação</p><h1 id="music-title" className="mt-2 font-display text-3xl font-semibold">Spotify</h1><p className="mt-2 text-sm text-muted-foreground">Adicione links compartilháveis e salve faixas do evento neste perfil. O Spotify controla login, catálogo e disponibilidade.</p></header>
      <form onSubmit={add} className="grid gap-3 rounded-2xl border bg-card p-5 md:grid-cols-[1fr_2fr_auto]" aria-label="Salvar música">
        <label className="text-sm font-medium">Nome<input className="mt-1 w-full rounded-lg border bg-background px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Abertura" /></label>
        <label className="text-sm font-medium">Link do Spotify<input className="mt-1 w-full rounded-lg border bg-background px-3 py-2" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://open.spotify.com/track/…" /></label>
        <Button type="submit" className="self-end"><Music2 size={16} className="mr-2" />Salvar</Button>
        {error && <p role="alert" className="text-sm text-destructive md:col-span-3">{error}</p>}
      </form>
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border bg-card p-5" aria-label="Músicas salvas">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Músicas do evento</h2><a className="inline-flex items-center gap-1 text-sm text-secondary underline" href={`https://open.spotify.com/search/${encodeURIComponent(title || 'ITCONT')}`} target="_blank" rel="noreferrer">Buscar no Spotify <ExternalLink size={14} /></a></div>
          <ul className="mt-4 space-y-2">{tracks.map((track) => <li key={track.id} className="flex items-center gap-2 rounded-xl border p-3"><button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setActive(track)}><Play size={16} className="shrink-0 text-secondary" /><span className="truncate">{track.title}</span></button><Button type="button" size="icon" variant="ghost" aria-label={`Excluir ${track.title}`} onClick={() => { setTracks((items) => items.filter((item) => item.id !== track.id)); if (active?.id === track.id) setActive(null); }}><Trash2 size={16} /></Button></li>)}</ul>
          {!tracks.length && <p className="mt-4 text-sm text-muted-foreground">Nenhuma faixa salva.</p>}
        </section>
        <section className="rounded-2xl border bg-card p-5" aria-label="Player do Spotify">
          <h2 className="font-semibold">{active?.title ?? 'Player'}</h2>
          {active ? <><iframe className="mt-4 h-[352px] w-full rounded-xl" src={spotifyEmbedUrl(active)} title={`Spotify: ${active.title}`} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" /><a href={active.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-secondary underline">Abrir no Spotify <ExternalLink size={14} /></a></> : <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Selecione uma música salva para abrir o player.</p>}
        </section>
      </div>
    </section>
  );
}
