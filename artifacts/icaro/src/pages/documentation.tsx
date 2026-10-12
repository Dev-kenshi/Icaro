import { useEffect, useMemo, useState } from 'react';
import MarkdownIt from 'markdown-it';
import { BookOpen, ChevronRight, FileText } from 'lucide-react';
import readme from '../../../../docs/README.md?raw';
import apiReference from '../../../../docs/API-REFERENCE.md?raw';
import architecture from '../../../../docs/ARQUITETURA-ADS.md?raw';
import codeMap from '../../../../docs/MAPA-DO-CODIGO.md?raw';

const documents = [
  { id: 'guide', title: 'Comece por aqui', description: 'Índice e orientação de leitura', source: readme },
  { id: 'api', title: 'Referência da API', description: 'Rotas, acesso, dados e respostas', source: apiReference },
  { id: 'architecture', title: 'Arquitetura e ADS', description: 'Cascata, cronologia e conceitos', source: architecture },
  { id: 'code', title: 'Mapa do código', description: 'Módulos e pontos de entrada', source: codeMap },
] as const;

type DocumentId = (typeof documents)[number]['id'];
const documentIds = new Set<string>(documents.map((document) => document.id));
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });

function readDocumentId(): DocumentId {
  const requested = new URLSearchParams(window.location.search).get('doc');
  return documentIds.has(requested ?? '')
    ? (requested as DocumentId)
    : 'guide';
}

function renderMarkdown(source: string) {
  return source
    .replace(/\]\((?:\.\/)?API-REFERENCE\.md(#[^)]+)?\)/g, '](?doc=api$1)')
    .replace(/\]\((?:\.\/)?ARQUITETURA-ADS\.md(#[^)]+)?\)/g, '](?doc=architecture$1)')
    .replace(/\]\((?:\.\/)?MAPA-DO-CODIGO\.md(#[^)]+)?\)/g, '](?doc=code$1)');
}

export default function Documentation() {
  const [activeId, setActiveId] = useState<DocumentId>(readDocumentId);
  const activeDocument = documents.find((document) => document.id === activeId) ?? documents[0];
  const html = useMemo(
    () => markdown.render(renderMarkdown(activeDocument.source)),
    [activeDocument.source],
  );

  useEffect(() => {
    document.title = `${activeDocument.title} · Documentação Ícaro`;
  }, [activeDocument.title]);

  useEffect(() => {
    const restoreFromHistory = () => setActiveId(readDocumentId());
    window.addEventListener('popstate', restoreFromHistory);
    return () => window.removeEventListener('popstate', restoreFromHistory);
  }, []);

  const selectDocument = (id: DocumentId) => {
    const url = new URL(window.location.href);
    url.searchParams.set('doc', id);
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setActiveId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDocumentLink = (event: React.MouseEvent<HTMLElement>) => {
    const anchor = (event.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (!href?.startsWith('?doc=')) return;
    const requested = new URLSearchParams(href.slice(1)).get('doc');
    if (!requested || !documentIds.has(requested)) return;
    event.preventDefault();
    selectDocument(requested as DocumentId);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="page-documentation">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <BookOpen size={23} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Central de conhecimento</p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">Documentação do Ícaro</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Arquitetura, fluxo de execução, rotas da API e mapa dos módulos — dentro do aplicativo e sincronizados com os guias do projeto.
            </p>
          </div>
        </div>

        <nav className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Seções da documentação">
          {documents.map((document) => {
            const selected = activeId === document.id;
            return (
              <button
                key={document.id}
                type="button"
                onClick={() => selectDocument(document.id)}
                aria-pressed={selected}
                className={`flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${
                  selected
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border bg-background/60 text-muted-foreground hover:border-primary/30 hover:bg-muted/60 hover:text-foreground'
                }`}
                data-testid={`button-doc-${document.id}`}
              >
                <FileText size={17} className={selected ? 'text-primary' : 'shrink-0'} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{document.title}</span>
                  <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{document.description}</span>
                </span>
                <ChevronRight size={15} className={selected ? 'text-primary' : 'opacity-40'} />
              </button>
            );
          })}
        </nav>
      </section>

      <article
        className="documentation-content rounded-3xl border border-border bg-card px-5 py-6 shadow-sm sm:px-8 sm:py-9"
        aria-label={activeDocument.title}
        onClick={handleDocumentLink}
      >
        <div
          className="prose prose-sm max-w-none prose-headings:font-display prose-headings:tracking-tight prose-a:text-primary prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-pre:overflow-x-auto prose-pre:rounded-2xl prose-pre:border prose-pre:border-border prose-pre:bg-slate-950 prose-pre:text-slate-100 prose-th:text-foreground prose-td:text-muted-foreground sm:prose-base"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </div>
  );
}
