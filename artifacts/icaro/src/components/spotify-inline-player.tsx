import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { parseSpotifyLink, spotifyEmbedUrl, spotifyUri, type SpotifyTrack } from '@/lib/spotify-links';

type PlaybackUpdate = { data: { isPaused: boolean } };
type SpotifyEmbedController = {
  addListener: (event: 'playback_update', callback: (event: PlaybackUpdate) => void) => void;
  loadEntity: (url: string) => void;
  play: () => void;
  pause: () => void;
  destroy: () => void;
};
type SpotifyIframeApi = {
  createController: (
    element: HTMLElement,
    options: { width: string; height: number; uri: string },
    callback: (controller: SpotifyEmbedController) => void,
  ) => void;
};

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void;
  }
}

let spotifyApiPromise: Promise<SpotifyIframeApi> | null = null;

function loadSpotifyIframeApi() {
  if (spotifyApiPromise) return spotifyApiPromise;
  spotifyApiPromise = new Promise<SpotifyIframeApi>((resolve, reject) => {
    const previousHandler = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (api) => {
      previousHandler?.(api);
      resolve(api);
    };
    const script = document.createElement('script');
    script.src = 'https://open.spotify.com/embed/iframe-api/v1';
    script.async = true;
    script.dataset.icaroSpotifyIframeApi = 'true';
    script.onerror = () => reject(new Error('Não foi possível carregar o player do Spotify.'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    spotifyApiPromise = null;
    throw error;
  });
  return spotifyApiPromise;
}

export function SpotifyInlinePlayer({
  track,
  autoPlayRequest,
}: {
  track: SpotifyTrack;
  autoPlayRequest: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  const trackRef = useRef(track);
  const requestRef = useRef(autoPlayRequest);
  const lastLoadedUrlRef = useRef(track.url);
  const lastPlayRequestRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');

  trackRef.current = track;
  requestRef.current = autoPlayRequest;

  useEffect(() => {
    let mounted = true;
    const host = hostRef.current;
    if (!host) return undefined;

    void loadSpotifyIframeApi().then((api) => {
      if (!mounted || !hostRef.current) return;
      const initialTrack = trackRef.current;
      lastLoadedUrlRef.current = initialTrack.url;
      api.createController(host, {
        width: '100%',
        height: 352,
        uri: spotifyUri(initialTrack),
      }, (controller) => {
        if (!mounted) {
          controller.destroy();
          return;
        }
        controllerRef.current = controller;
        controller.addListener('playback_update', (event) => setPlaying(!event.data.isPaused));
        setReady(true);
      });
    }).catch((loadError: unknown) => {
      if (mounted) setError(loadError instanceof Error ? loadError.message : 'Player do Spotify indisponível.');
    });

    return () => {
      mounted = false;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!ready || !controller || lastLoadedUrlRef.current === track.url) return;
    controller.loadEntity(track.url);
    lastLoadedUrlRef.current = track.url;
    setPlaying(false);
  }, [ready, track.url]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!ready || !controller || requestRef.current <= lastPlayRequestRef.current) return;
    lastPlayRequestRef.current = requestRef.current;
    controller.play();
  }, [ready, autoPlayRequest]);

  const togglePlayback = () => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (playing) controller.pause();
    else controller.play();
  };

  const embedUrl = spotifyEmbedUrl(track);
  if (!parseSpotifyLink(track.url) || !embedUrl) {
    return <p role="alert" className="mt-4 text-sm text-destructive">Este link não pode ser reproduzido no player do Spotify.</p>;
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={togglePlayback}
        disabled={!ready}
        className="mb-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-60"
        aria-label={playing ? `Pausar ${track.title}` : `Tocar ${track.title} nesta página`}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
        {playing ? 'Pausar' : ready ? 'Tocar nesta página' : 'Carregando player…'}
      </button>
      <div ref={hostRef} className="w-full overflow-hidden rounded-xl" aria-label={`Player do Spotify: ${track.title}`} />
      {error ? (
        <div>
          <p className="mt-2 text-xs text-muted-foreground">{error} Use o botão Reproduzir no player abaixo.</p>
          <iframe
            className="mt-3 h-[352px] w-full rounded-xl"
            src={embedUrl}
            title={`Spotify: ${track.title}`}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        </div>
      ) : !ready ? (
        <p className="mt-2 text-xs text-muted-foreground">Conectando ao Spotify… Se a reprodução automática for bloqueada pelo navegador, toque em “Tocar nesta página”.</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">A reprodução acontece aqui na página. O Spotify pode pedir login ou bloquear a reprodução automática neste navegador.</p>
      )}
    </div>
  );
}
