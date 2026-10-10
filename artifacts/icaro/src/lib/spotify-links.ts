export type SpotifyTrack = { id: string; title: string; url: string };

export function parseSpotifyLink(raw: string): SpotifyTrack | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const offset = parts[0]?.startsWith('intl-') ? 1 : 0;
    const type = parts[offset];
    const id = parts[offset + 1];
    if (!['track', 'album', 'playlist'].includes(type ?? '') || !/^[A-Za-z0-9]{22}$/.test(id ?? '')) return null;
    return { id, title: '', url: `https://open.spotify.com/${type}/${id}` };
  } catch {
    return null;
  }
}

export function spotifyEmbedUrl(track: SpotifyTrack) {
  const parsed = parseSpotifyLink(track.url);
  if (!parsed) return '';
  const type = new URL(parsed.url).pathname.split('/')[1];
  return `https://open.spotify.com/embed/${type}/${parsed.id}`;
}
