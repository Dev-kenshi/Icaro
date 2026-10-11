import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { buscarFinancas, buscarTempo, fmt, iconeClima, reais, tendencia, type Financas, type Tempo } from '@/lib/ao-vivo';

const ORDEM = ['USD', 'EUR', 'UYU', 'ARS', 'BTC'];

/** Painel do lado esquerdo do palco: clima, câmbio, indicadores e dólar em 30 dias (como no ÍCARO v5). */
export function PainelAoVivo({ cidade, onClose }: { cidade: string; onClose: () => void }) {
  const [fin, setFin] = useState<Financas | null>(null);
  const [tempo, setTempo] = useState<Tempo | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    const carregar = () => {
      void buscarFinancas().then((f) => { if (vivo) { setFin(f); setErro(''); } }).catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Cotações indisponíveis.'); });
      void buscarTempo(cidade).then((t) => { if (vivo && t.cidade) setTempo(t); }).catch(() => undefined);
    };
    carregar();
    const timer = window.setInterval(carregar, 5 * 60_000);
    return () => { vivo = false; window.clearInterval(timer); };
  }, [cidade]);

  const moedas = ORDEM.map((c) => fin?.moedas.find((m) => m.codigo === c)).filter((m): m is NonNullable<typeof m> => !!m);
  const ix = fin?.indices ?? {};

  return (
    <aside className="painel-vivo" aria-label="Painel financeiro e clima" data-testid="painel-ao-vivo">
      <button type="button" className="painel-vivo__fechar" onClick={onClose} aria-label="Fechar painel"><X size={14} /></button>
      {tempo?.cidade && (
        <section className="dcard" data-testid="card-clima">
          <h5>CLIMA AGORA<span>Open-Meteo</span></h5>
          <div className="clima">
            <div className="graus">{fmt(tempo.atual, 0)}<sup>°C</sup></div>
            <div className="desc">
              <b>{iconeClima(tempo.codigo)} {tempo.cidade}</b>
              {tempo.desc}<br />
              máx {fmt(tempo.max, 0)}° · mín {fmt(tempo.min, 0)}°{tempo.umidade != null ? ` · umidade ${fmt(tempo.umidade, 0)}%` : ''}
              {tempo.chuva != null && <><br />chance de chuva {fmt(tempo.chuva, 0)}%</>}
            </div>
          </div>
        </section>
      )}
      {!fin && !erro && <section className="dcard"><h5>PAINEL FINANCEIRO</h5>Carregando cotações e clima…</section>}
      {erro && !fin && <section className="dcard" role="alert"><h5>PAINEL FINANCEIRO</h5>{erro}</section>}
      {moedas.length > 0 && (
        <section className="dcard" data-testid="card-cambio">
          <h5>CÂMBIO EM REAIS<span>AwesomeAPI</span></h5>
          <div className="kpis">
            {moedas.map((m) => {
              const t = tendencia(m.variacao);
              return (
                <div className="kpi" key={m.codigo} data-testid={`kpi-${m.codigo}`}>
                  <small>{m.nome}</small>
                  <b>{reais(m.valor)}</b>
                  <em className={t.classe}>{t.texto}</em>
                  {m.codigo === 'UYU' && m.valor > 0 && <em> · R$ 1 = {fmt(1 / m.valor, 2)} UYU</em>}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {(ix.selic || ix.ipca12 || ix.cdi) && (
        <section className="dcard">
          <h5>INDICADORES<span>BCB</span></h5>
          <div className="kpis">
            {ix.selic && <div className="kpi"><small>Selic (meta)</small><b>{fmt(ix.selic.valor, 2)}%</b><em>ao ano</em></div>}
            {ix.ipca12 && <div className="kpi"><small>IPCA 12 meses</small><b>{fmt(ix.ipca12.valor, 2)}%</b><em>{ix.ipca12.data}</em></div>}
            {ix.cdi && <div className="kpi"><small>CDI</small><b>{fmt(ix.cdi.valor, 2)}%</b><em>ao ano</em></div>}
          </div>
        </section>
      )}
      {fin && fin.serieDolar.length > 2 && <GraficoDolar serie={fin.serieDolar} />}
      {fin && <div className="fonte-dash">Atualizado {fin.atualizado}{fin.falhas.length ? ' · algumas fontes não responderam' : ''}. Valores informativos.</div>}
    </aside>
  );
}

/** Uma série, linha de 2 px; o cursor mostra o dia e o valor. */
function GraficoDolar({ serie }: { serie: Array<{ d: string; v: number }> }) {
  const [i, setI] = useState<number | null>(null);
  const vs = serie.map((p) => p.v), mn = Math.min(...vs), mx = Math.max(...vs), amp = (mx - mn) || 1;
  const X = (k: number) => 4 + k * (292 / (serie.length - 1)), Y = (v: number) => 8 + (1 - (v - mn) / amp) * 66;
  const d = serie.map((p, k) => `${k ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ');
  const padrao = `de ${reais(serie[0].v)} a ${reais(serie[serie.length - 1].v)} · mín ${reais(mn)} · máx ${reais(mx)}`;
  return (
    <section className="dcard">
      <h5>DÓLAR · 30 DIAS<span>R$</span></h5>
      <svg className="spark-dolar" viewBox="0 0 300 84" preserveAspectRatio="none" role="img" aria-label="Dólar nos últimos 30 dias"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setI(Math.max(0, Math.min(serie.length - 1, Math.round((e.clientX - r.left) / r.width * (serie.length - 1))))); }}
        onMouseLeave={() => setI(null)}>
        <defs><linearGradient id="gDol" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#4fd1ff" stopOpacity=".28" /><stop offset="1" stopColor="#4fd1ff" stopOpacity="0" /></linearGradient></defs>
        <path d={`${d} L${X(serie.length - 1).toFixed(1)} 80 L4 80 Z`} fill="url(#gDol)" />
        <path d={d} fill="none" stroke="#4fd1ff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {i !== null && <line x1={X(i)} x2={X(i)} y1={4} y2={80} stroke="#9fb3cc" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        {i !== null && <circle cx={X(i)} cy={Y(serie[i].v)} r={3.5} fill="#fff" stroke="#4fd1ff" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="spark-dica">{i !== null ? `${serie[i].d}: ${reais(serie[i].v)}` : padrao}</div>
    </section>
  );
}
