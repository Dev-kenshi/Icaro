// Valida a transcrição pelo servidor (/api/ai/stt) com o serviço Groq simulado.
process.env.SESSION_SECRET ||= `teste-stt-${"x".repeat(32)}`;
process.env.ICARO_USER1_PASSWORD ||= "codigo-teste";
process.env.GROQ_API_KEY = "gsk_falsa_para_teste";
process.env.grok = "";

const realFetch = globalThis.fetch;
let lastForm: FormData | null = null;
let upstreamStatus = 200;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const target = String(url instanceof Request ? url.url : url);
  if (!target.startsWith("https://api.groq.com/")) return realFetch(url, init);
  lastForm = init?.body as FormData;
  if (upstreamStatus !== 200) return new Response("{}", { status: upstreamStatus });
  return new Response(JSON.stringify({ text: " O que é split payment? " }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

const { default: app } = await import("../../artifacts/api-server/src/app");
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const api = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
let failures = 0;
let passed = 0;
const check = (condition: unknown, message: string) => {
  if (condition) { passed++; console.log("  ok  ", message); }
  else { failures++; console.log("  FALHA", message); }
};

const login = await realFetch(`${api}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "user1", password: process.env.ICARO_USER1_PASSWORD }),
});
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
const audio = new Uint8Array(4000).fill(7);
const post = (body: BodyInit, contentType = "audio/webm;codecs=opus", withCookie = true) =>
  realFetch(`${api}/ai/stt`, {
    method: "POST",
    headers: { "Content-Type": contentType, ...(withCookie ? { Cookie: cookie } : {}) },
    body,
  });

const ok = await post(audio);
const response = (await ok.json()) as { text?: string; ms?: number };
check(ok.status === 200 && response.text === "O que é split payment?", `transcreve e limpa o texto: "${response.text}"`);
const form = lastForm as FormData | null;
const file = form?.get("file") as File | null;
check(form?.get("model") === "whisper-large-v3-turbo" && form?.get("language") === "pt", "Whisper turbo em português");
check(file && file.name === "fala.webm" && file.size === audio.length, "envia o áudio inteiro como fala.webm");
check(String(form?.get("prompt") || "").includes("UEFS"), "vocabulário do Ícaro no prompt");
check((await post(new Uint8Array(10))).status === 400, "áudio curto demais → 400");
check((await post(audio, "audio/webm", false)).status === 401, "exige login (401 sem sessão)");
upstreamStatus = 429;
check((await post(audio)).status === 429, "limite da Groq → 429 com mensagem");
upstreamStatus = 500;
check((await post(audio)).status === 502, "falha da Groq → 502 com mensagem");
process.env.GROQ_API_KEY = "";
process.env.grok = "";
check((await post(audio)).status === 503, "sem chave → 503 com mensagem");

server.close();
console.log(`\nvalidate-stt: ${passed} ok, ${failures} falha(s)`);
process.exit(failures ? 1 : 0);
export {};