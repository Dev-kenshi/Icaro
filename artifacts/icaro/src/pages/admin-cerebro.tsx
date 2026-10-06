import { useCallback, useEffect, useState } from "react";
import { Activity, Check, RefreshCw, Trash2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/components/login/login-gate";

type LayerKey = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
type Stats = {
  total: number;
  byLayer: Record<LayerKey, { count: number; percent: number }>;
  tokensSpent: number;
  tokensSaved: number;
  daily: Array<{ date: string; noAiPercent: number; total: number }>;
};
type Candidate = {
  id: string;
  question: string;
  answer: string;
  layer: "L5" | "L6";
  provider: string;
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
  status: "pending";
};

const layerLabels: Record<LayerKey, string> = {
  L1: "Resposta exata",
  L2: "Banco local",
  L3: "Semântica",
  L4: "Base de conhecimento",
  L5: "Composição curta",
  L6: "Resposta completa",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `Falha ao carregar dados (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export default function AdminCerebro() {
  const user = useAuthUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (user?.role !== "admin") {
      setError("Acesso restrito a administradores.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextStats, nextCandidates] = await Promise.all([
        requestJson<Stats>("/api/ask/stats"),
        requestJson<Candidate[]>("/api/admin/cerebro/candidates"),
      ]);
      setStats(nextStats);
      setCandidates(nextCandidates);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => { void refresh(); }, [refresh]);

  const reviewCandidate = async (candidate: Candidate, action: "bank" | "base" | "discard") => {
    if (action === "discard" && !window.confirm(`Descartar esta resposta candidata?\n\n“${candidate.question.slice(0, 180)}”\n\nEssa ação não pode ser desfeita.`)) return;
    setBusyId(candidate.id);
    setError(null);
    setNotice(null);
    try {
      if (action === "discard") {
        await requestJson(`/api/admin/cerebro/candidates/${candidate.id}`, { method: "DELETE" });
      } else {
        await requestJson(`/api/admin/cerebro/candidates/${candidate.id}/approve`, {
          method: "POST",
          body: JSON.stringify({ destination: action }),
        });
      }
      setNotice(action === "discard" ? "Resposta candidata descartada." : action === "bank" ? "Resposta aprovada no banco local." : "Resposta aprovada na base.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível revisar a resposta.");
    } finally {
      setBusyId(null);
    }
  };

  const chartData = (stats?.daily ?? []).map((day) => ({
    ...day,
    label: new Date(`${day.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
  }));

  return (
    <div className="space-y-8" data-testid="page-admin-cerebro">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-mono-data uppercase tracking-[.18em] text-secondary">
            <Activity size={14} /> Administração · Ícaro
          </div>
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Cérebro em camadas</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Acompanhe respostas sem IA, uso de tokens e revise respostas pendentes antes de adicioná-las à base local.
          </p>
        </div>
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading} aria-busy={loading} className="gap-2">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar
        </Button>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" data-testid="status-admin-error">
          <span>{error}</span><Button type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>Tentar novamente</Button>
        </div>
      )}
      {notice && <div role="status" aria-live="polite" className="rounded-xl border border-secondary/30 bg-secondary/10 p-3 text-sm text-primary" data-testid="status-admin-success">{notice}</div>}

        {loading && !stats ? (
        <div role="status" aria-live="polite" className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">Carregando indicadores e respostas pendentes…</div>
      ) : stats ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores do cérebro">
            <Metric label="Perguntas processadas" value={stats.total.toLocaleString("pt-BR")} />
            <Metric label="Tokens gastos" value={stats.tokensSpent.toLocaleString("pt-BR")} />
            <Metric label="Tokens economizados" value={stats.tokensSaved.toLocaleString("pt-BR")} />
            <Metric label="Respostas para revisar" value={candidates.length.toLocaleString("pt-BR")} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="mb-5">
                <h2 className="font-display text-2xl">Respostas sem IA</h2>
                <p className="mt-1 text-xs text-muted-foreground">Percentual diário resolvido nas camadas L1–L4</p>
              </div>
              {chartData.length ? (
                <div className="h-64 w-full" role="img" aria-label="Linha diária do percentual de respostas sem IA">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "Sem IA"]} labelFormatter={(label) => `Dia ${label}`} />
                      <Line type="monotone" dataKey="noAiPercent" name="Sem IA" stroke="#61A9BD" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="grid h-64 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                  Ainda não há dados para mostrar.
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h2 className="font-display text-2xl">Distribuição por camada</h2>
              <div className="mt-5 space-y-4">
                {(Object.keys(layerLabels) as LayerKey[]).map((layer) => {
                  const value = stats.byLayer[layer];
                  return (
                    <div key={layer}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className="font-medium">{layer} · {layerLabels[layer]}</span>
                        <span className="font-mono-data text-muted-foreground">{value.count} · {value.percent.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-secondary transition-[width]" style={{ width: `${Math.min(100, value.percent)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl">Respostas para revisão</h2>
                <p className="mt-1 text-sm text-muted-foreground">Respostas geradas sem identificadores pessoais detectáveis.</p>
              </div>
              <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{candidates.length} pendentes</span>
            </div>
            {candidates.length ? candidates.map((candidate) => (
              <article key={candidate.id} className="rounded-2xl border border-border bg-card p-5 sm:p-6" data-testid={`candidate-${candidate.id}`}>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-data uppercase tracking-wider text-muted-foreground">
                  <span>{candidate.layer}</span><span>·</span><span>{candidate.provider}</span><span>·</span><span>{candidate.count} ocorrência(s)</span>
                </div>
                <h3 className="mt-3 font-semibold leading-6">{candidate.question}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{candidate.answer}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void reviewCandidate(candidate, "bank")} disabled={busyId === candidate.id} className="gap-1.5">
                    <Check size={14} /> Aprovar no banco local
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void reviewCandidate(candidate, "base")} disabled={busyId === candidate.id}>
                    Aprovar na base
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void reviewCandidate(candidate, "discard")} disabled={busyId === candidate.id} className="gap-1.5 text-destructive hover:text-destructive">
                    <Trash2 size={14} /> Descartar
                  </Button>
                </div>
              </article>
            )) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nenhuma resposta aguardando revisão.
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-3xl tabular-nums">{value}</div>
    </div>
  );
}