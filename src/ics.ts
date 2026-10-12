import { clean } from './agenda.ts'
import { addDaysTo } from './dates.ts'
import type { CalEvent, CalProblem } from './types.ts'

/** Un evento tal como viene en el .ics (los de varios días se repiten en cada día). */
export type RawEvent = { date: string; title: string; description: string; calendar: string; cancelled: boolean }

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
  let ev: { start?: string; end?: string; title: string; description: string; cancelled: boolean } | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') ev = { title: '', description: '', cancelled: false }
    else if (line === 'END:VEVENT') {
      if (ev?.start) {
        const last = ev.end && ev.end > ev.start ? addDaysTo(ev.end, -1) : ev.start
        for (let d = ev.start, n = 0; d <= last && n < 60; d = addDaysTo(d, 1), n++)
          out.push({ date: d, title: ev.title, description: ev.description, cancelled: ev.cancelled })
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
      else if (name === 'DESCRIPTION') ev.description = unescapeText(value).trim()
      else if (name === 'DTSTART') ev.start = icsDate(value) ?? undefined
      else if (name === 'DTEND') ev.end = icsDate(value) ?? undefined
      else if (name === 'STATUS') ev.cancelled = value.trim().toUpperCase() === 'CANCELLED'
    }
  }
  return out.map((e) => ({ ...e, calendar: calendar ?? fallbackName }))
}

const IGNORED_CALENDAR = /feriado|festivo|holiday|cumplea/i
const SUSPENSION = /suspens/i
/** Palabras de una cirugía: un evento que las tiene pero no sigue el formato se avisa en vez de ignorarse. */
const SURGERY_WORDS = /catarat|facoemulsif|faco\b|antiangio|aag\b|plastica|glaucoma|vitrect|retina|estrabismo|pterigion|chalazion|blefaro|ptosis|inyecci|trasplante/i

const EYE = /^(DERECHO|IZQUIERDO|AMBOS OJOS|OD|OI|AO|OJO DERECHO|OJO IZQUIERDO)$/i
const HC = /^(?:OS\s*)?(\d{3,7}(?:[/:-]\d{1,2})?)$/i
const DIOPTERS = /^[+-]?\d{1,2}(?:[.,]\d{1,2})?(?:\/[+-]?\d{1,2}(?:[.,]\d{1,2})?)?$/
const PHONE = /^[\d\s\-();+]{8,}/

export type EventDescription = { eye: string; diopters: string; hc: string; phone: string; name: string }

/**
 * Descripción de un evento. El formato actual es "OJO / DIOPTRÍAS / HC / TELÉFONO"; los eventos viejos traen
 * "[OJO /] PACIENTE / HC / TELÉFONO". Cada pedazo se reconoce por su forma, no por su posición.
 */
export function parseDescription(description: string): EventDescription {
  const out: EventDescription = { eye: '', diopters: '', hc: '', phone: '', name: '' }
  // los pedazos se separan con " / " (una barra pegada a un número, como en una HC o dos teléfonos, no separa)
  const parts = description
    .replace(/\s\/(?=\s)/g, '\n')
    .split('\n')
    .map((p) => clean(p))
    .filter(Boolean)
  for (const part of parts) {
    if (EYE.test(part)) out.eye ||= part.toUpperCase()
    else if (HC.test(part)) out.hc ||= part.replace(HC, '$1').replace(/[:-]/, '/')
    else if (DIOPTERS.test(part)) out.diopters ||= part
    else if (PHONE.test(part)) out.phone ||= part
    else if (/^[A-ZÁÉÍÓÚÑ ]{4,}$/i.test(part) && part.includes(' ')) out.name ||= part
  }
  return out
}

/**
 * Separa los eventos en cirugías y suspensiones (las del calendario de suspensiones). El formato actual es
 * "CIRUGÍA / PACIENTE / CIRUJANO / AYUDANTE"; el viejo, "CIRUGÍA / CIRUJANO / AYUDANTE" con el paciente en la
 * descripción. Lo que parece una cirugía pero no se puede leer se devuelve aparte para avisar.
 */
export function classifyEvents(raw: RawEvent[]): { events: CalEvent[]; problems: CalProblem[] } {
  const events: CalEvent[] = []
  const problems: CalProblem[] = []
  for (const e of raw) {
    if (e.cancelled || IGNORED_CALENDAR.test(e.calendar)) continue
    const parts = e.title.split('/').map((p) => p.trim())
    const suspension = SUSPENSION.test(e.calendar)
    const info = parseDescription(e.description)
    const base = { date: e.date, title: e.title, description: e.description, calendar: e.calendar, kind: suspension ? ('suspension' as const) : ('surgery' as const) }
    const details = { eye: info.eye, diopters: info.diopters, hc: info.hc, phone: info.phone }
    if (parts.length >= 3 && parts[0] && parts[1]) {
      events.push({ ...base, ...details, surgery: parts[0], name: parts[1], surgeon: clean(parts[2]), assistant: clean(parts[3]) })
    } else if (suspension && parts.length === 2 && parts[0]) {
      // "PACIENTE / MOTIVO"
      events.push({ ...base, ...details, surgery: '', name: parts[0], surgeon: '', assistant: '' })
    } else if (parts.length === 2 && parts[0] && info.name) {
      events.push({ ...base, ...details, surgery: parts[0], name: info.name, surgeon: clean(parts[1]), assistant: '' })
    } else if (!suspension && SURGERY_WORDS.test(e.title)) {
      problems.push({ date: e.date, title: e.title, calendar: e.calendar, description: e.description })
    }
  }
  return { events, problems }
}

export type EventStatus = { status: 'surgery' | 'suspension' | 'problem' | 'ignored'; reason: string }

/** Qué hizo la app con un evento del .ics y por qué (para poder ver también lo que se ignora). */
export function describeEvent(e: RawEvent): EventStatus {
  if (e.cancelled) return { status: 'ignored', reason: 'Cancelado en el calendario' }
  if (IGNORED_CALENDAR.test(e.calendar)) return { status: 'ignored', reason: 'Calendario que no es de cirugías' }
  const { events, problems } = classifyEvents([e])
  if (events[0]) return { status: events[0].kind, reason: events[0].kind === 'suspension' ? 'Suspensión' : 'Cirugía' }
  if (problems[0]) return { status: 'problem', reason: 'Parece una cirugía pero no tiene el formato CIRUGÍA / PACIENTE / CIRUJANO' }
  return { status: 'ignored', reason: 'No parece una cirugía' }
}
