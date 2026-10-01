// Valida a transcrição pelo servidor (/api/ai/stt) com o Whisper da Groq simulado.
//   pnpm --filter @workspace/scripts run validate:stt
process.env.SESSION_SECRET ||= "teste-stt-" + "x".repeat(32);
process.env.ICARO_USER1_CODE ||= "codigo-teste";
process.env.GROQ_API_KEY = "gsk_falsa_para_teste";

const realFetch = globalThis.fetch;
let lastForm: FormData | null = null;
let groqStatus = 200;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url instanceof Request ? url.url : url);
  if (!u.startsWith("https://api.groq.com/")) return realFetch(url, init);
  lastForm = init?.body as FormData;
  if (groqStatus !== 200) return new Response("{}", { status: groqStatus });
  return new Response(JSON.stringify({ text: " O que é split payment? " }), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

const { default: app } = await import("../../artifacts/api-server/src/app");
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const API = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
let failed = 0, passed = 0;
const check = (cond: unknown, msg: string) => { if (cond) { passed++; console.log("  ok  ", msg); } else { failed++; console.log("  FALHA", msg); } };

const login = await realFetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "user1", password: process.env.ICARO_USER1_CODE }) });
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
const audio = new Uint8Array(4000).fill(7);
const post = (body: BodyInit, type = "audio/webm;codecs=opus", withCookie = true) =>
  realFetch(`${API}/ai/stt`, { method: "POST", headers: { "Content-Type": type, ...(withCookie ? { Cookie: cookie } : {}) }, body });

const ok = await post(audio);
const j = (await ok.json()) as { text?: string; ms?: number };
check(ok.status === 200 && j.text === "O que é split payment?", `transcreve e limpa o texto: "${j.text}"`);
const form = lastForm as FormData | null;
const file = form?.get("file") as File | null;
check(form?.get("model") === "whisper-large-v3-turbo" && form?.get("language") === "pt", "Whisper turbo em português");
check(file && file.name === "fala.webm" && file.size === audio.length, "envia o áudio inteiro como fala.webm");
check(String(form?.get("prompt") || "").includes("UEFS"), "vocabulário do Ícaro no prompt (UEFS, IBS, CBS…)");
check((await post(new Uint8Array(10))).status === 400, "áudio curto demais → 400");
check((await post(audio, "audio/webm", false)).status === 401, "exige login (401 sem sessão)");
groqStatus = 429;
check((await post(audio)).status === 429, "limite da Groq → 429 com mensagem");
groqStatus = 500;
check((await post(audio)).status === 502, "falha da Groq → 502 com mensagem");
delete process.env.GROQ_API_KEY;
check((await post(audio)).status === 503, "sem GROQ_API_KEY → 503 explicando o Secret");

server.close();
console.log(`\nvalidate-stt: ${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
export {};
