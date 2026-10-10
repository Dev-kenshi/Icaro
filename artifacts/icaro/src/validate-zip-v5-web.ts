import assert from "node:assert/strict";
import { escapeIcsText, parseAgendaEntries, serializeCalendar, toIcsLocalDate, type AgendaEntry } from "./lib/agenda-format";
import { parseSpotifyLink, spotifyEmbedUrl } from "./lib/spotify-links";

let checks = 0;
function check(value: unknown, message: string) {
  checks += 1;
  assert.ok(value, `Validação web ${checks}: ${message}`);
}

const single: AgendaEntry = { id: "abc", title: "Reunião", startsAt: "2026-10-12T09:30", recurrence: "none" };
check(parseAgendaEntries([single]).length === 1, "aceita compromisso válido");
check(parseAgendaEntries([{ ...single, recurrence: "daily" }])[0]?.recurrence === "daily", "aceita rotina diária");
check(parseAgendaEntries([{ ...single, recurrence: "weekly" }])[0]?.recurrence === "weekly", "aceita rotina semanal");
check(parseAgendaEntries(null).length === 0, "rejeita armazenamento nulo");
check(parseAgendaEntries({ entries: [single] }).length === 0, "rejeita formato objeto inesperado");
check(parseAgendaEntries([null]).length === 0, "rejeita item nulo");
check(parseAgendaEntries([{ ...single, id: "" }]).length === 0, "rejeita identificador vazio");
check(parseAgendaEntries([{ ...single, title: "" }]).length === 0, "rejeita título vazio");
check(parseAgendaEntries([{ ...single, title: "  " }]).length === 0, "rejeita título só com espaços");
check(parseAgendaEntries([{ ...single, startsAt: "inválido" }]).length === 0, "rejeita data inválida");
check(parseAgendaEntries([{ ...single, recurrence: "monthly" }]).length === 0, "rejeita recorrência desconhecida");
check(parseAgendaEntries([single, { ...single, id: "bad", startsAt: "bad" }]).length === 1, "filtra dados inválidos sem descartar os válidos");
check(escapeIcsText("a,b") === "a\\,b", "escapa vírgula no ICS");
check(escapeIcsText("a;b") === "a\\;b", "escapa ponto e vírgula no ICS");
check(escapeIcsText("a\\b") === "a\\\\b", "escapa barra invertida no ICS");
check(escapeIcsText("a\nb") === "a\\nb", "escapa quebra de linha no ICS");
check(escapeIcsText("Reunião") === "Reunião", "preserva caracteres Unicode");
check(toIcsLocalDate("invalid") === "", "não serializa data inválida");
check(/^\d{8}T\d{6}$/.test(toIcsLocalDate("2026-10-12T09:30")), "formata data local ICS");
const empty = serializeCalendar([], new Date("2026-01-01T00:00:00Z"), "America/Sao_Paulo");
check(empty.startsWith("BEGIN:VCALENDAR\r\n"), "inicia envelope de calendário");
check(empty.includes("VERSION:2.0\r\n"), "inclui versão do padrão");
check(empty.includes("PRODID:-//ICARO//Agenda//PT-BR\r\n"), "identifica o calendário Ícaro");
check(empty.endsWith("END:VCALENDAR\r\n"), "fecha envelope com CRLF");
const once = serializeCalendar([single], new Date("2026-01-01T00:00:00Z"), "America/Sao_Paulo");
check((once.match(/BEGIN:VEVENT/g) ?? []).length === 1, "exporta um compromisso como evento");
check(once.includes("UID:abc@icaro.local"), "exporta UID estável do evento");
check(once.includes("DTSTART;TZID=America/Sao_Paulo:"), "exporta horário local com fuso");
check(once.includes("SUMMARY:Reunião\r\n"), "exporta o título do compromisso");
check(!once.includes("RRULE:"), "não adiciona recorrência a compromisso único");
check(serializeCalendar([{ ...single, recurrence: "daily" }]).includes("RRULE:FREQ=DAILY"), "exporta repetição diária");
check(serializeCalendar([{ ...single, recurrence: "weekly" }]).includes("RRULE:FREQ=WEEKLY"), "exporta repetição semanal");
check(serializeCalendar([{ ...single, title: "A,B;C" }]).includes("SUMMARY:A\\,B\\;C"), "escapa pontuação no título exportado");
check((serializeCalendar([single, { ...single, id: "def" }]).match(/BEGIN:VEVENT/g) ?? []).length === 2, "exporta múltiplos compromissos");

const track = "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC";
const playlist = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";
check(parseSpotifyLink(track)?.id === "4uLU6hMCjMI75M1A2tKUQC", "aceita URL canônica de faixa");
check(parseSpotifyLink(`${track}?si=demo`)?.id === "4uLU6hMCjMI75M1A2tKUQC", "ignora parâmetros de compartilhamento");
check(parseSpotifyLink("https://open.spotify.com/intl-pt/album/4aawyAB9vmqN3uQ7FjRGTy")?.id === "4aawyAB9vmqN3uQ7FjRGTy", "aceita URL localizada de álbum");
check(parseSpotifyLink(playlist)?.id === "37i9dQZF1DXcBWIGoYBM5M", "aceita URL de playlist");
check(parseSpotifyLink("http://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC") === null, "rejeita HTTP sem TLS");
check(parseSpotifyLink("https://evil.example/track/4uLU6hMCjMI75M1A2tKUQC") === null, "rejeita host não confiável");
check(parseSpotifyLink("https://open.spotify.com/artist/4uLU6hMCjMI75M1A2tKUQC") === null, "rejeita tipo não incorporável");
check(parseSpotifyLink("https://open.spotify.com/track/short") === null, "rejeita identificador malformado");
check(parseSpotifyLink("texto livre") === null, "rejeita link inválido");
check(spotifyEmbedUrl({ id: "4uLU6hMCjMI75M1A2tKUQC", title: "Demo", url: track }) === "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC", "constrói player seguro para faixa");
check(spotifyEmbedUrl({ id: "x", title: "Demo", url: "https://evil.example/track/x" }) === "", "não incorpora host externo");

assert.equal(checks, 43);
process.stdout.write(`ÍCARO v5 web: ${checks}/${checks} validações de agenda e Spotify passaram.\n`);
