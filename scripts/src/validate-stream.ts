// Valida o streaming do palco (/api/ai/chat/stream) sem chave real: a Groq é simulada
// com pedaços que chegam aos poucos. Mede quando cada evento chega ao cliente.
//   pnpm --filter @workspace/scripts run validate:stream
process.env.SESSION_SECRET ||= "teste-stream-" + "x".repeat(32);
process.env.ICARO_USER1_CODE ||= "codigo-teste";
process.env.GROQ_API_KEY = "gsk_falsa_para_teste";
delete process.env.GROQ_MODEL; // padrão: openai/gpt-oss-120b (modelo de raciocínio)

const realFetch = globalThis.fetch;
const groqBodies: Array<Record<string, unknown>> = [];
let upstreamAborted = false;
let rejectReasoningParams = false;
const PIECES = ["Canberra é ", "a capital. ", "Muita gente ", "chuta Sydney. ", "Anota isso: ", "capital não é ", "a maior cidade."];

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url instanceof Request ? url.url : url);
  if (!u.startsWith("https://api.groq.com/")) return realFetch(url, init);
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
  groqBodies.push(body);
  if (rejectReasoningParams && "reasoning_effort" in body) {
    return new Response(JSON.stringify({ error: { code: "invalid_request" } }), { status: 400 });
  }
  const signal = init?.signal;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      for (const p of PIECES) {
        await new Promise((r) => setTimeout(r, 120));
        if (signal?.aborted) { upstreamAborted = true; c.error(new DOMException("abort", "AbortError")); return; }
        c.enqueue(enc.encode(`data: ${JSON.stringify({ model: body.model, choices: [{ delta: { content: p } }] })}\n\n`));
      }
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}) as typeof fetch;

const { default: app } = await import("../../artifacts/api-server/src/app");
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const port = (server.address() as { port: number }).port;
const API = `http://127.0.0.1:${port}/api`;

let failed = 0, passed = 0;
const check = (cond: unknown, msg: string) => { if (cond) { passed++; console.log("  ok  ", msg); } else { failed++; console.log("  FALHA", msg); } };

const login = await realFetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "user1", password: process.env.ICARO_USER1_CODE }) });
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
check(login.ok && cookie, "login");

type Ev = { event: string; data: Record<string, unknown>; at: number };
async function stream(question: string, abortAfterDeltas = 0) {
  const ctl = new AbortController();
  const t0 = performance.now();
  const r = await realFetch(`${API}/ai/chat/stream`, {
    method: "POST", signal: ctl.signal,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ provider: "groq", persona: "icaro", question, history: [], dataset: null }),
  });
  const evs: Ev[] = [];
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(block)?.[1] ?? "message";
        const data = JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? "{}");
        evs.push({ event: ev, data, at: performance.now() - t0 });
        if (abortAfterDeltas && evs.filter((e) => e.event === "delta").length >= abortAfterDeltas) { ctl.abort(); throw new Error("abortado"); }
      }
    }
  } catch { /* abort esperado no teste de interrupção */ }
  return { status: r.status, type: r.headers.get("content-type") || "", evs };
}
const first = (evs: Ev[], e: string) => evs.find((x) => x.event === e);

console.log("1. Pergunta nova → IA em streaming");
const a = await stream("qual a capital da Austrália?");
const meta = first(a.evs, "meta"), d1 = first(a.evs, "delta"), done = first(a.evs, "done");
check(a.status === 200 && a.type.startsWith("text/event-stream"), "responde text/event-stream");
check(meta && meta.data.fonte === "ia" && meta.at < 300, `meta 'ia' chega em ${meta?.at.toFixed(0)} ms (< 300)`);
check(d1 && d1.at < 400, `1º pedaço chega em ${d1?.at.toFixed(0)} ms, antes da resposta inteira (${done?.at.toFixed(0)} ms)`);
check(a.evs.filter((e) => e.event === "delta").length === PIECES.length, "um evento delta por pedaço da Groq");
check(done && done.data.answer === PIECES.join("").trim() && done.data.fonte === "ia", "done traz a resposta completa e fonte ia");
const body = groqBodies.at(-1)!;
check(body.stream === true, "pede stream: true à Groq");
check(body.reasoning_effort === "low" && body.include_reasoning === false, "gpt-oss com reasoning_effort low (pensa pouco, fala rápido)");
check(String((body.messages as Array<{ content: string }>)[0].content).includes("apresentador de palco"), "persona de apresentador no system prompt");

console.log("2. Pergunta do banco → local, sem IA");
const n = groqBodies.length;
const b = await stream("quem foi Maria Quitéria?");
check(first(b.evs, "meta")?.data.fonte === "banco" && first(b.evs, "done")?.data.provider === "local", "fonte banco, provider local");
check((first(b.evs, "done")?.at ?? 9e9) < 300, `resposta local completa em ${first(b.evs, "done")?.at.toFixed(0)} ms`);
check(groqBodies.length === n, "nenhuma chamada à Groq");

console.log("3. Base de conhecimento → local com gancho de apresentador");
const c = await stream("como funciona o fator R?");
const cAns = String(first(c.evs, "done")?.data.answer || "");
check(first(c.evs, "done")?.data.fonte === "base", "fonte base");
check(/^(Presta atenção nisso|Pensa comigo|Vamos direto ao ponto|Olha que interessante|Isso aqui muda o jogo|Anota essa)\./.test(cAns), `abre com gancho: "${cAns.slice(0, 40)}…"`);

console.log("4. Conta/modelo que recusa reasoning_effort → repete sem os parâmetros");
rejectReasoningParams = true;
const d = await stream("qual a capital da Austrália?");
rejectReasoningParams = false;
check(first(d.evs, "done")?.data.answer === PIECES.join("").trim(), "resposta completa mesmo assim");
check(!("reasoning_effort" in groqBodies.at(-1)!), "2ª tentativa sem reasoning_effort");

console.log("5. Cliente desiste no meio (pergunta interrompida) → Groq é cancelada");
upstreamAborted = false;
await stream("qual a capital da Austrália?", 2);
await new Promise((r) => setTimeout(r, 600));
check(upstreamAborted, "stream da Groq abortado quando o palco interrompe");

console.log("6. Rotas antigas intactas");
const old = await realFetch(`${API}/ai/chat`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ provider: "groq", persona: "icaro", question: "quem foi Maria Quitéria?", history: [], dataset: null }) });
check(old.ok && ((await old.json()) as { fonte?: string }).fonte === "banco", "/ai/chat continua respondendo pelo banco");
const unauth = await realFetch(`${API}/ai/chat/stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
check(unauth.status === 401, "stream exige login (401 sem sessão)");

server.close();
console.log(`\nvalidate-stream: ${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
