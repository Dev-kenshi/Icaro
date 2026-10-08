import { useMemo, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, Brackets, FileSpreadsheet, Hash, Rows3, Search, WandSparkles, X } from 'lucide-react';
import { Link } from 'wouter';
import { useDataset } from '@/lib/dataset-context';

export default function Analysis() {
  const { dataset } = useDataset();
  const [activeTab, setActiveTab] = useState<'table' | 'profile'>('table');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);
  const pageSize = 15;
  const filteredRows = useMemo(() => {
    if (!dataset) return [];
    const rows = dataset.rows.filter((row) => !search || Object.values(row).some((value) => value?.toLowerCase().includes(search.toLowerCase())));
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const left = a[sort.column] ?? '';
      const right = b[sort.column] ?? '';
      return sort.direction === 'asc' ? left.localeCompare(right, 'pt-BR', { numeric: true }) : right.localeCompare(left, 'pt-BR', { numeric: true });
    });
  }, [dataset, search, sort]);
  const visibleRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize);

  const changeSort = (column: string) => {
    setPage(0);
    setSort((current) => current?.column === column ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { column, direction: 'asc' });
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = ['table', 'profile'] as const;
    const currentIndex = tabs.indexOf(activeTab);
    const nextTab = event.key === 'Home'
      ? tabs[0]
      : event.key === 'End'
        ? tabs[tabs.length - 1]
        : tabs[(currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    setActiveTab(nextTab);
    document.getElementById(`analysis-tab-${nextTab}`)?.focus();
  };

  return <div className="space-y-8">
    <header className="animate-rise flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="eyebrow mb-3">Exploração / leitura local</div><h1 className="font-display text-5xl leading-none text-primary">Conheça o terreno.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Tabela, tipos e completude calculados direto no seu navegador. Sem amostra inventada para preencher a tela.</p></div>{dataset && <div className="rounded-xl border border-secondary/25 bg-secondary/10 px-4 py-3 text-right"><div className="font-mono-data text-xs font-bold text-primary">{dataset.name}</div><div className="mt-1 text-[11px] text-muted-foreground">{dataset.summary}</div></div>}</header>
     {!dataset ? <EmptyAnalysis /> : <><section className="grid gap-3 sm:grid-cols-3"><Stat label="Registros" value={dataset.rows.length.toLocaleString('pt-BR')} icon={Rows3} /><Stat label="Campos numéricos" value={dataset.stats.numericColumns.length.toString()} icon={Hash} /><Stat label="Células vazias" value={Object.values(dataset.stats.missingByColumn).reduce((a, b) => a + b, 0).toLocaleString('pt-BR')} icon={Brackets} /></section>
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
          <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Modo de exploração"><button id="analysis-tab-table" type="button" role="tab" aria-controls="analysis-panel-table" aria-selected={activeTab === 'table'} tabIndex={activeTab === 'table' ? 0 : -1} onKeyDown={handleTabKeyDown} onClick={() => setActiveTab('table')} className={`rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === 'table' ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground'}`} data-testid="button-tab-table">Tabela</button><button id="analysis-tab-profile" type="button" role="tab" aria-controls="analysis-panel-profile" aria-selected={activeTab === 'profile'} tabIndex={activeTab === 'profile' ? 0 : -1} onKeyDown={handleTabKeyDown} onClick={() => setActiveTab('profile')} className={`rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === 'profile' ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground'}`} data-testid="button-tab-profile">Perfil das colunas</button></div>{activeTab === 'table' && <div className="flex w-full items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 sm:w-72"><Search size={15} aria-hidden="true" className="shrink-0 text-muted-foreground" /><label className="sr-only" htmlFor="analysis-row-search">Filtrar registros da tabela</label><input id="analysis-row-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} className="w-full bg-transparent text-xs outline-none" placeholder="Filtrar registros…" data-testid="input-search-rows" />{search && <button type="button" onClick={() => { setSearch(''); setPage(0); }} className="rounded p-1 text-muted-foreground hover:text-primary" aria-label="Limpar filtro" data-testid="button-clear-search"><X size={14} aria-hidden="true" /></button>}</div>}</div>
         {activeTab === 'table' ? <div id="analysis-panel-table" role="tabpanel" aria-labelledby="analysis-tab-table" tabIndex={0} className="outline-none"><TableView columns={dataset.columns} rows={visibleRows} total={filteredRows.length} rowCount={dataset.rows.length} page={page} pageSize={pageSize} sort={sort} onSort={changeSort} onPage={setPage} /></div> : <div id="analysis-panel-profile" role="tabpanel" aria-labelledby="analysis-tab-profile" tabIndex={0} className="outline-none"><ProfileView /></div>}
      </section>
       <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/10 p-4 text-xs leading-5 text-primary"><WandSparkles size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-foreground" /><span><strong>Próximo passo:</strong> quando quiser uma leitura contextual, leve esta base ao <Link href="/assistant" className="font-semibold underline underline-offset-2" data-testid="link-analysis-assistant">copiloto</Link>. Ao enviar uma pergunta, os nomes das colunas e uma amostra de até 50 linhas serão enviados para análise.</span></div>
    </>}
  </div>;

  function ProfileView() {
    return <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{dataset?.columns.map((column) => { const missing = dataset.stats.missingByColumn[column] ?? 0; const numeric = dataset.stats.numericSummary[column]; const completeness = dataset.rows.length ? ((dataset.rows.length - missing) / dataset.rows.length) * 100 : 0; return <div key={column} className="rounded-xl border border-border bg-background p-4" data-testid={`card-profile-${column}`}><div className="flex items-center justify-between gap-3"><span className="truncate font-semibold text-primary">{column}</span><span className="rounded-md bg-muted px-2 py-1 font-mono-data text-[10px] text-muted-foreground">{numeric ? 'numérico' : 'texto'}</span></div><div className="mt-5 space-y-2 text-xs text-muted-foreground"><div className="flex justify-between"><span>Preenchidos</span><span className="font-mono-data font-bold text-primary">{dataset.rows.length - missing}</span></div><div className="h-1.5 rounded-full bg-muted"><div className={`h-full rounded-full ${missing ? 'bg-accent' : 'bg-secondary'}`} style={{ width: `${completeness}%` }} /></div><div className="flex justify-between"><span>Vazios</span><span className="font-mono-data text-primary">{missing}</span></div>{numeric && <div className="border-t border-border pt-2">média <strong className="text-primary">{numeric.average.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</strong></div>}</div></div>; })}</div>;
  }
}

function EmptyAnalysis() {
  return <div className="panel-grid rounded-2xl border border-border bg-card p-8 shadow-xs sm:p-14"><div className="max-w-xl"><div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-secondary/15 text-secondary"><FileSpreadsheet size={23} /></div><div className="eyebrow text-secondary">Nenhum CSV importado</div><h2 className="mt-2 font-display text-4xl leading-none text-primary">A análise começa no arquivo.</h2><p className="mt-4 text-sm leading-6 text-muted-foreground">Selecione “Importar CSV” no menu. Ícaro vai ler cabeçalhos e registros localmente, preservando valores vazios para uma leitura fiel ao arquivo.</p></div></div>;
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Rows3 }) {
  return <div className="rounded-2xl border border-border bg-card p-5 shadow-xs"><div className="flex justify-between"><span className="eyebrow">{label}</span><Icon size={17} className="text-secondary" /></div><div className="mt-4 font-mono-data text-3xl font-bold text-primary">{value}</div></div>;
}

function TableView({ columns, rows, total, rowCount, page, pageSize, sort, onSort, onPage }: { columns: string[]; rows: Record<string, string | null>[]; total: number; rowCount: number; page: number; pageSize: number; sort: { column: string; direction: 'asc' | 'desc' } | null; onSort: (column: string) => void; onPage: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return <><div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left text-xs"><caption className="sr-only">Registros do arquivo; selecione um cabeçalho para ordenar a tabela.</caption><thead className="bg-muted/50"><tr><th scope="col" className="w-16 px-4 py-3 font-mono-data text-[10px] uppercase tracking-wider text-muted-foreground">#</th>{columns.map((column) => <th key={column} scope="col" aria-sort={sort?.column === column ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-4 py-3 font-mono-data text-[10px] uppercase tracking-wider text-muted-foreground"><button type="button" onClick={() => onSort(column)} aria-label={`Ordenar por ${column}${sort?.column === column ? `, ${sort.direction === 'asc' ? 'crescente' : 'decrescente'}` : ''}`} className="inline-flex items-center gap-1 hover:text-primary" data-testid={`button-sort-${column}`}>{column}{sort?.column === column ? (sort.direction === 'asc' ? <ArrowUp size={11} aria-hidden="true" /> : <ArrowDown size={11} aria-hidden="true" />) : null}</button></th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${page}-${index}`} className="border-t border-border/70 hover:bg-muted/30" data-testid={`row-data-${page * pageSize + index}`}><td className="px-4 py-3 font-mono-data text-[10px] text-muted-foreground">{page * pageSize + index + 1}</td>{columns.map((column) => <td key={column} className={`max-w-[220px] truncate px-4 py-3 ${row[column] === null ? 'font-mono-data text-[10px] text-accent-foreground' : 'text-foreground/80'}`}>{row[column] ?? 'vazio'}</td>)}</tr>) : <tr><td colSpan={columns.length + 1} className="px-4 py-16 text-center text-muted-foreground" role="status">{rowCount === 0 ? 'O arquivo não contém registros.' : 'Nenhuma linha corresponde ao filtro. Ajuste ou limpe a busca.'}</td></tr>}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3"><span className="font-mono-data text-[10px] text-muted-foreground" aria-live="polite">{total.toLocaleString('pt-BR')} linhas encontradas · página {page + 1} de {totalPages}</span><div className="flex items-center gap-2"><button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-40" data-testid="button-page-prev">Anterior</button><button type="button" disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-40" data-testid="button-page-next">Próxima</button></div></div></>;
}
