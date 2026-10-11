import { clean, normName } from './agenda.ts'
import { addDaysTo } from './dates.ts'
import type { CalEvent, CalProblem } from './types.ts'

type RawEvent = { date: string; title: string; calendar: string; cancelled: boolean }

const unescapeText = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1')

/** Fecha 'YYYY-MM-DD' de un DTSTART/DTEND ('20261013', '20261013T090000', '20261013T120000Z'). */
function icsDate(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z)?)?$/.exec(value.trim())
  if (!m) return null
  const date = `${m[1]}-${m[2]}-${m[3]}`
  // en UTC ('Z') la fecha local de Argentina (UTC-3) puede ser la anterior
  return m[6] && +m[4] < 3 ? addDaysTo(date, -1) : date
}

/** Eventos de un archivo .ics. Los de varios días (vacaciones) se repiten en cada día; las repeticiones (RRULE) no se expanden. */
export function parseIcs(text: string, fallbackName = ''): RawEvent[] {
  // las líneas largas vienen cortadas: la continuación empieza con espacio o tab
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  let calendar: string | null = null
  const out: Omit<RawEvent, 'calendar'>[] = []
  let ev: { start?: string; end?: string; title: string; cancelled: boolean } | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') ev = { title: '', cancelled: false }
    else if (line === 'END:VEVENT') {
      if (ev?.start) {
        const last = ev.end && ev.end > ev.start ? addDaysTo(ev.end, -1) : ev.start
        for (let d = ev.start, n = 0; d <= last && n < 60; d = addDaysTo(d, 1), n++)
          out.push({ date: d, title: ev.title, cancelled: ev.cancelled })
      }
      ev = null
    } else {
      const i = line.indexOf(':')
      if (i < 0) continue
      const name = line.slice(0, i).split(';')[0].toUpperCase()
      const value = line.slice(i + 1)
      if (!ev) {
        if (name === 'X-WR-CALNAME') calendar = unescapeText(value).trim()
      } else if (name === 'SUMMARY') ev.title = unescapeText(value).trim()
      else if (name === 'DTSTART') ev.start = icsDate(value) ?? undefined
      else if (name === 'DTEND') ev.end = icsDate(value) ?? undefined
      else if (name === 'STATUS') ev.cancelled = value.trim().toUpperCase() === 'CANCELLED'
    }
  }
  return out.map((e) => ({ ...e, calendar: calendar ?? fallbackName }))
}

const IGNORED_CALENDAR = /feriado|festivo|holiday|cumplea/i
const SUSPENSION = /suspens/i
const SURGERY_CALENDAR = /quirurg/i

/**
 * Separa los eventos en cirugías ("CIRUGIA / PACIENTE / CIRUJANO / AYUDANTE") y suspensiones (las del calendario de
 * suspensiones). Lo que parece una cirugía pero no tiene el formato se devuelve aparte para avisar.
 */
export function classifyEvents(raw: RawEvent[]): { events: CalEvent[]; problems: CalProblem[] } {
  const events: CalEvent[] = []
  const problems: CalProblem[] = []
  for (const e of raw) {
    if (e.cancelled || IGNORED_CALENDAR.test(e.calendar)) continue
    const parts = e.title.split('/').map((p) => p.trim())
    const suspension = SUSPENSION.test(e.calendar)
    if (parts.length >= 2 && parts[1]) {
      events.push({
        date: e.date,
        title: e.title,
        calendar: e.calendar,
        kind: suspension ? 'suspension' : 'surgery',
        surgery: parts[0],
        name: parts[1],
        surgeon: clean(parts[2]),
        assistant: clean(parts[3]),
      })
    } else if (!suspension && (SURGERY_CALENDAR.test(e.calendar) || !e.calendar) && normName(e.title)) {
      problems.push({ date: e.date, title: e.title, calendar: e.calendar })
    }
  }
  return { events, problems }
}
