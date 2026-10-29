import { clean, normName, parseDate } from './agenda.ts'
import type { DayRange } from './checklist.ts'
import { parseCsv } from './csv.ts'
import { nameMatch, normHc } from './merge.ts'
import { FIELDS, type Excluded, type Field, type Fields, type Row } from './types.ts'

/** Una cirugía del checklist cargado: su línea en el CSV, su día y lo que dice cada columna que la app conoce. */
export type SheetRow = { line: number; date: string; values: Partial<Fields> }

/** Un checklist armado afuera. `ignored` son las columnas con datos que la app no tiene, para decir que no se comparan. */
export type Sheet = { rows: SheetRow[]; columns: Field[]; ignored: string[] }

type Column = Field | 'date' | null

/** Las columnas del CSV que exporta la app (`toSheet`), que es también el de la planilla "Checklist". */
const EXPORT_COLUMNS: Column[] = ['date', 'name', 'hc', 'duration', 'time', 'surgery', 'surgeon', 'assistant', 'eye', 'contact', 'phone', 'diopters', 'anesthesia', 'notes', 'dni', 'prequi', 'hcCheck', 'extra', null, 'quirofano', 'quiroDia']

/** Nombres de columna de una planilla armada a mano (ya pasados por `normName`). En esa planilla NUMERO es la HC y HC es la casilla. */
const HEADERS: [RegExp, Field | 'date'][] = [
  [/^FECHA/, 'date'],
  [/^PACIENTE/, 'name'],
  [/^(NUMERO|NRO|HISTORIA)/, 'hc'],
  [/^HC$/, 'hcCheck'],
  [/^DURACION/, 'duration'],
  [/^HORA/, 'time'],
  [/^CIRUGIA/, 'surgery'],
  [/^CIRUJANO/, 'surgeon'],
  [/^AYUDANTE/, 'assistant'],
  [/^OJO/, 'eye'],
  [/^CONTACTO/, 'contact'],
  [/^TELEF/, 'phone'],
  [/^DIOPTRIA/, 'diopters'],
  [/^ANESTESIA/, 'anesthesia'],
  [/^(COMENTARIO|OBSERVACION)/, 'notes'],
  [/^DNI/, 'dni'],
  [/^PREQUI/, 'prequi'],
  [/^NOTAS?$/, 'extra'],
  [/^QUIROFANO/, 'quirofano'],
  [/^(QUIRO|HOSPITAL) DIA/, 'quiroDia'],
]

/** La fila de cabecera y qué campo es cada columna, o null si el archivo no parece un checklist. */
function layout(cells: string[][]): { header: number; columns: Column[] } | null {
  for (let i = 0; i < Math.min(cells.length, 5); i++) {
    const names = cells[i].map((c) => normName(c))
    if (names[EXPORT_COLUMNS.indexOf('quirofano')] === 'QUIROFANO' && names.slice(0, 19).every((n) => !n)) return { header: i, columns: EXPORT_COLUMNS }
    if (names.includes('PACIENTE') && names.some((n) => n.startsWith('FECHA'))) {
      const columns = names.map((n) => HEADERS.find(([re]) => re.test(n))?.[1] ?? null)
      return { header: i, columns }
    }
  }
  return null
}

/** Lee un checklist armado afuera (la planilla de la residente o el CSV que exporta la app). */
export function parseSheet(text: string): Sheet | null {
  const cells = parseCsv(text)
  const found = layout(cells)
  if (!found) return null
  const { header, columns } = found
  const rows: SheetRow[] = []
  const withData = new Set<number>()
  cells.slice(header + 1).forEach((line, i) => {
    const date = parseDate(line[columns.indexOf('date')] ?? '')
    const values: Partial<Fields> = {}
    columns.forEach((f, c) => {
      if (f && f !== 'date') values[f] = clean(line[c])
    })
    // las filas sin fecha son los títulos de cada día y los separadores
    if (!date || !(values.name || values.hc || values.surgery)) return
    line.forEach((v, c) => clean(v) && !columns[c] && withData.add(c))
    rows.push({ line: header + i + 2, date, values })
  })
  const names = cells[header]
  return {
    rows,
    columns: FIELDS.filter((f) => columns.includes(f)),
    ignored: [...withData].toSorted((a, b) => a - b).map((c) => clean(names[c]) || `columna ${c + 1}`),
  }
}

/** Una diferencia entre el checklist cargado y el de la app, con lo que se haría al aplicarla. */
export type Change =
  /** Un campo distinto en la misma cirugía: aplicar lo escribe a mano */
  | { kind: 'field'; id: string; date: string; row: Row; field: Field; mine: string; theirs: string }
  /** Está en el checklist cargado y no en la app: aplicar la incluye si está en Sin incluir, o la agrega a mano */
  | { kind: 'missing'; id: string; date: string; sheet: SheetRow; excluded?: Row; otherDate?: string }
  /** Está en la app y no en el checklist cargado: aplicar la saca */
  | { kind: 'extra'; id: string; date: string; row: Row; otherDate?: string }

export type Comparison = {
  changes: Change[]
  /** Cirugías que están en los dos sin ninguna diferencia */
  equal: number
  /** Filas del checklist cargado fuera de los días que arma la app: no se comparan */
  outside: SheetRow[]
}

type Person = { hc?: string; name?: string }

const sameHc = (a: Person, b: Person) => !!a.hc && !!b.hc && normHc(a.hc) === normHc(b.hc)
// "PEREZ" contra "PEREZ JUAN" no alcanza: hacen falta dos palabras en común
const sameName = (a: Person, b: Person) => {
  const m = nameMatch(a.name ?? '', b.name ?? '')
  return m >= 2 || (m === 1 && Math.min(normName(a.name ?? '').split(' ').length, normName(b.name ?? '').split(' ').length) >= 2)
}
const samePerson = (a: Person, b: Person) => sameHc(a, b) || sameName(a, b)

/** Lo que se compara de un campo: sin espacios de más, sin "." ni "-" de relleno y sin distinguir mayúsculas. */
const comparable = (s: string | undefined) => clean(s).toUpperCase()

/** Compara un checklist cargado con el que arma la app en `range` (`rows` y lo que quedó en Sin incluir). */
export function compareSheet(sheet: Sheet, rows: Row[], excluded: Excluded[], range: DayRange): Comparison {
  const inRange = sheet.rows.filter((s) => s.date >= range.from && s.date <= range.to)
  const outside = sheet.rows.filter((s) => !inRange.includes(s))
  const pairs = new Map<SheetRow, Row>()
  const taken = new Set<Row>()
  // primero la HC, que identifica mejor, y después el nombre
  for (const match of [sameHc, sameName])
    for (const s of inRange) {
      if (pairs.has(s)) continue
      const r = rows.find((x) => !taken.has(x) && x.date === s.date && match(x, s.values))
      if (r) {
        pairs.set(s, r)
        taken.add(r)
      }
    }

  const changes: Change[] = []
  let equal = 0
  const others = excluded.map((x) => x.row)
  for (const s of inRange) {
    const r = pairs.get(s)
    if (!r) {
      const out = others.find((x) => x.date === s.date && samePerson(x, s.values))
      const elsewhere = rows.find((x) => !taken.has(x) && x.date !== s.date && samePerson(x, s.values))
      changes.push({ kind: 'missing', id: `missing|${s.line}`, date: s.date, sheet: s, excluded: out, otherDate: out ? undefined : elsewhere?.date })
      continue
    }
    const diffs = sheet.columns.filter((f) => comparable(r[f]) !== comparable(s.values[f]))
    if (!diffs.length) equal++
    for (const f of diffs) changes.push({ kind: 'field', id: `field|${r.key}|${f}`, date: s.date, row: r, field: f, mine: r[f], theirs: s.values[f] ?? '' })
  }
  for (const r of rows) {
    if (taken.has(r)) continue
    const elsewhere = inRange.find((s) => !pairs.has(s) && s.date !== r.date && samePerson(r, s.values))
    changes.push({ kind: 'extra', id: `extra|${r.key}`, date: r.date, row: r, otherDate: elsewhere?.date })
  }
  // por día; el orden es estable, así que dentro del día queda el del archivo y después lo que sobra
  return { changes: changes.toSorted((a, b) => a.date.localeCompare(b.date)), equal, outside }
}
