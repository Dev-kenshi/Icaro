import { ask, check, done, login } from "./_check";
console.log("2. Roteamento banco → base → IA");
const { cookie } = await login();
const cases: Array<[string, string]> = [
  ["quem foi Maria Quitéria?", "banco"],
  ["como funciona o fator R?", "base"],
  ["quanto custa um funcionário com os encargos?", "base"],
  ["fale sobre contabilidade tributária", "banco"],
  ["o que é split payment?", "banco"],
];
for (const [q, fonte] of cases) {
  const r = await ask(cookie, q);
  check(r.status === 200 && r.fonte === fonte && r.provider === "local", `"${q}" → ${fonte} sem IA (veio ${r.fonte}/${r.provider})`);
  check(r.ms < 1500, `  resposta local em ${r.ms} ms (<1500)`);
}
const aus = await ask(cookie, "qual a capital da Austrália?");
check(aus.status === 200 && aus.fonte === "ia" && aus.provider !== "local", `Austrália vai para a IA (veio ${aus.fonte}/${aus.provider})`);
check(/canberra/i.test(aus.answer || ""), "resposta da IA menciona Canberra, não texto da base");
done("validate-routing");
