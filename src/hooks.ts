import { useMemo } from 'react'
import { parseAgenda } from './agenda.ts'
import { applyEdits, parseClock, sortRows, withTimes } from './checklist.ts'
import { addDaysTo } from './dates.ts'
import { classifyEvents, parseIcs } from './ics.ts'
import { mergeChecklist } from './merge.ts'
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
      const { events, problems } = classifyEvents(parseIcs(c.text, c.name))
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
  const { edits, order, included, manualRows, dayStart } = useStore()
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
      if (included[x.row.key] === true) kept.push({ ...x.row, warning: x.row.warning })
      else excluded.push(x)
    }
    for (const r of manualRows) if (r.date >= monday && r.date <= sunday) kept.push(r)
    const rows = withTimes(sortRows(applyEdits(kept, edits), order), parseClock(dayStart) ?? 8 * 60)
    return { rows, excluded, warnings: merged.warnings, hasAgenda: agenda.length > 0 }
  }, [merged, edits, order, included, manualRows, dayStart, monday, sunday, agenda.length])
}
