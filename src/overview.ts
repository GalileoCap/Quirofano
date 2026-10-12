import { FIELD_LABELS, shortDate } from './format.ts'
import { normHc } from './merge.ts'
import { SOURCE_FIELDS, agendaValue, disagree, eventValue } from './origin.ts'
import type { Excluded, Field, Row } from './types.ts'

/** Datos que tendría que traer una cirugía de las fuentes: si falta alguno, se avisa. */
export const REQUIRED_FIELDS: Field[] = ['name', 'hc', 'surgery', 'surgeon', 'eye', 'duration']

/** Columnas que se completan a mano: mientras estén vacías, la fila está sin completar. */
export const PENDING_FIELDS: Field[] = ['time', 'prequi', 'hcCheck']

/**
 * La diferencia más importante: una cirugía que sobra, una que falta o una que está en otro día.
 * Se mide contra lo que dicen las fuentes (agenda y calendar), no contra los datos de la fila.
 */
export type Presence =
  /** Está en el checklist (se agregó a mano) y ninguna fuente la tiene ese día */
  | { kind: 'extra' }
  /** Las fuentes la tienen y el checklist no: se sacó a mano */
  | { kind: 'removed' }
  /** El calendar la suspendió: no está en el checklist */
  | { kind: 'suspended' }
  /** La agenda y el calendar la tienen en días distintos (null: la fecha de la agenda no se pudo leer) */
  | { kind: 'date'; agenda: string | null; calendar: string }

/** Lo que merece mirarse de una fila, para verlo de un vistazo. */
export type Flags = {
  /** Sobra, falta o está en otro día */
  presence?: Presence
  /** Otros días (YYYY-MM-DD) en que está la misma persona en el lado contrario: la cirugía se movió */
  elsewhere: string[]
  /** Escritos a mano que difieren de las fuentes y nadie confirmó */
  confirm: Field[]
  /** Campos (o la fecha) en que la agenda y el calendar dicen cosas distintas */
  sources: (Field | 'date')[]
  /** Campos en que el checklist difiere de lo que salió del cruce (escritos a mano, confirmados o no) */
  edited: Field[]
  /** Datos de las fuentes que la fila no tiene */
  missing: Field[]
  /** Columnas a mano todavía vacías */
  pending: Field[]
  /** La fila tiene un aviso del cruce (se silencia con las diferencias, que son su causa) */
  warning: boolean
  /** Por qué no está en el checklist (filas de "Sin incluir") */
  excluded?: Excluded['reason']
  /** Huella de las diferencias reconocibles (presencia y fuentes) y de lo que dicen las fuentes; null si no hay nada que reconocer */
  signature: string | null
  /** Lo que se silenció porque la persona lo reconoció y las fuentes no cambiaron desde entonces */
  acked?: { presence?: Presence; sources: (Field | 'date')[] }
}

function presenceOf(row: Row, excluded: Excluded['reason'] | undefined): Presence | undefined {
  if (excluded === 'suspended') return { kind: 'suspended' }
  if (excluded) return { kind: 'removed' }
  if (row.source === 'manual') return { kind: 'extra' }
  const { agenda, event } = row.origin ?? {}
  if (agenda && event && agenda.date !== event.date) return { kind: 'date', agenda: agenda.date, calendar: event.date }
  return undefined
}

/** Lo que dicen las fuentes de la cirugía, sin la línea de la agenda (que se corre al insertar filas) ni lo escrito a mano. */
function signatureOf(row: Row, presence: Presence | undefined, sources: Flags['sources'], elsewhere: string[]): string | null {
  if (!presence && !sources.length) return null
  const { agenda, event } = row.origin ?? {}
  return JSON.stringify([
    presence ?? null,
    agenda && [agenda.date, ...SOURCE_FIELDS.map((f) => agendaValue(agenda, f))],
    event && [event.date, ...SOURCE_FIELDS.map((f) => eventValue(event, f))],
    elsewhere,
  ])
}

/** `ack` es la huella que la persona reconoció para esta fila: si coincide con la de hoy, la presencia y las fuentes que no coinciden se silencian. */
export function rowFlags(row: Row, excluded?: Excluded['reason'], elsewhere: string[] = [], ack?: string): Flags {
  const { agenda, event } = row.origin ?? {}
  const sources: Flags['sources'] = []
  if (agenda && event) {
    for (const f of SOURCE_FIELDS) if (disagree(agendaValue(agenda, f), eventValue(event, f))) sources.push(f)
    if (agenda.date !== event.date) sources.push('date')
  }
  const presence = presenceOf(row, excluded)
  const signature = signatureOf(row, presence, sources, elsewhere)
  const acked = signature !== null && signature === ack
  return {
    presence: acked ? undefined : presence,
    elsewhere,
    confirm: row.conflicts?.map((c) => c.field) ?? [],
    sources: acked ? [] : sources,
    edited: row.src ? SOURCE_FIELDS.filter((f) => row[f] !== row.src![f]) : [],
    missing: REQUIRED_FIELDS.filter((f) => !row[f].trim()),
    pending: PENDING_FIELDS.filter((f) => !row[f].trim()),
    warning: !!row.warning && !acked,
    excluded,
    signature,
    acked: acked ? { presence, sources } : undefined,
  }
}

export const FILTERS = ['all', 'presence', 'confirm', 'sources', 'edited', 'acked', 'missing', 'pending'] as const
export type Filter = (typeof FILTERS)[number]

export const FILTER_LABELS: Record<Filter, string> = {
  all: 'Todas',
  presence: 'Fecha o presencia',
  confirm: 'Por confirmar',
  sources: 'Agenda ≠ calendar',
  edited: 'Editadas',
  acked: 'Reconocidas',
  missing: 'Faltan datos',
  pending: 'Sin completar',
}

/** Campos en que la agenda y el calendar dicen cosas distintas (la fecha es una diferencia de presencia y va aparte). */
const fieldSources = (f: Flags) => f.sources.filter((x) => x !== 'date')

/** Si una fila entra en un filtro. Las filas sin incluir solo tienen sentido para saber qué falta o en qué difieren las fuentes. */
export function inFilter(f: Flags, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'presence':
      return f.presence !== undefined
    case 'confirm':
      return f.confirm.length > 0
    case 'sources':
      return fieldSources(f).length > 0
    case 'edited':
      return f.edited.length > 0
    case 'acked':
      return f.acked !== undefined
    case 'missing':
      return !f.excluded && f.missing.length > 0
    case 'pending':
      return !f.excluded && f.pending.length > 0
  }
}

/** Una marca de la fila, con el texto que se muestra en el Resumen y en el Calendario. */
export type Note = { kind: 'presence' | 'confirm' | 'sources' | 'edited' | 'missing'; text: string }

const labels = (fields: (Field | 'date')[]) => fields.map((f) => (f === 'date' ? 'Fecha' : FIELD_LABELS[f])).join(', ')
const dates = (isos: string[]) => isos.map(shortDate).join(', ')

/** El texto de la diferencia de fecha o presencia, con el otro día si la cirugía parece movida. */
function presenceText(p: Presence, elsewhere: string[]): string {
  const there = elsewhere.length ? dates(elsewhere) : ''
  switch (p.kind) {
    case 'extra':
      return `Sobra: no está en la agenda ni en el calendar${there ? ` · las fuentes la tienen el ${there}` : ''}`
    case 'removed':
      return `Falta: la sacaste a mano${there ? ` · en el checklist está el ${there}` : ''}`
    case 'suspended':
      return 'Suspendida en el calendar'
    case 'date':
      return `Otro día: la agenda ${p.agenda ? `dice ${shortDate(p.agenda)}` : 'tiene la fecha ilegible'}, el calendar ${shortDate(p.calendar)}`
  }
}

export function flagNotes(f: Flags): Note[] {
  // lo por confirmar ya figura aparte: no se repite como editado
  const edited = f.edited.filter((x) => !f.confirm.includes(x))
  const sources = fieldSources(f)
  const notes: Note[] = []
  if (f.presence) notes.push({ kind: 'presence', text: presenceText(f.presence, f.elsewhere) })
  if (f.confirm.length) notes.push({ kind: 'confirm', text: `Sin confirmar: ${labels(f.confirm)}` })
  if (sources.length) notes.push({ kind: 'sources', text: `Agenda ≠ calendar: ${labels(sources)}` })
  if (edited.length) notes.push({ kind: 'edited', text: `Editado: ${labels(edited)}` })
  if (!f.excluded && f.missing.length) notes.push({ kind: 'missing', text: `Falta: ${labels(f.missing)}` })
  return notes
}

/** Una persona, para saber si dos filas son la misma: por HC si las dos la tienen, si no por nombre. */
const normName = (r: Row) => r.name.trim().replace(/\s+/g, ' ').toUpperCase()
const samePerson = (a: Row, b: Row) => {
  if (a.hc.trim() && b.hc.trim()) return normHc(a.hc) === normHc(b.hc)
  return !!normName(a) && normName(a) === normName(b)
}

/**
 * Cirugías que cambiaron de día: la fila que sobra en un día y la que falta en otro, si son la misma persona.
 * Devuelve, por clave de fila, los otros días en que está del lado contrario. Dos cirugías reales de una misma
 * persona en días distintos no cuentan como movidas.
 */
export function elsewhereDates(rows: Row[], excluded: Excluded[]): Map<string, string[]> {
  const manual = rows.filter((r) => r.source === 'manual')
  const sources = [...rows.filter((r) => r.source !== 'manual'), ...excluded.filter((x) => x.reason === 'removed').map((x) => x.row)]
  const out = new Map<string, string[]>()
  const add = (row: Row, others: Row[]) => {
    const days = [...new Set(others.filter((o) => o.date !== row.date && samePerson(row, o)).map((o) => o.date))].toSorted()
    if (days.length) out.set(row.key, days)
  }
  for (const row of manual) add(row, sources)
  for (const { row, reason } of excluded) if (reason === 'removed') add(row, manual)
  return out
}

/** Lo que se silenció por estar reconocido, con las mismas palabras que cuando avisaba. */
export function ackedNotes(f: Flags): Note[] {
  if (!f.acked) return []
  return flagNotes({ ...f, presence: f.acked.presence, sources: f.acked.sources, acked: undefined }).filter((n) => n.kind === 'presence' || n.kind === 'sources')
}

/** Una fila con sus marcas, lista para mostrar. */
export type Item = { row: Row; flags: Flags }

/** Las filas del checklist y las de "Sin incluir", con sus marcas (y los otros días de las que se movieron). `acks` son las diferencias que la persona ya reconoció. */
export function itemsOf(rows: Row[], excluded: Excluded[], acks: Record<string, string> = {}): Item[] {
  const elsewhere = elsewhereDates(rows, excluded)
  return [
    ...rows.map((row) => ({ row, flags: rowFlags(row, undefined, elsewhere.get(row.key), acks[row.key]) })),
    ...excluded.map(({ row, reason }) => ({ row, flags: rowFlags(row, reason, elsewhere.get(row.key), acks[row.key]) })),
  ]
}
