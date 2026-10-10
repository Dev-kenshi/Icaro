import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudSun, RefreshCw, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

type RatePayload = { result?: string; time_last_update_utc?: string; rates?: Record<string, number> };
type BcbRow = { data?: string; valor?: string };
type GeoResult = { latitude?: number; longitude?: number; name?: string; admin1?: string; country?: string };
type WeatherPayload = { current?: { temperature_2m?: number; relative_humidity_2m?: number; apparent_temperature?: number; weather_code?: number; wind_speed_10m?: number } };
type Metric = { label: string; value: string; source: string; date: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function fmt(value: number, digits = 2) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function sparkPoints(values: number[], w: number, h: number) {
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  return values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 8 - ((v - min) / span) * (h - 16)).toFixed(1)}`).join(' ');
}

export default function FinanceWeather() {
  const [cityInput, setCityInput] = useState('Feira de Santana');
  const [city, setCity] = useState('Feira de Santana');
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [dollarSeries, setDollarSeries] = useState<{ data: string; valor: number }[]>([]);
  const [weather, setWeather] = useState<WeatherPayload['current'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [updated, setUpdated] = useState('');
  const requestVersion = useRef(0);

  const refresh = useCallback(async (requestedCity: string) => {
    const version = ++requestVersion.current;
    setLoading(true);
    setErrors([]);
    const problems: string[] = [];
    const nextMetrics: Metric[] = [];
    const currencyJob = fetch('https://open.er-api.com/v6/latest/USD')
      .then(async (r) => { if (!r.ok) throw new Error('Cotações indisponíveis'); return await r.json() as RatePayload; })
      .then((data) => {
        const brlPerUsd = data.rates?.BRL;
        if (data.result !== 'success' || typeof brlPerUsd !== 'number') throw new Error('Resposta de câmbio inválida');
        for (const [code, label] of [['BRL', 'Real'], ['EUR', 'Euro'], ['UYU', 'Peso uruguaio'], ['ARS', 'Peso argentino']] as const) {
          const unitsPerUsd = data.rates?.[code];
          if (typeof unitsPerUsd === 'number' && unitsPerUsd > 0) {
            nextMetrics.push({ label: `${code} → BRL · ${label}`, value: `R$ ${fmt(brlPerUsd / unitsPerUsd, 4)}`, source: 'ExchangeRate-API · taxa de referência', date: data.time_last_update_utc ?? '' });
          } else problems.push(`${label}: cotação não fornecida pela fonte.`);
        }
      }).catch(() => problems.push('Cotações cambiais: fonte temporariamente indisponível.'));
    const bcbJob = Promise.all([
      ['432', 'Selic meta', '% a.a.'],
      ['4389', 'CDI anualizado', '% a.a.'],
      ['13522', 'IPCA acumulado em 12 meses', '%'],
      ['7832', 'Ibovespa', ' pontos'],
    ].map(async ([series, label, unit]) => {
      try {
        const response = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series}/dados/ultimos/1?formato=json`);
        if (!response.ok) throw new Error();
        const rows = await response.json() as BcbRow[];
        const row = rows.at(-1);
        const value = Number(row?.valor?.replace(',', '.'));
        if (Number.isFinite(value)) nextMetrics.push({ label, value: `${fmt(value, 4)}${unit}`, source: `Banco Central do Brasil · SGS ${series}`, date: row?.data ?? '' });
        else throw new Error();
      } catch {
        problems.push(`${label}: fonte do Banco Central temporariamente indisponível.`);
      }
    }));
    const dollarJob = fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/30?formato=json')
      .then(async (r) => { if (!r.ok) throw new Error(); return await r.json() as BcbRow[]; })
      .then((rows) => {
        const points = rows.flatMap((row) => {
          const value = Number(row.valor?.replace(',', '.'));
          return row.data && Number.isFinite(value) ? [{ data: row.data, valor: value }] : [];
        });
        if (version === requestVersion.current) setDollarSeries(points);
      })
      .catch(() => {
        if (version === requestVersion.current) setDollarSeries([]);
        problems.push('Histórico do dólar: fonte do Banco Central temporariamente indisponível.');
      });
    const weatherJob = (async () => {
      const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(requestedCity)}&count=1&language=pt&format=json`);
      if (!geoResponse.ok) throw new Error();
      const geoData = record(await geoResponse.json());
      const location = (Array.isArray(geoData.results) ? geoData.results[0] : null) as GeoResult | null;
      if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') throw new Error();
      const forecastResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`);
      if (!forecastResponse.ok) throw new Error();
      const payload = await forecastResponse.json() as WeatherPayload;
      if (version === requestVersion.current) {
        setWeather(payload.current ?? null);
        setCity([location.name, location.admin1, location.country].filter(Boolean).join(', '));
      }
    })().catch(() => {
      if (version === requestVersion.current) setWeather(null);
      problems.push(`Clima de ${requestedCity}: localização ou serviço indisponível.`);
    });
    await Promise.all([currencyJob, bcbJob, dollarJob, weatherJob]);
    if (version !== requestVersion.current) return;
    setMetrics(nextMetrics);
    setErrors(problems);
    setUpdated(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    setLoading(false);
  }, []);

  useEffect(() => { void refresh('Feira de Santana'); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(city), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [city, refresh]);

  const submitCity = (event: React.FormEvent) => {
    event.preventDefault();
    const value = cityInput.trim();
    if (value) void refresh(value);
  };

  return (
    <section className="space-y-6" aria-labelledby="finance-title">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-mono-data uppercase tracking-[.16em] text-secondary">Painel ao vivo</p><h1 id="finance-title" className="mt-2 font-display text-3xl font-semibold">Finanças e clima</h1><p className="mt-2 text-sm text-muted-foreground">Cotações e condições atuais com fonte e data visíveis.</p></div>
        <Button onClick={() => void refresh(city)} disabled={loading} aria-busy={loading}><RefreshCw size={16} className={loading ? 'mr-2 animate-spin' : 'mr-2'} />{loading ? 'Atualizando…' : 'Atualizar'}</Button>
      </header>
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border bg-card p-5 shadow-sm" aria-labelledby="rates-title">
          <div className="flex items-center gap-2"><TrendingUp size={18} className="text-secondary" /><h2 id="rates-title" className="font-semibold">Indicadores</h2></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {metrics.map((item) => <article key={item.label} className="rounded-xl border bg-background p-4"><p className="text-sm text-muted-foreground">{item.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</p><p className="mt-2 text-xs text-muted-foreground">{item.source}{item.date ? ` · ${item.date}` : ''}</p></article>)}
            {!metrics.length && !loading && <p className="col-span-full rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Nenhum indicador disponível no momento.</p>}
          </div>
        </section>
        <section className="rounded-2xl border bg-card p-5 shadow-sm" aria-labelledby="weather-title">
          <div className="flex items-center gap-2"><CloudSun size={18} className="text-secondary" /><h2 id="weather-title" className="font-semibold">Clima</h2></div>
          <form onSubmit={submitCity} className="mt-4 flex gap-2"><label className="sr-only" htmlFor="weather-city">Cidade</label><input id="weather-city" value={cityInput} onChange={(event) => setCityInput(event.target.value)} className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" maxLength={80} /><Button type="submit" variant="outline" disabled={loading || !cityInput.trim()}>Buscar</Button></form>
          {weather && <div className="mt-5"><p className="text-sm text-muted-foreground">{city}</p><p className="mt-1 text-5xl font-semibold tabular-nums">{weather.temperature_2m ?? '—'}°</p><p className="mt-3 text-sm">Sensação {weather.apparent_temperature ?? '—'}° · Umidade {weather.relative_humidity_2m ?? '—'}% · Vento {weather.wind_speed_10m ?? '—'} km/h</p><p className="mt-3 text-xs text-muted-foreground">Open-Meteo · condições atuais</p></div>}
          {!weather && !loading && <p className="mt-5 text-sm text-muted-foreground">Clima indisponível para esta cidade.</p>}
        </section>
      </div>
      <section className="rounded-2xl border bg-card p-5 shadow-sm" aria-labelledby="dollar-title">
        <h2 id="dollar-title" className="font-semibold">Dólar comercial (venda) · últimos 30 dias úteis</h2>
        {dollarSeries.length > 1
          ? <svg viewBox="0 0 600 160" className="mt-4 h-40 w-full" role="img" aria-label="Variação recente do dólar"><polyline fill="none" stroke="currentColor" strokeWidth="2" className="text-secondary" points={sparkPoints(dollarSeries.map((d) => d.valor), 600, 160)} /></svg>
          : <p className="mt-4 text-sm text-muted-foreground">Histórico do dólar indisponível no momento.</p>}
        {dollarSeries.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Banco Central do Brasil · SGS 1 · {dollarSeries[0].data} a {dollarSeries.at(-1)?.data} · último: R$ {fmt(dollarSeries.at(-1)!.valor, 4)}</p>}
      </section>
      {errors.length > 0 && <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">{errors.join(' ')}</div>}
      <p className="text-xs text-muted-foreground" aria-live="polite">{updated ? `Atualizado às ${updated}. Fontes externas podem atrasar ou ficar indisponíveis.` : 'Buscando fontes externas…'}</p>
    </section>
  );
}
