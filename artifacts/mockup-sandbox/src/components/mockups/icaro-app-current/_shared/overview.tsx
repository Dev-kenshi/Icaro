import { ArrowRight, BarChart3, CheckCircle2, FileText, ScanSearch, Sparkles, Table2, TrendingUp } from 'lucide-react';
import { Link } from './router';
import { useDataset } from '@/lib/dataset-context';

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
}

export default function Overview() {
  const { dataset } = useDataset();
  const numericEntries = dataset ? Object.entries(dataset.stats.numericSummary) : [];
  const strongest = numericEntries[0];
  const completeness = dataset ? Math.round(((dataset.rows.length * dataset.columns.length - Object.values(dataset.stats.missingByColumn).reduce((a, b) => a + b, 0)) / (dataset.rows.length * dataset.columns.length)) * 100) : 0;

  return (
    <div className="space-y-8">
      <section className="animate-rise flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <div className="eyebrow mb-3">Visão geral / inteligência operacional</div>
          <h1 className="max-w-3xl font-display text-5xl leading-[.92] tracking-tight text-primary sm:text-6xl">Do arquivo bruto ao próximo movimento.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">Ícaro organiza o que está no seu CSV para você enxergar padrões, lacunas e decisões possíveis, sem inventar o que os dados não dizem.</p>
        </div>
        <Link href="/analysis" className="group inline-flex shrink-0 items-center gap-2 rounded-xl border border-primary/15 bg-card px-4 py-3 text-sm font-semibold text-primary shadow-xs transition hover:-translate-y-0.5 hover:border-secondary" data-testid="link-open-analysis">
          <ScanSearch size={16} /> Abrir exploração <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
        </Link>
      </section>

      {!dataset ? (
        <section className="panel-grid relative overflow-hidden rounded-2xl border border-border bg-card p-7 shadow-sm sm:p-12" data-testid="empty-overview">
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-secondary/10 blur-3xl" />
          <div className="relative max-w-2xl">
            <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-secondary/15 text-secondary"><FileText size={23} /></div>
            <div className="eyebrow mb-3 text-secondary">Primeiro passo</div>
            <h2 className="font-display text-4xl leading-none text-primary">Traga um CSV para dentro.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Comece com uma exportação de vendas, atendimento, operações ou qualquer tabela que você conhece. A leitura acontece no navegador; nada é enviado até você pedir uma análise ao copiloto.</p>
            <div className="mt-7 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {['Cabeçalho reconhecido', 'Valores vazios identificados', 'Colunas numéricas classificadas'].map((item) => <span key={item} className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2"><CheckCircle2 size={14} className="text-secondary" />{item}</span>)}
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Linhas observadas" value={dataset.rows.length.toLocaleString('pt-BR')} detail={dataset.name} icon={Table2} />
            <MetricCard label="Colunas lidas" value={dataset.columns.length.toString()} detail={`${dataset.stats.numericColumns.length} numéricas`} icon={BarChart3} />
            <MetricCard label="Completude" value={`${completeness}%`} detail="células preenchidas" icon={CheckCircle2} />
            <MetricCard label="Campos numéricos" value={dataset.stats.numericColumns.length.toString()} detail={dataset.stats.textColumns.length ? `${dataset.stats.textColumns.length} categóricos` : 'nenhum categórico'} icon={TrendingUp} />
          </section>
          <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-xs sm:p-7">
              <div className="flex items-start justify-between gap-4"><div><div className="eyebrow">Leitura do arquivo</div><h2 className="mt-2 font-display text-3xl text-primary">O que já sabemos</h2></div><Sparkles size={20} className="text-accent" /></div>
              <p className="mt-5 max-w-2xl text-[15px] leading-7 text-muted-foreground">{dataset.summary} A exploração abaixo parte exclusivamente das linhas carregadas, sem preenchimentos ou inferências silenciosas.</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <InfoRow label="Primeira coluna" value={dataset.columns[0] ?? 'Não disponível'} />
                <InfoRow label="Última coluna" value={dataset.columns.at(-1) ?? 'Não disponível'} />
                <InfoRow label="Maior volume vazio" value={Object.entries(dataset.stats.missingByColumn).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Nenhum'} />
                <InfoRow label="Amostra para IA" value={`${Math.min(dataset.rows.length, 50)} linhas selecionáveis`} />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-primary p-6 text-primary-foreground shadow-md sm:p-7">
              <div className="eyebrow text-primary-foreground/50">Ponto de partida</div>
              <h2 className="mt-2 font-display text-3xl">Uma pergunta boa vem depois da leitura.</h2>
              {strongest ? <p className="mt-4 text-sm leading-6 text-primary-foreground/70">A coluna <strong className="text-secondary">{strongest[0]}</strong> é o primeiro campo quantitativo encontrado. Veja escala, dispersão e valores ausentes antes de pedir uma interpretação.</p> : <p className="mt-4 text-sm leading-6 text-primary-foreground/70">Este arquivo não tem uma coluna numérica clara. Use a exploração para entender categorias, preenchimento e recortes antes de decidir o próximo passo.</p>}
              <Link href="/assistant" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-secondary hover:text-accent" data-testid="link-ask-copilot">Perguntar ao copiloto <ArrowRight size={15} /></Link>
            </div>
          </section>
          {numericEntries.length > 0 && <section className="rounded-2xl border border-border bg-card p-6 shadow-xs sm:p-7"><div className="flex items-end justify-between"><div><div className="eyebrow">Campos quantitativos</div><h2 className="mt-2 font-display text-3xl text-primary">Amplitude por coluna</h2></div><Link href="/analysis" className="text-xs font-semibold text-secondary hover:text-primary" data-testid="link-see-all-stats">Ver análise completa <ArrowRight size={13} className="ml-1 inline" /></Link></div><div className="mt-7 grid gap-6 md:grid-cols-2">{numericEntries.slice(0, 4).map(([column, stats]) => <RangeBar key={column} column={column} stats={stats} />)}</div></section>}
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof BarChart3 }) {
  return <div className="rounded-2xl border border-border bg-card p-5 shadow-xs transition hover:-translate-y-0.5 hover:shadow-sm" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-center justify-between"><span className="eyebrow">{label}</span><Icon size={17} className="text-secondary" /></div><div className="mt-4 font-mono-data text-3xl font-bold tracking-tight text-primary">{value}</div><div className="mt-2 truncate text-xs text-muted-foreground">{detail}</div></div>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/60 px-4 py-3"><div className="text-[11px] text-muted-foreground">{label}</div><div className="mt-1 truncate font-mono-data text-xs font-bold text-primary">{value}</div></div>;
}

function RangeBar({ column, stats }: { column: string; stats: { min: number; max: number; average: number } }) {
  const span = stats.max - stats.min || 1;
  const averagePosition = ((stats.average - stats.min) / span) * 100;
  return <div data-testid={`chart-range-${column}`}><div className="flex justify-between gap-3 text-sm"><span className="truncate font-semibold text-primary">{column}</span><span className="font-mono-data text-xs text-muted-foreground">média {formatNumber(stats.average)}</span></div><div className="relative mt-3 h-2 rounded-full bg-muted"><div className="absolute inset-y-0 left-0 rounded-full bg-secondary/70" style={{ width: `${Math.max(4, averagePosition)}%` }} /><div className="absolute -top-1 h-4 w-1 rounded-full bg-primary" style={{ left: `calc(${averagePosition}% - 2px)` }} /></div><div className="mt-2 flex justify-between font-mono-data text-[10px] text-muted-foreground"><span>{formatNumber(stats.min)}</span><span>{formatNumber(stats.max)}</span></div></div>;
}
