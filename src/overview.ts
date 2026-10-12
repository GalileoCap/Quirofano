import { SOURCE_FIELDS, agendaValue, disagree, eventValue } from './origin.ts'
import type { Excluded, Field, Row } from './types.ts'

/** Datos que tendría que traer una cirugía de las fuentes: si falta alguno, se avisa. */
export const REQUIRED_FIELDS: Field[] = ['name', 'hc', 'surgery', 'surgeon', 'eye', 'duration']

/** Columnas que se completan a mano: mientras estén vacías, la fila está sin completar. */
export const PENDING_FIELDS: Field[] = ['time', 'prequi', 'hcCheck']

/** Lo que merece mirarse de una fila, para verlo de un vistazo. */
export type Flags = {
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
  /** Si la fila está en una sola fuente (o si se agregó a mano) */
  single?: 'agenda' | 'calendar' | 'manual'
  /** La fila tiene un aviso del cruce */
  warning: boolean
  /** Por qué no está en el checklist (filas de "Sin incluir") */
  excluded?: Excluded['reason']
}

export function rowFlags(row: Row, excluded?: Excluded['reason']): Flags {
  const { agenda, event } = row.origin ?? {}
  const sources: Flags['sources'] = []
  if (agenda && event) {
    for (const f of SOURCE_FIELDS) if (disagree(agendaValue(agenda, f), eventValue(event, f))) sources.push(f)
    if (agenda.date !== event.date) sources.push('date')
  }
  return {
    confirm: row.conflicts?.map((c) => c.field) ?? [],
    sources,
    edited: row.src ? SOURCE_FIELDS.filter((f) => row[f] !== row.src![f]) : [],
    missing: REQUIRED_FIELDS.filter((f) => !row[f].trim()),
    pending: PENDING_FIELDS.filter((f) => !row[f].trim()),
    single: row.source === 'calendar' ? 'calendar' : row.source === 'agenda' ? 'agenda' : row.source === 'manual' ? 'manual' : undefined,
    warning: !!row.warning,
    excluded,
  }
}

export const FILTERS = ['all', 'confirm', 'sources', 'edited', 'missing', 'pending'] as const
export type Filter = (typeof FILTERS)[number]

export const FILTER_LABELS: Record<Filter, string> = {
  all: 'Todas',
  confirm: 'Por confirmar',
  sources: 'Agenda ≠ calendar',
  edited: 'Editadas',
  missing: 'Faltan datos',
  pending: 'Sin completar',
}

/** Si una fila entra en un filtro. Las filas sin incluir solo tienen sentido para saber en qué difieren las fuentes. */
export function inFilter(f: Flags, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'confirm':
      return f.confirm.length > 0
    case 'sources':
      return f.sources.length > 0 || f.single === 'agenda' || f.single === 'calendar' || f.excluded === 'not-in-calendar' || f.excluded === 'suspended'
    case 'edited':
      return f.edited.length > 0 || f.single === 'manual' || f.excluded === 'removed'
    case 'missing':
      return !f.excluded && f.missing.length > 0
    case 'pending':
      return !f.excluded && f.pending.length > 0
  }
}
