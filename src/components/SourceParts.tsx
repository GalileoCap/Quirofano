import { AGENDA_COLUMNS } from '../agenda.ts'
import { longDate } from '../format.ts'
import type { AgendaRow } from '../types.ts'

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Qué se hizo con una celda de la agenda: nada, se ignora o se lee distinto de como está escrita. */
function note(raw: string, read: string, isDate?: boolean) {
  if (!raw.trim()) return null
  if (!read) return isDate ? 'no se pudo leer como fecha' : 'se ignora'
  if (isDate) return null
  return squash(raw) === read ? null : `se lee como «${read}»`
}

/** Las celdas de una fila de la agenda tal como están en el CSV, con lo que la app entendió de cada una. */
export function AgendaCells({ row }: { row: AgendaRow }) {
  const shown = AGENDA_COLUMNS.map((c, i) => ({ c, i, raw: row.cells[i] ?? '' })).filter((x) => x.raw.trim())
  const empty = AGENDA_COLUMNS.length - shown.length
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {shown.map(({ c, i, raw }) => {
        const n = note(raw, c.read(row), c.date)
        return (
          <div key={i} className="contents">
            <dt className="text-base-content/60">{c.label}</dt>
            <dd className="min-w-0 break-words">
              <code className="whitespace-pre-wrap rounded bg-base-200 px-1">{raw}</code>
              {n && <span className="ml-1.5 text-warning-content/80">· {n}</span>}
            </dd>
          </div>
        )
      })}
      {empty > 0 && <p className="col-span-2 text-base-content/50">{empty} {empty === 1 ? 'celda vacía' : 'celdas vacías'}</p>}
    </dl>
  )
}

/** Un evento del calendar tal como viene en el .ics. */
export function EventRaw({ event }: { event: { calendar: string; date: string; title: string; description: string } }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt className="text-base-content/60">Calendario</dt>
      <dd>{event.calendar || '—'}</dd>
      <dt className="text-base-content/60">Fecha</dt>
      <dd>{longDate(event.date)}</dd>
      <dt className="text-base-content/60">Título</dt>
      <dd className="min-w-0 break-words">
        <code className="whitespace-pre-wrap rounded bg-base-200 px-1">{event.title}</code>
      </dd>
      <dt className="text-base-content/60">Descripción</dt>
      <dd className="min-w-0 break-words">
        {event.description ? <code className="whitespace-pre-wrap rounded bg-base-200 px-1">{event.description}</code> : <span className="text-base-content/50">sin descripción</span>}
      </dd>
    </dl>
  )
}
