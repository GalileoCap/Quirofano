import { parseCsv } from './csv.ts'
import type { AgendaRow } from './types.ts'

/** 'dd/mm/yyyy' (con o sin hora) → 'YYYY-MM-DD'. Null si no es una fecha: la hoja tiene celdas rotas ('ABARC', '01/062026'…). */
export function parseDate(s: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/.exec(s)
  if (!m) return null
  const [d, mo, y] = [+m[1], +m[2], +m[3]]
  // años absurdos ('0004', '2209') son errores de tipeo en la hoja
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const PLACEHOLDER = /^[.\-–—_\s]*$/

/** Celda limpia: sin espacios de más y sin los "." o "-" que se escriben para decir "nada". */
export const clean = (s: string | undefined) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return PLACEHOLDER.test(t) ? '' : t
}

/** Minutos de '60', '30 min', '90 MIN'… */
const minutes = (s: string) => {
  const m = /\d+/.exec(s)
  return m ? +m[0] : null
}

/** Mayúsculas y sin acentos ni signos: lo que se compara al cruzar nombres. */
export const normName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

type Column = { label: string; read: (a: AgendaRow) => string; date?: boolean }

/** Las 18 columnas de la hoja con su nombre real y cómo se lee cada una (la cabecera del CSV está corrida). */
export const AGENDA_COLUMNS: Column[] = [
  { label: 'Marca temporal', read: (a) => a.stamp ?? '', date: true },
  { label: 'Fecha de la cirugía', read: (a) => a.date ?? '', date: true },
  { label: 'Paciente', read: (a) => a.name },
  { label: 'HC', read: (a) => a.hc },
  { label: 'Duración', read: (a) => a.duration?.toString() ?? '' },
  { label: 'Cirugía', read: (a) => a.surgery },
  { label: 'Cirujano', read: (a) => a.surgeon },
  { label: 'Ayudante', read: (a) => a.assistant },
  { label: 'Ojo', read: (a) => a.eye },
  { label: 'Contacto', read: (a) => a.contact },
  { label: 'Teléfono', read: (a) => a.phone },
  { label: 'Insumo', read: (a) => a.supplies },
  { label: 'Dioptrías', read: (a) => a.diopters },
  { label: 'Anestesia', read: (a) => a.anesthesia },
  { label: 'Pedido B', read: (a) => a.pedidoB },
  { label: 'Observaciones', read: (a) => a.notes },
  { label: 'Edad', read: (a) => a.age },
  { label: 'DNI', read: (a) => a.dni },
]

/**
 * Columnas de la hoja (la cabecera real está corrida: la celda sin título es el ojo y "JERARQUIA" es quién contesta):
 * 0 marca temporal · 1 fecha de la cirugía · 2 paciente · 3 HC · 4 duración · 5 cirugía · 6 cirujano · 7 ayudante ·
 * 8 ojo · 9 contacto · 10 teléfono · 11 insumo · 12 dioptrías · 13 anestesia · 14 pedido B · 15 observaciones · 16 edad · 17 DNI
 */
export function parseAgenda(text: string): AgendaRow[] {
  const rows = parseCsv(text)
  const out: AgendaRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!clean(r[2]) && !clean(r[3])) continue
    out.push({
      line: i + 1,
      stamp: parseDate(r[0] ?? ''),
      date: parseDate(r[1] ?? ''),
      name: clean(r[2]),
      hc: clean(r[3]),
      duration: minutes(r[4] ?? ''),
      surgery: clean(r[5]),
      surgeon: clean(r[6]),
      assistant: clean(r[7]),
      eye: clean(r[8]),
      contact: clean(r[9]),
      phone: clean(r[10]),
      supplies: clean(r[11]),
      diopters: clean(r[12]),
      anesthesia: clean(r[13]),
      pedidoB: clean(r[14]),
      notes: clean(r[15]),
      age: clean(r[16]),
      dni: clean(r[17]),
      cells: r,
    })
  }
  return out
}
