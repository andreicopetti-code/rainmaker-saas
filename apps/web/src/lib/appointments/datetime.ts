/** Horário comercial sempre em Brasília (sem horário de verão desde 2019). */
export const APP_TIMEZONE = 'America/Sao_Paulo';
const TZ_OFFSET = '-03:00';

type DateTimeParts = {
  date: string;
  hour: number;
  minute: number;
  dayMonth: string;
  weekdayShort: string;
};

function parseDateTimeParts(iso: string): DateTimeParts {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
  const dayMonth = d.toLocaleDateString('pt-BR', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
  });
  const weekdayRaw = new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIMEZONE,
    weekday: 'short',
  }).format(d);
  const weekdayShort = weekdayRaw.replace('.', '').replace(/^./, (c) => c.toUpperCase());
  const timeStr = d.toLocaleTimeString('pt-BR', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [hour, minute] = timeStr.split(':').map((n) => parseInt(n, 10));
  return { date, hour, minute, dayMonth, weekdayShort };
}

/** Converte campos do formulário em ISO com offset de Brasília para o Postgres. */
export function buildScheduledAt(date: string, time: string): string {
  const hhmm = time.slice(0, 5);
  return `${date}T${hhmm}:00${TZ_OFFSET}`;
}

/** Garante offset explícito ao gravar no banco (compatível com strings legadas). */
export function normalizeScheduledAt(value: string): string {
  if (!value) return value;
  if (/[Zz]$/.test(value) || /[+-]\d{2}:\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?/);
  if (match) return `${match[1]}T${match[2]}:00${TZ_OFFSET}`;
  return value;
}

export function scheduledAtToDate(iso: string): string {
  return parseDateTimeParts(iso).date;
}

export function scheduledAtToTime(iso: string): string {
  const { hour, minute } = parseDateTimeParts(iso);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatHourMinute(hour: number, minute: number, padHour = false): string {
  const h = padHour ? String(hour).padStart(2, '0') : String(hour);
  return minute === 0 ? `${h}h` : `${h}h${String(minute).padStart(2, '0')}`;
}

/** Ex.: "02/07 · 9h" — usado nos cards do funil. */
export function formatApptCardDate(iso: string): string {
  const { dayMonth, hour, minute } = parseDateTimeParts(iso);
  return `${dayMonth} · ${formatHourMinute(hour, minute)}`;
}

/** Ex.: "Seg, 02/07" + "9h" — usado na agenda. */
export function formatApptPipelineDate(iso: string): { date: string; time: string } {
  const { dayMonth, weekdayShort, hour, minute } = parseDateTimeParts(iso);
  return {
    date: `${weekdayShort}, ${dayMonth}`,
    time: formatHourMinute(hour, minute),
  };
}

export function formatApptTime(iso: string): string {
  const { hour, minute } = parseDateTimeParts(iso);
  return formatHourMinute(hour, minute, true);
}

/** Ex.: "02/07·9h" — texto compacto para prompts da IA. */
export function formatApptCompact(iso: string): string {
  const { dayMonth, hour, minute } = parseDateTimeParts(iso);
  return `${dayMonth}·${formatHourMinute(hour, minute)}`;
}

export function isScheduledToday(iso: string): boolean {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
  return scheduledAtToDate(iso) === today;
}

export function appDateKey(iso: string): string {
  return scheduledAtToDate(iso);
}

export function todayInAppTz(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
}

export function nextFullHourInAppTz(): string {
  const { hour } = parseDateTimeParts(new Date().toISOString());
  const next = (hour + 1) % 24;
  return `${String(next).padStart(2, '0')}:00`;
}

/** Soma dias a uma data `YYYY-MM-DD` (meio-dia local para evitar DST). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Próxima data útil sugerida (+3 dias; se cair no fim de semana, sobe para segunda). */
export function suggestNextApptDateKey(fromDateKey = todayInAppTz()): string {
  let key = addDaysToDateKey(fromDateKey, 3);
  const d = new Date(`${key}T12:00:00`);
  const weekday = d.getDay(); // 0=dom 6=sab
  if (weekday === 6) key = addDaysToDateKey(key, 2);
  else if (weekday === 0) key = addDaysToDateKey(key, 1);
  return key;
}
