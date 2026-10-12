import { parseAgenda } from './agenda.ts'
import { addDaysTo, mondayOf, today } from './dates.ts'
import { classifyEvents, parseIcs } from './ics.ts'
import { mergeChecklist } from './merge.ts'
import { diffRows } from './review.ts'
import { useSources, useStore, type CalendarFile } from './store.ts'
import type { Row } from './types.ts'
import { unzipText } from './unzip.ts'

/** Resultado para mostrarle al usuario: lo que se cargó o por qué no se pudo. */
export type LoadResult = { ok: boolean; message: string }

const stem = (name: string) => name.replace(/\.[^.]+$/, '')

/** Las semanas que importan para comparar cargas: desde la pasada y las ocho siguientes. */
const COMPARE_WEEKS = 9

/** El checklist que armarían hoy la agenda y los calendarios cargados (null si no hay nada cargado). */
function snapshot(): { rows: Row[]; withCalendar: boolean } | null {
  const { agenda, calendars } = useSources.getState()
  const rows = agenda ? parseAgenda(agenda.text) : []
  const classified = calendars.map((c) => classifyEvents(c.events))
  const events = classified.flatMap((c) => c.events)
  const problems = classified.flatMap((c) => c.problems)
  if (!rows.length && !events.length) return null
  const first = addDaysTo(mondayOf(today()), -7)
  const weeks = Array.from({ length: COMPARE_WEEKS }, (_, i) => addDaysTo(first, i * 7))
  return {
    rows: weeks.flatMap((m) => mergeChecklist({ agenda: rows, events, problems, from: m, to: addDaysTo(m, 6) }).rows),
    withCalendar: events.length > 0,
  }
}

/** Cambia las fuentes y deja anotado qué cambió en el checklist (cirugías nuevas, movidas, canceladas o con otros datos). */
function applyAndCompare(apply: () => void) {
  const before = snapshot()
  apply()
  const after = snapshot()
  const { edits, included, news, setNews } = useStore.getState()
  // armado solo con la agenda y armado con el calendar no se pueden comparar: serían todas "novedades"
  if (!before || !after || before.withCalendar !== after.withCalendar) return
  const items = diffRows(before.rows, after.rows, edits, included)
  // agenda y calendar suelen subirse seguidos: las novedades de las dos cargas se juntan
  const recent = news && Date.now() - Date.parse(news.at) < 10 * 60_000 ? news.items : []
  const seen = new Set(recent.map((n) => `${n.kind}|${n.key}`))
  const all = [...recent, ...items.filter((n) => !seen.has(`${n.kind}|${n.key}`))]
  setNews(all.length ? { at: new Date().toISOString(), items: all } : null)
}

export async function loadAgenda(files: File[]): Promise<LoadResult> {
  const file = files[0]
  if (!file) return { ok: false, message: 'No elegiste ningún archivo.' }
  const text = await file.text()
  const rows = parseAgenda(text)
  if (!rows.length || !/CIRUGIA/i.test(text.slice(0, 2000)))
    return { ok: false, message: 'Ese archivo no parece la agenda quirúrgica (.csv con las columnas del formulario).' }
  applyAndCompare(() => useSources.getState().setAgenda(file.name, text))
  return { ok: true, message: `Agenda cargada: ${rows.length} cirugías.` }
}

/** Los eventos de más de este tiempo atrás no sirven para armar un checklist y harían pesar de más lo guardado. */
const KEEP_DAYS = 120

export async function loadCalendars(files: File[]): Promise<LoadResult> {
  const found: CalendarFile[] = []
  const oldest = addDaysTo(today(), -KEEP_DAYS)
  for (const file of files) {
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.pdf'))
      return {
        ok: false,
        message:
          'El PDF del calendar corta los títulos y no se puede leer bien. Exportá el calendario como .ics (Google Calendar → Configuración → Importar y exportar → Exportar).',
      }
    const texts: [string, string][] = []
    try {
      if (lower.endsWith('.zip'))
        for (const [name, text] of await unzipText(await file.arrayBuffer(), (n) => n.toLowerCase().endsWith('.ics')))
          texts.push([stem(name.split('/').pop()!), text])
      else texts.push([stem(file.name), await file.text()])
    } catch (e) {
      return { ok: false, message: `No pude abrir ${file.name}: ${e instanceof Error ? e.message : 'error'}.` }
    }
    for (const [fileName, text] of texts) {
      // los cumpleaños no son cirugías (y se llaman igual que la agenda personal)
      if (!text.includes('BEGIN:VCALENDAR') || /^birthdays/i.test(fileName)) continue
      const name = /^X-WR-CALNAME:(.+?)\r?$/m.exec(text)?.[1]?.trim() ?? fileName
      const events = parseIcs(text, name).filter((e) => e.date >= oldest)
      found.push({ name: found.some((f) => f.name === name) ? `${name} (${fileName})` : name, events })
    }
  }
  if (!found.length) return { ok: false, message: 'No encontré ningún calendario (.ics) en lo que elegiste.' }
  applyAndCompare(() => useSources.getState().addCalendars(found))
  return { ok: true, message: `Calendarios cargados: ${found.map((f) => f.name).join(', ')}.` }
}
