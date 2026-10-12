import esLocale from '@fullcalendar/core/locales/es'
import type { EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import FullCalendar from '@fullcalendar/react'
import { useCallback, useMemo, useRef } from 'react'
import { addDaysTo } from '../dates.ts'
import { flagNotes, rowFlags, type Flags } from '../overview.ts'
import type { Excluded, Row } from '../types.ts'
import Icon from './Icon.tsx'

// Constantes fuera del componente: si cambian de identidad, FullCalendar re-renderiza todo.
const PLUGINS = [dayGridPlugin]
const LOCALES = [esLocale]
const DAY_HEADER = { weekday: 'short', day: 'numeric', month: 'numeric' } as const
/** Ancho mínimo de cada día: en el teléfono el calendario se desliza hacia los costados en vez de apretar los nombres. */
const DAY_MIN_REM = 7.5

type Ext = { row: Row; flags: Flags; notes: string }

const renderEvent = (arg: EventContentArg) => {
  const { row, flags, notes } = arg.event.extendedProps as Ext
  const time = row.time.trim()
  const who = [row.eye, row.surgeon].map((s) => s.trim()).filter(Boolean).join(' · ')
  return (
    <div className="q-event-body" title={notes || undefined}>
      <div className="font-bold">
        {(flags.confirm.length > 0 || row.warning) && <Icon name="warning" className="float-right ml-1 size-3.5" />}
        {time && <span className="mr-1 whitespace-nowrap tabular-nums">{time}</span>}
        {row.name || 'Sin nombre'}
      </div>
      <div className="min-w-0">{row.surgery || 'Sin cirugía'}</div>
      {who && <div className="min-w-0 opacity-70">{who}</div>}
    </div>
  )
}

/** Marcas de la fila que cambian el aspecto del evento. */
function classesOf(flags: Flags) {
  const out = ['q-event']
  if (flags.excluded) out.push('q-excluded')
  if (flags.confirm.length) out.push('q-confirm')
  else if (flags.sources.length) out.push('q-sources')
  if (flags.single === 'manual') out.push('q-manual')
  if (!flags.excluded && flags.missing.length) out.push('q-missing')
  return out
}

/** La semana como calendario: una columna por día del rango, una tarjeta por cirugía en el orden del día (sin horas: el horario es texto libre). */
export default function CalendarView({
  from,
  to,
  rows,
  excluded,
  onEdit,
  onSource,
}: {
  from: string
  to: string
  rows: Row[]
  excluded: Excluded[]
  onEdit: (key: string) => void
  onSource: (key: string) => void
}) {
  const events = useMemo<EventInput[]>(() => {
    const items = [...rows.map((row) => ({ row, flags: rowFlags(row) })), ...excluded.map(({ row, reason }) => ({ row, flags: rowFlags(row, reason) }))]
    return items.map(({ row, flags }, idx): EventInput => ({
      id: row.key,
      start: row.date,
      allDay: true,
      title: row.name,
      classNames: classesOf(flags),
      // el orden del día es el del checklist; las sin incluir van al final
      extendedProps: { idx, row, flags, notes: flagNotes(flags).map((n) => n.text).join('\n') } satisfies Ext & { idx: number },
    }))
  }, [rows, excluded])

  // `end` es exclusivo en FullCalendar: el rango llega hasta `to` inclusive
  const visibleRange = useMemo(() => ({ start: from, end: addDaysTo(to, 1) }), [from, to])
  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 + 1

  // FullCalendar vuelve a dibujar todo si alguna de sus funciones cambia de identidad: se llama a la última versión por una ref.
  const click = (arg: EventClickArg) => {
    const { flags } = arg.event.extendedProps as Ext
    if (flags.excluded) onSource(arg.event.id)
    else onEdit(arg.event.id)
  }
  const clickRef = useRef(click)
  clickRef.current = click
  const onEventClick = useCallback((arg: EventClickArg) => clickRef.current(arg), [])

  return (
    <div className="card card-border cal-card bg-base-100">
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${days * DAY_MIN_REM}rem` }}>
          <FullCalendar
            plugins={PLUGINS}
            locales={LOCALES}
            locale="es"
            initialView="dayGrid"
            visibleRange={visibleRange}
            headerToolbar={false}
            height="auto"
            dayMaxEvents={false}
            dayHeaderFormat={DAY_HEADER}
            events={events}
            eventOrder="idx"
            eventContent={renderEvent}
            eventClick={onEventClick}
          />
        </div>
      </div>
    </div>
  )
}
