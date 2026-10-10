import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarPlus, Download, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthUser } from '@/components/login/login-gate';
import { parseAgendaEntries, serializeCalendar, type AgendaEntry } from '@/lib/agenda-format';

const STORAGE_PREFIX = 'icaro-v5-agenda:';

function readEntries(key: string): Entry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return parseAgendaEntries(value);
  } catch { return []; }
}

export default function Agenda() {
  const user = useAuthUser();
  const storageKey = `${STORAGE_PREFIX}${user?.username ?? 'guest'}`;
  const [entries, setEntries] = useState<Entry[]>(() => readEntries(storageKey));
  const previousStorageKey = useRef(storageKey);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [recurrence, setRecurrence] = useState<AgendaEntry['recurrence']>('none');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (previousStorageKey.current !== storageKey) {
      previousStorageKey.current = storageKey;
      setEntries(readEntries(storageKey));
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(entries));
  }, [entries, storageKey]);
  const ordered = useMemo(() => [...entries].sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [entries]);

  const addEntry = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !startsAt || Number.isNaN(new Date(startsAt).getTime())) {
      setError('Informe um título e uma data/hora válidos.');
      return;
    }
    setError('');
    const entry: AgendaEntry = { id: editingId ?? crypto.randomUUID(), title: title.trim(), startsAt, recurrence };
    setEntries((current) => editingId
      ? current.map((item) => item.id === editingId ? entry : item)
      : [...current, entry]);
    setTitle('');
    setStartsAt('');
    setRecurrence('none');
    setEditingId(null);
  };

  const exportIcs = () => {
    const blob = new Blob([serializeCalendar(ordered)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agenda-icaro.ics';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="mx-auto max-w-4xl space-y-6" aria-labelledby="agenda-title">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-mono-data uppercase tracking-[.16em] text-secondary">Organização pessoal</p><h1 id="agenda-title" className="mt-2 font-display text-3xl font-semibold">Agenda e rotinas</h1><p className="mt-2 text-sm text-muted-foreground">Os itens ficam neste navegador e perfil. Exporte para levar ao seu calendário.</p></div>
        <Button type="button" variant="outline" onClick={exportIcs} disabled={!entries.length}><Download size={16} className="mr-2" />Exportar .ics</Button>
      </header>
      <form onSubmit={addEntry} className="grid gap-3 rounded-2xl border bg-card p-5 sm:grid-cols-2" aria-label="Criar compromisso ou rotina">
        <label className="space-y-1 text-sm font-medium sm:col-span-2">Título<input className="mt-1 w-full rounded-lg border bg-background px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label>
        <label className="space-y-1 text-sm font-medium">Data e hora<input type="datetime-local" className="mt-1 w-full rounded-lg border bg-background px-3 py-2" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label>
        <label className="space-y-1 text-sm font-medium">Repetição<select className="mt-1 w-full rounded-lg border bg-background px-3 py-2" value={recurrence} onChange={(event) => setRecurrence(event.target.value as AgendaEntry['recurrence'])}><option value="none">Não repetir</option><option value="daily">Todos os dias</option><option value="weekly">Toda semana</option></select></label>
        {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
        <div className="flex gap-2 sm:col-span-2"><Button type="submit"><CalendarPlus size={16} className="mr-2" />{editingId ? 'Salvar alterações' : 'Adicionar'}</Button>{editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setTitle(''); setStartsAt(''); setRecurrence('none'); setError(''); }}>Cancelar</Button>}</div>
      </form>
      <div className="space-y-3" aria-live="polite">
        {ordered.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Ainda não há compromissos ou rotinas.</p>}
        {ordered.map((entry) => <article key={entry.id} className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4"><div className="min-w-0"><h2 className="truncate font-semibold">{entry.title}</h2><p className="mt-1 text-sm text-muted-foreground">{new Date(entry.startsAt).toLocaleString('pt-BR')} · {entry.recurrence === 'daily' ? 'diariamente' : entry.recurrence === 'weekly' ? 'semanalmente' : 'único'}</p></div><div className="flex shrink-0"><Button type="button" variant="ghost" size="icon" aria-label={`Editar ${entry.title}`} onClick={() => { setEditingId(entry.id); setTitle(entry.title); setStartsAt(entry.startsAt); setRecurrence(entry.recurrence); setError(''); }}><Pencil size={17} /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Excluir ${entry.title}`} onClick={() => setEntries((current) => current.filter((item) => item.id !== entry.id))}><Trash2 size={17} /></Button></div></article>)}
      </div>
    </section>
  );
}
