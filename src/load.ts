import { parseAgenda } from './agenda.ts'
import { addDaysTo, isoOf } from './dates.ts'
import { parseIcs } from './ics.ts'
import { useSources, type CalendarFile } from './store.ts'
import { unzipText } from './unzip.ts'

/** Resultado para mostrarle al usuario: lo que se cargó o por qué no se pudo. */
export type LoadResult = { ok: boolean; message: string }

const stem = (name: string) => name.replace(/\.[^.]+$/, '')

export async function loadAgenda(files: File[]): Promise<LoadResult> {
  const file = files[0]
  if (!file) return { ok: false, message: 'No elegiste ningún archivo.' }
  const text = await file.text()
  const rows = parseAgenda(text)
  if (!rows.length || !/CIRUGIA/i.test(text.slice(0, 2000)))
    return { ok: false, message: 'Ese archivo no parece la agenda quirúrgica (.csv con las columnas del formulario).' }
  useSources.getState().setAgenda(file.name, text)
  return { ok: true, message: `Agenda cargada: ${rows.length} cirugías.` }
}

/** Los eventos de más de este tiempo atrás no sirven para armar un checklist y harían pesar de más lo guardado. */
const KEEP_DAYS = 120

export async function loadCalendars(files: File[]): Promise<LoadResult> {
  const found: CalendarFile[] = []
  const oldest = addDaysTo(isoOf(new Date()), -KEEP_DAYS)
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
  useSources.getState().addCalendars(found)
  return { ok: true, message: `Calendarios cargados: ${found.map((f) => f.name).join(', ')}.` }
}
