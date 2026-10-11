import { toCsv, toTsv } from './csv.ts'
import { dayOfWeek } from './dates.ts'
import type { Field, Row } from './types.ts'

/** Lo que el usuario cambió a mano, por fila (clave de `Row.key`) y por campo. */
export type Edits = Record<string, Partial<Record<Field, string>>>

export const DAY_NAMES = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO']
export const dayName = (date: string) => DAY_NAMES[dayOfWeek(date)]

/** Pone las ediciones a mano encima de lo que salió del cruce. */
export const applyEdits = (rows: Row[], edits: Edits): Row[] =>
  rows.map((r) => (edits[r.key] ? { ...r, ...edits[r.key] } : r))

/** Ordena cada día según el orden elegido; lo que no está en la lista (filas nuevas) queda al final, en su orden original. */
export function sortRows(rows: Row[], order: Record<string, string[]>): Row[] {
  const pos = (r: Row) => {
    const i = order[r.date]?.indexOf(r.key) ?? -1
    return i < 0 ? Infinity : i
  }
  // Array.sort es estable: lo que empata conserva el orden del cruce
  return [...rows].sort((a, b) => a.date.localeCompare(b.date) || pos(a) - pos(b))
}

const pad = (n: number) => String(n).padStart(2, '0')
/** 8 → '8', 8:30 → '8.30', como se escribe en la planilla. */
const clock = (min: number) => (min % 60 ? `${Math.floor(min / 60)}.${pad(min % 60)}` : `${Math.floor(min / 60)}`)

/** '8:00' / '08.00' / '8' → minutos desde la medianoche (null si no se entiende). */
export function parseClock(s: string): number | null {
  const m = /^\s*(\d{1,2})(?:[:.,h](\d{2}))?\s*$/.exec(s)
  if (!m || +m[1] > 23 || (m[2] && +m[2] > 59)) return null
  return +m[1] * 60 + (m[2] ? +m[2] : 0)
}

/**
 * Horario de cada cirugía: una atrás de otra desde la hora de inicio, según la duración (60 min si falta).
 * Si una fila ya trae su horario escrito a mano se respeta y no mueve a las demás.
 */
export function withTimes(rows: Row[], dayStart: number): Row[] {
  const cursor: Record<string, number> = {}
  return rows.map((r) => {
    const start = cursor[r.date] ?? dayStart
    const minutes = +r.duration || 60
    cursor[r.date] = start + minutes
    return r.time.trim() ? r : { ...r, time: `${clock(start)}-${clock(start + minutes)}` }
  })
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
