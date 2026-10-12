import { useMemo } from 'react'
import { parseAgenda } from './agenda.ts'
import { applyEdits, parseClock, sortRows, withTimes } from './checklist.ts'
import { addDaysTo, isoOf, mondayOf } from './dates.ts'
import { classifyEvents } from './ics.ts'
import { mergeChecklist } from './merge.ts'
import { findOrphans, type Orphan } from './review.ts'
import { useSources, useStore } from './store.ts'
import type { Excluded, Row } from './types.ts'

export function useAgenda() {
  const text = useSources((s) => s.agenda?.text)
  return useMemo(() => (text ? parseAgenda(text) : []), [text])
}

export function useCalendarEvents() {
  const calendars = useSources((s) => s.calendars)
  return useMemo(() => {
    const perFile = calendars.map((c) => {
      const { events, problems } = classifyEvents(c.events)
      return { name: c.name, events, problems }
    })
    return {
      perFile,
      events: perFile.flatMap((f) => f.events),
      problems: perFile.flatMap((f) => f.problems),
    }
  }, [calendars])
}

export type Checklist = {
  rows: Row[]
  excluded: Excluded[]
  warnings: string[]
  /** Si hay agenda cargada */
  hasAgenda: boolean
}

/** El checklist de la semana que empieza en `monday`: cruce agenda + calendar, con lo editado a mano encima. */
export function useChecklist(monday: string): Checklist {
  const agenda = useAgenda()
  const { events, problems } = useCalendarEvents()
  const { edits, bases, order, included, manualRows, dayStart } = useStore()
  const sunday = addDaysTo(monday, 6)

  const merged = useMemo(
    () => mergeChecklist({ agenda, events, problems, from: monday, to: sunday }),
    [agenda, events, problems, monday, sunday],
  )

  return useMemo(() => {
    const kept: Row[] = []
    const excluded: Excluded[] = []
    for (const r of merged.rows) {
      if (included[r.key] === false) excluded.push({ row: r, reason: 'removed' })
      else kept.push(r)
    }
    for (const x of merged.excluded) {
      if (included[x.row.key] === true)
        kept.push({ ...x.row, warning: x.row.warning ?? (x.reason === 'not-in-calendar' ? 'La agenda la tiene este día, pero no está en el calendar.' : undefined) })
      else excluded.push(x)
    }
    for (const r of manualRows) if (r.date >= monday && r.date <= sunday) kept.push(r)
    const rows = withTimes(sortRows(applyEdits(kept, edits, bases), order), parseClock(dayStart) ?? 8 * 60)
    return { rows, excluded, warnings: merged.warnings, hasAgenda: agenda.length > 0 }
  }, [merged, edits, bases, order, included, manualRows, dayStart, monday, sunday, agenda.length])
}

/**
 * Filas con trabajo manual que ya no están en las fuentes (se movieron de día, se cancelaron o se borraron).
 * Mira las semanas de lo que se tocó, de la semana pasada en adelante, y las vecinas por si se movieron.
 */
export function useOrphans(): Orphan[] {
  const agenda = useAgenda()
  const { events, problems } = useCalendarEvents()
  const { edits, included, snaps } = useStore()
  const from = addDaysTo(isoOf(new Date()), -7)

  const mondays = useMemo(() => {
    const set = new Set<string>()
    for (const s of Object.values(snaps)) {
      if (s.date < from) continue
      const m = mondayOf(s.date)
      for (const d of [-7, 0, 7]) set.add(addDaysTo(m, d))
    }
    return [...set].sort()
  }, [snaps, from])

  const present = useMemo(
    () =>
      agenda.length || events.length
        ? mondays.flatMap((m) => {
            const r = mergeChecklist({ agenda, events, problems, from: m, to: addDaysTo(m, 6) })
            return [...r.rows, ...r.excluded.map((x) => x.row)]
          })
        : null,
    [agenda, events, problems, mondays],
  )

  return useMemo(() => (present ? findOrphans({ present, snaps, edits, included, from }) : []), [present, snaps, edits, included, from])
}
