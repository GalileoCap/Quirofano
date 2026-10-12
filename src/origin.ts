import { normName } from './agenda.ts'
import { nameMatch, normHc } from './merge.ts'
import { FIELDS, MANUAL_FIELDS, type AgendaRow, type CalEvent, type Field, type Row } from './types.ts'

/** Los campos que traen las fuentes (el horario y las columnas a mano no). */
export const SOURCE_FIELDS: Field[] = FIELDS.filter((f) => !MANUAL_FIELDS.includes(f) && f !== 'extra')

/** Los campos del checklist que la fila de la agenda trae como texto, con el mismo nombre. */
const AGENDA_TEXT = ['name', 'hc', 'surgery', 'surgeon', 'assistant', 'eye', 'contact', 'phone', 'diopters', 'anesthesia', 'notes', 'dni'] as const satisfies readonly (Field & keyof AgendaRow)[]
const isAgendaText = (f: Field): f is (typeof AGENDA_TEXT)[number] => (AGENDA_TEXT as readonly Field[]).includes(f)

/** Lo que dice la fila de la agenda en un campo del checklist ('' si no lo trae). */
export const agendaValue = (a: AgendaRow, f: Field): string => (f === 'duration' ? (a.duration?.toString() ?? '') : isAgendaText(f) ? a[f] : '')

const EVENT_FIELDS: Partial<Record<Field, keyof CalEvent>> = {
  name: 'name',
  hc: 'hc',
  surgery: 'surgery',
  surgeon: 'surgeon',
  assistant: 'assistant',
  eye: 'eye',
  diopters: 'diopters',
  phone: 'phone',
}

/** Lo que dice el evento del calendar en un campo del checklist ('' si no lo trae). */
export const eventValue = (e: CalEvent, f: Field): string => {
  const key = EVENT_FIELDS[f]
  return key ? e[key] : ''
}

/** Las dos fuentes traen el campo y no dicen lo mismo (se compara sin acentos ni mayúsculas). */
export const disagree = (a: string, b: string) => !!a && !!b && normName(a) !== normName(b)

/** Otras filas de la agenda del mismo paciente (misma HC o mismo nombre), de la fecha más reciente a la más vieja. */
export function otherAgendaRows(agenda: AgendaRow[], row: Row, limit = 8): AgendaRow[] {
  const used = row.origin?.agenda?.line
  return agenda
    .filter((a) => a.line !== used && ((!!row.hc && !!a.hc && normHc(a.hc) === normHc(row.hc)) || nameMatch(a.name, row.name) >= 2))
    .sort((x, y) => (y.date ?? '').localeCompare(x.date ?? '') || y.line - x.line)
    .slice(0, limit)
}
