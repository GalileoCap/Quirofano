import { useMemo } from 'react'
import { parseAgenda } from './agenda.ts'
import { applyEdits, sortRows, weekRange } from './checklist.ts'
import { addDaysTo, mondayOf, today } from './dates.ts'
import { classifyEvents } from './ics.ts'
import { mergeChecklist } from './merge.ts'
import { findOrphans, type Orphan } from './review.ts'
import { useSources, useStore } from './store.ts'
import { suggestions } from './suggest.ts'
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

/** Valores usados en el último año en la agenda y el calendar, para sugerir al escribir. */
export function useSuggestions() {
  const agenda = useAgenda()
  const { events } = useCalendarEvents()
  return useMemo(() => suggestions(agenda, events, { since: addDaysTo(today(), -365) }), [agenda, events])
}

export type Checklist = {
  rows: Row[]
  excluded: Excluded[]
  warnings: string[]
  /** Si hay agenda cargada */
  hasAgenda: boolean
}

/** El checklist de la semana que empieza en `monday` (solo los días del rango elegido): cruce agenda + calendar, con lo editado a mano encima. */
export function useChecklist(monday: string): Checklist {
  const agenda = useAgenda()
  const { events, problems } = useCalendarEvents()
  const { edits, bases, order, included, manualRows, ranges } = useStore()
  const { from, to } = weekRange(monday, ranges)

  const merged = useMemo(
    () => mergeChecklist({ agenda, events, problems, from, to }),
    [agenda, events, problems, from, to],
  )

  return useMemo(() => {
    const kept: Row[] = []
    const excluded: Excluded[] = []
    for (const r of merged.rows) {
      if (included[r.key] === false) excluded.push({ row: r, reason: 'removed' })
      else kept.push(r)
    }
    for (const x of merged.excluded) {
      if (included[x.row.key] === true) kept.push(x.row)
      else excluded.push(x)
    }
    for (const r of manualRows) if (r.date >= from && r.date <= to) kept.push(r)
    const rows = sortRows(applyEdits(kept, edits, bases), order)
    return { rows, excluded, warnings: merged.warnings, hasAgenda: agenda.length > 0 }
  }, [merged, edits, bases, order, included, manualRows, from, to, agenda.length])
}

/**
 * Filas con trabajo manual que ya no están en las fuentes (se movieron de día, se cancelaron o se borraron).
 * Mira las semanas de lo que se tocó, de la semana pasada en adelante, y las vecinas por si se movieron.
 */
export function useOrphans(): Orphan[] {
  const agenda = useAgenda()
  const { events, problems } = useCalendarEvents()
  const { edits, included, snaps } = useStore()
  const from = addDaysTo(today(), -7)

  const mondays = useMemo(() => {
    const set = new Set<string>()
    for (const s of Object.values(snaps)) {
      if (s.date < from) continue
      const m = mondayOf(s.date)
      for (const d of [-7, 0, 7]) set.add(addDaysTo(m, d))
    }
    return [...set].toSorted()
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
