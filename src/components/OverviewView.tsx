import { useMemo, useState } from 'react'
import { dayOfWeek } from '../dates.ts'
import { DAY_LABELS, shortDate } from '../format.ts'
import { weekDays } from '../merge.ts'
import { FILTERS, FILTER_LABELS, REQUIRED_FIELDS, inFilter, rowFlags, type Filter, type Flags } from '../overview.ts'
import type { Excluded, Field, Row } from '../types.ts'
import Icon from './Icon.tsx'
import { Chips, mark } from './RowParts.tsx'

type Item = { row: Row; flags: Flags }

function Cell({ item, field, className = '' }: { item: Item; field: Field; className?: string }) {
  const value = item.row[field]
  const missing = !value.trim() && REQUIRED_FIELDS.includes(field)
  return (
    <span className={`min-w-0 truncate ${className}`} title={value || undefined}>
      {missing ? <span className="rounded border border-dashed border-error/60 px-1 text-error/80">falta</span> : <span className={mark(field, item.flags)}>{value}</span>}
    </span>
  )
}

/** Una columna que se completa a mano: el valor si lo hay, un punto apagado si no. */
const Manual = ({ row, field, label }: { row: Row; field: Field; label: string }) => (
  <span className={`flex items-center gap-1 text-xs ${row[field].trim() ? 'font-semibold text-success' : 'text-base-content/35'}`} title={`${label}: ${row[field] || 'sin completar'}`}>
    <span className="text-[0.6rem] font-bold uppercase tracking-wide">{label}</span>
    {row[field].trim() ? <Icon name="check" className="size-3.5" /> : <span aria-label="sin completar">·</span>}
  </span>
)

const GRID = 'sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1.5fr)_5.5rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem]'

export default function OverviewView({
  monday,
  rows,
  excluded,
  onView,
  onEdit,
  onSource,
  onInclude,
}: {
  monday: string
  rows: Row[]
  excluded: Excluded[]
  onView: (key: string) => void
  onEdit: (key: string) => void
  onSource: (key: string) => void
  onInclude: (row: Row) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const items = useMemo<Item[]>(
    () => [...rows.map((row) => ({ row, flags: rowFlags(row) })), ...excluded.map(({ row, reason }) => ({ row, flags: rowFlags(row, reason) }))],
    [rows, excluded],
  )

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f, items.filter((i) => inFilter(i.flags, f)).length])) as Record<Filter, number>, [items])

  const days = weekDays(monday)
    .map((date) => ({
      date,
      shown: items.filter((i) => i.row.date === date && inFilter(i.flags, filter)),
      included: rows.filter((r) => r.date === date).length,
      all: items.filter((i) => i.row.date === date).length,
    }))
    .filter((d) => d.shown.length)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filtrar">
        {FILTERS.map((f) => (
          <button key={f} className={`btn btn-sm shrink-0 ${filter === f ? 'btn-primary' : 'btn-soft'}`} aria-pressed={filter === f} disabled={f !== 'all' && !counts[f] && filter !== f} onClick={() => setFilter(f)}>
            {FILTER_LABELS[f]} <span className="badge badge-xs">{counts[f]}</span>
          </button>
        ))}
      </div>

      {!days.length && <p className="py-8 text-center text-base-content/60">{filter === 'all' ? 'No hay cirugías esta semana.' : 'Ninguna cirugía en este filtro.'}</p>}

      {days.map(({ date, shown, included, all }) => (
        <section key={date} className="flex flex-col gap-1">
          <h3 className="flex items-baseline gap-2 px-1">
            <span className="font-display text-lg font-semibold italic text-primary">{DAY_LABELS[dayOfWeek(date)]}</span>
            <span className="text-sm text-base-content/60">
              {shortDate(date)} ·{' '}
              {filter === 'all'
                ? `${included} ${included === 1 ? 'cirugía' : 'cirugías'}${all > included ? ` · ${all - included} sin incluir` : ''}`
                : `${shown.length} de ${all}`}
            </span>
          </h3>
          <ul className="card card-border divide-y divide-base-300 bg-base-100">
            {shown.map((item) => {
              const { row, flags } = item
              return (
                <li key={row.key} className={flags.excluded ? 'bg-base-200/60' : ''}>
                  <div className="flex items-start gap-1 p-1.5 sm:p-2">
                    <button
                      className={`grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded px-1 text-left text-sm hover:bg-base-200/70 sm:gap-x-3 ${GRID} ${flags.excluded ? 'opacity-70' : ''}`}
                      title={flags.excluded ? 'Ver el origen' : 'Ver el detalle de esta cirugía'}
                      onClick={() => (flags.excluded ? onSource(row.key) : onView(row.key))}
                    >
                      <span className="min-w-0 truncate font-bold">{row.name || 'Sin nombre'}</span>
                      <span className="min-w-0 truncate sm:hidden">
                        <Cell item={item} field="eye" />
                      </span>
                      <span className="col-span-2 flex min-w-0 gap-x-2 sm:contents">
                        <Cell item={item} field="surgery" className="flex-1 sm:flex-none" />
                        <Cell item={item} field="eye" className="hidden sm:block" />
                        <Cell item={item} field="surgeon" className="flex-1 text-base-content/80 sm:flex-none" />
                        <Cell item={item} field="assistant" className="hidden text-base-content/80 sm:block" />
                        <Cell item={item} field="duration" className="text-xs tabular-nums text-base-content/60" />
                      </span>
                      <span className="col-span-full empty:hidden">
                        <Chips flags={flags} row={row} />
                      </span>
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-0.5 sm:w-44 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                      {!flags.excluded && (
                        <span className="flex gap-2 pr-1" aria-label="Columnas a mano">
                          <Manual row={row} field="time" label="Hor" />
                          <Manual row={row} field="prequi" label="Pq" />
                          <Manual row={row} field="hcCheck" label="HC" />
                        </span>
                      )}
                      {flags.excluded ? (
                        flags.excluded !== 'suspended' && (
                          <button className="btn btn-xs" onClick={() => onInclude(row)}>
                            Incluir
                          </button>
                        )
                      ) : (
                        <button className="btn btn-ghost btn-xs btn-square" title="Editar" aria-label="Editar" onClick={() => onEdit(row.key)}>
                          <Icon name="pencil" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
