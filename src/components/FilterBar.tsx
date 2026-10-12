import { useMemo } from 'react'
import { FILTERS, FILTER_LABELS, inFilter, type Filter, type Item } from '../overview.ts'

/** Los filtros de la semana, con la cuenta de cada uno. El de fecha o presencia va en rojo: es lo que más importa. */
export default function FilterBar({ items, filter, onFilter }: { items: Item[]; filter: Filter; onFilter: (f: Filter) => void }) {
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f, items.filter((i) => inFilter(i.flags, f)).length])) as Record<Filter, number>, [items])
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filtrar">
      {FILTERS.map((f) => (
        <button
          key={f}
          className={`btn btn-sm shrink-0 ${f === 'presence' ? (filter === f ? 'btn-error' : 'btn-soft btn-error') : filter === f ? 'btn-primary' : 'btn-soft'}`}
          aria-pressed={filter === f}
          disabled={f !== 'all' && !counts[f] && filter !== f}
          onClick={() => onFilter(f)}
        >
          {FILTER_LABELS[f]} <span className="badge badge-xs">{counts[f]}</span>
        </button>
      ))}
    </div>
  )
}
