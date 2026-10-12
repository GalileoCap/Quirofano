import type { RawEvent } from './ics.ts'
import type { Novelty } from './review.ts'
import type { CalendarFile, News, UserData } from './store.ts'
import type { Edits } from './checklist.ts'
import { FIELDS, type Field, type Fields, type Row, type Snap } from './types.ts'

/**
 * Lo que Quiro guarda en este navegador, con versión. Cambiar la forma de lo guardado es:
 * 1. subir la versión (`USER_VERSION` o `SOURCES_VERSION`),
 * 2. agregar el paso que lleva de la versión anterior a la nueva en `USER_MIGRATIONS` o `SOURCES_MIGRATIONS`
 *    (la clave es la versión de la que parte), y
 * 3. si cambia la forma de algún campo, ajustar su lector (`readUserData`, `readSources`).
 * Los lectores corren siempre después de las migraciones, así que un dato roto o viejo nunca llega a la app.
 * Los nombres de las claves de localStorage (`quiro-v1`, `quiro-sources-v1`) no se tocan: la versión va dentro de lo guardado.
 */

/** Un paso lleva el estado guardado de una versión a la siguiente. */
export type Migration = (state: Record<string, unknown>) => Record<string, unknown>
/** La clave es la versión de la que parte el paso. */
export type Migrations = Record<number, Migration>

type Obj = Record<string, unknown>

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

export const USER_VERSION = 1
export const USER_MIGRATIONS: Migrations = {}

export const SOURCES_VERSION = 1
export const SOURCES_MIGRATIONS: Migrations = {}

/**
 * Lleva `state` de la versión `from` a la `to` aplicando los pasos en orden. Un estado de una versión más nueva
 * (`from > to`) vuelve sin tocar: los lectores toman lo que reconocen. Si falta un paso de la cadena, lanza.
 */
export function runMigrations(state: unknown, from: number, to: number, steps: Migrations): Obj {
  let current: Obj = isObj(state) ? state : {}
  for (let v = from; v < to; v++) {
    const step = steps[v]
    if (!step) throw new Error(`Falta el paso de migración de la versión ${v} a la ${v + 1}`)
    current = step(current)
  }
  return current
}

/** La versión de lo que guardó zustand (`{"state":…,"version":N}`), o null si no se puede leer. */
export function versionOf(raw: string | null): number | null {
  if (raw === null) return null
  try {
    const saved: unknown = JSON.parse(raw)
    return isObj(saved) && typeof saved.version === 'number' ? saved.version : null
  } catch {
    return null
  }
}

/** Una fila con todos los campos vacíos. */
export const blankFields = (): Fields => Object.fromEntries(FIELDS.map((f) => [f, ''])) as Fields

/** Los campos de `o`; los que faltan o no son texto quedan vacíos (así una columna nueva no rompe filas viejas). */
const fieldsFrom = (o: Obj): Fields => {
  const out = blankFields()
  for (const f of FIELDS) {
    const v = o[f]
    if (typeof v === 'string') out[f] = v
  }
  return out
}

const isField = (k: string): k is Field => FIELDS.some((f) => f === k)

/** Un mapa clave → valor: de cada entrada se queda con lo que `read` entiende y descarta el resto. Si no es un mapa, vacío. */
function readMap<T>(x: unknown, read: (value: unknown) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {}
  if (!isObj(x)) return out
  for (const [k, v] of Object.entries(x)) {
    const item = read(v)
    if (item !== undefined) out[k] = item
  }
  return out
}

const readEdit = (x: unknown): Edits[string] | undefined => {
  if (!isObj(x)) return undefined
  const out: Edits[string] = {}
  for (const [k, v] of Object.entries(x)) if (isField(k) && typeof v === 'string') out[k] = v
  return out
}

const readStrings = (x: unknown): string[] | undefined => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : undefined)

const readSnap = (x: unknown): Snap | undefined => (isObj(x) && typeof x.date === 'string' ? { ...fieldsFrom(x), date: x.date } : undefined)

const readManualRow = (x: unknown): Row | undefined =>
  isObj(x) && typeof x.key === 'string' && typeof x.date === 'string' ? { ...fieldsFrom(x), key: x.key, date: x.date, source: 'manual' } : undefined

/** Lo escrito a mano, siempre completo y bien formado: lo que falta queda vacío y lo roto se descarta entrada por entrada. */
export function readUserData(state: unknown): UserData {
  const s = isObj(state) ? state : {}
  return {
    edits: readMap(s.edits, readEdit),
    bases: readMap(s.bases, readEdit),
    snaps: readMap(s.snaps, readSnap),
    order: readMap(s.order, readStrings),
    included: readMap(s.included, (v) => (typeof v === 'boolean' ? v : undefined)),
    manualRows: Array.isArray(s.manualRows) ? s.manualRows.flatMap((r) => readManualRow(r) ?? []) : [],
    ranges: readMap(s.ranges, (v) => (isObj(v) && typeof v.from === 'string' && typeof v.to === 'string' ? { from: v.from, to: v.to } : undefined)),
    acks: readMap(s.acks, (v) => (typeof v === 'string' ? v : undefined)),
    tasks: readMap(s.tasks, (v) => (isObj(v) && typeof v.done === 'boolean' && typeof v.note === 'string' ? { done: v.done, note: v.note } : undefined)),
  }
}

const readEvent = (x: unknown): RawEvent | undefined =>
  isObj(x) && typeof x.date === 'string' && typeof x.title === 'string' && typeof x.description === 'string' && typeof x.calendar === 'string' && typeof x.cancelled === 'boolean'
    ? { date: x.date, title: x.title, description: x.description, calendar: x.calendar, cancelled: x.cancelled }
    : undefined

const readCalendar = (x: unknown): CalendarFile | undefined =>
  isObj(x) && typeof x.name === 'string' && Array.isArray(x.events) ? { name: x.name, events: x.events.flatMap((e) => readEvent(e) ?? []) } : undefined

/** La agenda y los calendarios guardados; lo que no se entiende se descarta (se pueden volver a cargar). */
export function readSources(state: unknown): { agenda: { name: string; text: string } | null; calendars: CalendarFile[] } {
  const s = isObj(state) ? state : {}
  const agenda = isObj(s.agenda) && typeof s.agenda.name === 'string' && typeof s.agenda.text === 'string' ? { name: s.agenda.name, text: s.agenda.text } : null
  return { agenda, calendars: Array.isArray(s.calendars) ? s.calendars.flatMap((c) => readCalendar(c) ?? []) : [] }
}

const readNovelty = (x: unknown): Novelty | undefined => {
  if (!isObj(x) || typeof x.key !== 'string' || typeof x.date !== 'string' || typeof x.name !== 'string' || typeof x.surgery !== 'string') return undefined
  const kind = x.kind
  if (kind !== 'added' && kind !== 'removed' && kind !== 'moved' && kind !== 'changed') return undefined
  const out: Novelty = { kind, key: x.key, date: x.date, name: x.name, surgery: x.surgery }
  if (typeof x.from === 'string') out.from = x.from
  if (Array.isArray(x.changes)) {
    out.changes = x.changes.flatMap((c) => {
      if (!isObj(c) || typeof c.was !== 'string' || typeof c.now !== 'string') return []
      const field = FIELDS.find((f) => f === c.field)
      return field ? [{ field, was: c.was, now: c.now }] : []
    })
  }
  return out
}

/** Las novedades de la última carga; si no se entienden, no hay novedades. */
export function readNews(x: unknown): News | null {
  if (!isObj(x) || typeof x.at !== 'string' || !Array.isArray(x.items)) return null
  return { at: x.at, items: x.items.flatMap((i) => readNovelty(i) ?? []) }
}

/** Lo que guarda `quiro-v1`: lo escrito a mano y las novedades de la última carga. */
export type Persisted = UserData & { news: News | null }

export const readPersisted = (state: unknown): Persisted => ({ ...readUserData(state), news: readNews(isObj(state) ? state.news : null) })

/** El respaldo que se baja desde Datos: lo escrito a mano más la versión con la que se armó. */
export function writeBackup(data: UserData): string {
  const { edits, bases, snaps, order, included, manualRows, ranges, acks, tasks } = data
  return JSON.stringify({ version: USER_VERSION, edits, bases, snaps, order, included, manualRows, ranges, acks, tasks }, null, 2)
}

/** Lee un respaldo. Los de antes de que existiera la versión no la traen y son la versión 1. */
export function readBackup(text: string): { ok: true; data: UserData } | { ok: false; error: string } {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    return { ok: false, error: 'El archivo no es un respaldo de Quiro.' }
  }
  if (!isObj(file) || !('edits' in file)) return { ok: false, error: 'El archivo no es un respaldo de Quiro.' }
  const version = 'version' in file ? file.version : 1
  if (typeof version !== 'number') return { ok: false, error: 'El respaldo no dice de qué versión es.' }
  if (version > USER_VERSION) return { ok: false, error: 'Este respaldo es de una versión más nueva de Quiro: actualizá la app para poder leerlo.' }
  try {
    return { ok: true, data: readUserData(runMigrations(file, version, USER_VERSION, USER_MIGRATIONS)) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No pude migrar el respaldo.' }
  }
}
