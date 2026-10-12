import { normName } from './agenda.ts'
import { addDaysTo } from './dates.ts'
import { FIELDS, type AgendaRow, type CalEvent, type CalProblem, type Excluded, type Field, type Row } from './types.ts'

export type MergeInput = {
  agenda: AgendaRow[]
  events: CalEvent[]
  problems: CalProblem[]
  /** Primer y último día (inclusive), 'YYYY-MM-DD' */
  from: string
  to: string
}

export type MergeResult = {
  rows: Row[]
  excluded: Excluded[]
  /** Avisos generales (no de una fila en particular) */
  warnings: string[]
  /** Si el calendar tiene cirugías en estas fechas: si no, se arma solo con la agenda */
  calendarCovers: boolean
}

const tokenCache = new Map<string, string[]>()
const tokens = (s: string) => {
  let t = tokenCache.get(s)
  if (!t) tokenCache.set(s, (t = normName(s).split(' ').filter(Boolean)))
  return t
}

/** 3 = igual · 2 = mismas palabras en otro orden · 1 = una está contenida en la otra · 0 = no es la misma persona. */
export function nameMatch(a: string, b: string): 0 | 1 | 2 | 3 {
  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.length || !tb.length) return 0
  if (ta.join(' ') === tb.join(' ')) return 3
  const sa = new Set(ta)
  const sb = new Set(tb)
  const [small, big] = sa.size <= sb.size ? [sa, sb] : [sb, sa]
  if (![...small].every((t) => big.has(t))) return 0
  return small.size === big.size ? 2 : 1
}

const emptyRow = (date: string, key: string, source: Row['source']): Row => ({
  ...(Object.fromEntries(FIELDS.map((f) => [f, ''])) as Record<Field, string>),
  key,
  date,
  source,
})

function fromAgenda(a: AgendaRow, date: string, key: string, source: Row['source']): Row {
  return {
    ...emptyRow(date, key, source),
    name: a.name,
    hc: a.hc,
    duration: a.duration?.toString() ?? '',
    surgery: a.surgery,
    surgeon: a.surgeon,
    assistant: a.assistant,
    eye: a.eye,
    contact: a.contact,
    phone: a.phone,
    diopters: a.diopters,
    anesthesia: a.anesthesia,
    notes: a.notes,
    dni: a.dni,
    line: a.line,
  }
}

/** HC sin espacios ni separadores raros: '52017 / 00' y '52017:00' son la misma. */
export const normHc = (s: string) => s.toUpperCase().replace(/\s+/g, '').replace(/[:-]/g, '/')

const fmtDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Cirugías de la agenda más probables para un evento del calendar, de mejor a peor. */
function candidates(e: CalEvent, agenda: AgendaRow[], used: Set<AgendaRow>) {
  const out: { row: AgendaRow; score: number }[] = []
  for (const row of agenda) {
    if (used.has(row)) continue
    // la HC identifica a la persona mejor que el nombre (que se escribe de mil maneras)
    const sameHc = !!e.hc && !!row.hc && normHc(e.hc) === normHc(row.hc)
    const m = nameMatch(e.name, row.name)
    if (!m && !sameHc) continue
    const sameDate = row.date === e.date
    // un nombre suelto ("GOMEZ") solo alcanza si la fecha o la HC también coinciden
    if (!sameHc && m === 1 && tokens(e.name).length < 2 && !sameDate) continue
    const score = (sameHc ? 30 : 0) + m * 10 + (sameDate ? 5 : 0) + (normName(row.surgery) === normName(e.surgery) ? 1 : 0)
    out.push({ row, score })
  }
  // a igual puntaje, la carga más reciente (es la que corrige a las anteriores)
  return out.sort((x, y) => y.score - x.score || (y.row.stamp ?? '').localeCompare(x.row.stamp ?? '') || y.row.line - x.row.line)
}

export function mergeChecklist({ agenda, events, problems, from, to }: MergeInput): MergeResult {
  const inRange = (d: string | null): d is string => !!d && d >= from && d <= to
  // la misma cirugía puede estar en dos calendarios: se cuenta una sola vez
  const seenEvents = new Set<string>()
  const surgeries = events.filter((e) => {
    if (e.kind !== 'surgery' || !inRange(e.date)) return false
    const id = `${e.date}|${e.hc ? normHc(e.hc) : normName(e.name)}|${normName(e.surgery)}`
    return !seenEvents.has(id) && !!seenEvents.add(id)
  })
  const suspensions = events.filter((e) => e.kind === 'suspension' && inRange(e.date))
  const calendarCovers = surgeries.length > 0
  const warnings: string[] = []
  const used = new Set<AgendaRow>()
  const rows: Row[] = []
  const excluded: Excluded[] = []
  const keys = new Set<string>()

  const uniqueKey = (date: string, a: { hc: string; name: string }) => {
    const base = `${date}|${a.hc || normName(a.name)}`
    let key = base
    for (let n = 2; keys.has(key); n++) key = `${base}#${n}`
    keys.add(key)
    return key
  }

  for (const p of problems.filter((p) => inRange(p.date)))
    warnings.push(`El evento "${p.title}" del ${fmtDate(p.date)} no tiene el formato "CIRUGÍA / PACIENTE / CIRUJANO": no lo pude cruzar.`)

  // Las cirugías suspendidas no entran (salvo que el calendar las siga mostrando ese mismo día)
  const suspendedRows = new Set<AgendaRow>()
  for (const s of suspensions) {
    if (surgeries.some((e) => e.date === s.date && nameMatch(e.name, s.name))) continue
    const hit = candidates(s, agenda, new Set()).find((c) => c.row.date === s.date)
    if (hit) {
      suspendedRows.add(hit.row)
      excluded.push({ row: fromAgenda(hit.row, s.date, uniqueKey(s.date, hit.row), 'agenda'), reason: 'suspended' })
    } else {
      const row = emptyRow(s.date, uniqueKey(s.date, { hc: s.hc, name: s.name }), 'calendar')
      Object.assign(row, { name: s.name, surgery: s.surgery, surgeon: s.surgeon, assistant: s.assistant, hc: s.hc, eye: s.eye })
      excluded.push({ row, reason: 'suspended' })
    }
  }

  // Cada evento del calendar es una cirugía confirmada: se completa con los datos de la agenda. Primero se reparten las
  // filas con la misma fecha, así una persona con dos cirugías en la semana no se queda con la fila de la otra.
  const matches = new Map<CalEvent, ReturnType<typeof candidates>>()
  for (const pass of [true, false])
    for (const e of surgeries) {
      if (matches.has(e)) continue
      const found = candidates(e, agenda, used)
      if (pass && found[0]?.row.date !== e.date) continue
      if (found[0]) used.add(found[0].row)
      matches.set(e, found)
    }

  for (const e of surgeries) {
    const [best, second] = matches.get(e)!
    if (!best) {
      const row = emptyRow(e.date, uniqueKey(e.date, { hc: e.hc, name: e.name }), 'calendar')
      Object.assign(row, { name: e.name, surgery: e.surgery, surgeon: e.surgeon, assistant: e.assistant })
      Object.assign(row, { eye: e.eye, diopters: e.diopters, hc: e.hc, phone: e.phone })
      row.warning = 'Está en el calendar pero no encontré al paciente en la agenda: completá los datos.'
      rows.push(row)
      continue
    }
    const a = best.row
    const row = fromAgenda(a, e.date, uniqueKey(e.date, a), 'both')
    // lo que la agenda no tiene y el calendar sí
    row.eye ||= e.eye
    row.diopters ||= e.diopters
    row.hc ||= e.hc
    row.phone ||= e.phone
    const notes: string[] = []
    if (e.hc && a.hc && normHc(e.hc) !== normHc(a.hc)) notes.push(`La HC del calendar (${e.hc}) no es la de la agenda (${a.hc}): ¿es la misma persona?`)
    if (a.date !== e.date)
      notes.push(
        a.date
          ? `La agenda tiene a este paciente el ${fmtDate(a.date)}/${a.date.slice(0, 4)}: revisá que los datos sean los de esta cirugía.`
          : 'La fecha de la agenda para esta fila está rota: revisá que los datos sean los de esta cirugía.',
      )
    if (second && second.score === best.score && second.row.date === a.date)
      notes.push('Hay otra fila igual en la agenda: usé la más reciente.')
    if (normName(e.surgeon) && normName(a.surgeon) && nameMatch(e.surgeon, a.surgeon) === 0)
      notes.push(`El calendar dice cirujano "${e.surgeon}" y la agenda "${a.surgeon}".`)
    if (normName(e.surgery) && normName(a.surgery) && normName(e.surgery) !== normName(a.surgery))
      notes.push(`El calendar dice "${e.surgery}" y la agenda "${a.surgery}".`)
    if (notes.length) row.warning = notes.join(' ')
    rows.push(row)
  }

  // Lo que está en la agenda con fecha de la semana pero sin evento en el calendar
  const seen = new Map<string, AgendaRow>()
  for (const a of agenda) {
    if (!inRange(a.date) || used.has(a) || suspendedRows.has(a)) continue
    const dup = `${a.date}|${a.hc || normName(a.name)}|${normName(a.surgery)}`
    const prev = seen.get(dup)
    if (prev && (prev.stamp ?? '') >= (a.stamp ?? '')) continue
    seen.set(dup, a)
  }
  for (const a of seen.values()) {
    const row = fromAgenda(a, a.date!, uniqueKey(a.date!, a), 'agenda')
    if (calendarCovers) excluded.push({ row, reason: 'not-in-calendar' })
    else rows.push(row)
  }

  if (!calendarCovers && agenda.length && events.length)
    warnings.push('El calendar no tiene cirugías en estas fechas: armé el checklist solo con la fecha de la agenda.')

  const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date)
  return { rows: rows.sort(byDate), excluded: excluded.sort((a, b) => byDate(a.row, b.row)), warnings, calendarCovers }
}

/** Los siete días (lunes a domingo) de la semana que empieza en `monday`. */
export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDaysTo(monday, i))
