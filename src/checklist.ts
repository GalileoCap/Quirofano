import { toCsv, toTsv } from './csv.ts'
import { dayOfWeek } from './dates.ts'
import { fieldsOf, resolveEdit } from './review.ts'
import type { Field, Row } from './types.ts'

/** Lo que el usuario cambió a mano, por fila (clave de `Row.key`) y por campo. */
export type Edits = Record<string, Partial<Record<Field, string>>>

export const DAY_NAMES = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO']
export const dayName = (date: string) => DAY_NAMES[dayOfWeek(date)]

/**
 * Pone las ediciones a mano encima de lo que salió del cruce, y deja en cada fila lo que salió del cruce (`src`) y
 * los campos escritos a mano que difieren de las fuentes sin confirmar (`conflicts`). `bases` es lo que decían las
 * fuentes cuando se confirmó cada campo.
 */
export const applyEdits = (rows: Row[], edits: Edits, bases: Edits = {}): Row[] =>
  rows.map((r) => {
    const src = fieldsOf(r)
    if (!edits[r.key]) return { ...r, src }
    const { edit, conflicts } = resolveEdit(src, edits[r.key], bases[r.key])
    return { ...r, ...edit, src, ...(conflicts.length ? { conflicts } : {}) }
  })

/** Ordena cada día según el orden elegido; lo que no está en la lista (filas nuevas) queda al final, en su orden original. */
export function sortRows(rows: Row[], order: Record<string, string[]>): Row[] {
  const pos = (r: Row) => {
    const i = order[r.date]?.indexOf(r.key) ?? -1
    return i < 0 ? Infinity : i
  }
  // Array.sort es estable: lo que empata conserva el orden del cruce
  return [...rows].sort((a, b) => a.date.localeCompare(b.date) || pos(a) - pos(b))
}

const HEADER_TOP = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'QUIROFANO', 'QUIRO DIA']

const dmy = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`

/**
 * Las filas con la forma de la planilla "Checklist": una fila de encabezado, y por día (del último al primero) su
 * nombre y las cirugías. Columnas: fecha, paciente, HC, duración, horario, cirugía, cirujano, ayudante, ojo, contacto,
 * teléfono, dioptrías, anestesia, observaciones, DNI, PREQUI, HC, notas, (vacía), QUIRÓFANO, QUIRÓ DÍA.
 */
export function toSheet(rows: Row[]): string[][] {
  const days = [...new Set(rows.map((r) => r.date))].sort().reverse()
  const out: string[][] = [HEADER_TOP]
  days.forEach((date, i) => {
    if (i > 0) out.push(HEADER_TOP.map(() => ''))
    const head = HEADER_TOP.map(() => '')
    head[5] = dayName(date)
    if (i === 0) [head[15], head[16]] = ['PREQUI', 'HC']
    out.push(head)
    for (const r of rows.filter((x) => x.date === date))
      out.push([
        dmy(date),
        r.name,
        r.hc,
        r.duration,
        r.time,
        r.surgery,
        r.surgeon,
        r.assistant,
        r.eye,
        r.contact,
        r.phone,
        r.diopters,
        r.anesthesia,
        r.notes,
        r.dni,
        r.prequi,
        r.hcCheck,
        r.extra,
        '',
        r.quirofano,
        r.quiroDia,
      ])
  })
  return out
}

export const sheetTsv = (rows: Row[]) => toTsv(toSheet(rows))
export const sheetCsv = (rows: Row[]) => toCsv(toSheet(rows))
