export type AgendaEntry = { id: string; title: string; startsAt: string; recurrence: 'none' | 'daily' | 'weekly' };

export function parseAgendaEntries(value: unknown): AgendaEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AgendaEntry => {
    if (!item || typeof item !== 'object') return false;
    const entry = item as Partial<AgendaEntry>;
    return typeof entry.id === 'string' && entry.id.length > 0
      && typeof entry.title === 'string' && entry.title.trim().length > 0
      && typeof entry.startsAt === 'string' && Number.isFinite(new Date(entry.startsAt).getTime())
      && (entry.recurrence === 'none' || entry.recurrence === 'daily' || entry.recurrence === 'weekly');
  });
}

export function escapeIcsText(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export function toIcsLocalDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const p = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}00`;
}

export function serializeCalendar(entries: AgendaEntry[], now = new Date(), timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') {
  const events = entries.map((entry) => {
    const stamp = toIcsLocalDate(entry.startsAt);
    const rule = entry.recurrence === 'none' ? '' : `RRULE:FREQ=${entry.recurrence === 'daily' ? 'DAILY' : 'WEEKLY'}\r\n`;
    return `BEGIN:VEVENT\r\nUID:${entry.id}@icaro.local\r\nDTSTAMP:${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}\r\nDTSTART;TZID=${timezone}:${stamp}\r\nSUMMARY:${escapeIcsText(entry.title)}\r\n${rule}END:VEVENT`;
  }).join('\r\n');
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//ICARO//Agenda//PT-BR\r\n${events}\r\nEND:VCALENDAR\r\n`;
}
