import { FIELD_LABELS } from '../format.ts'
import { useStore } from '../store.ts'
import type { Field, Row } from '../types.ts'
import Icon from './Icon.tsx'

/** Casilla de las columnas del checklist que se completan a mano. */
function Check({ row, field, label, className = '' }: { row: Row; field: Field; label: string; className?: string }) {
  const setEdit = useStore((s) => s.setEdit)
  return (
    <label className={`flex min-w-0 flex-col gap-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-base-content/60 ${className}`}>
      {label}
      <input className="cell-input font-normal normal-case tracking-normal text-base-content" value={row[field]} onChange={(e) => setEdit(row, field, e.target.value)} />
    </label>
  )
}

/** De qué fuentes salió la fila, como texto corto: "Agenda L214 + Calendar". */
const originLabel = (row: Row) => {
  const { agenda, event } = row.origin ?? {}
  return [agenda && `Agenda L${agenda.line}`, event && 'Calendar'].filter(Boolean).join(' + ') || 'A mano'
}

const Detail = ({ label, value }: { label: string; value: string }) =>
  value ? (
    <span className="whitespace-nowrap">
      <span className="text-base-content/50">{label} </span>
      {value}
    </span>
  ) : null

export default function RowCard({
  row,
  first,
  last,
  onMove,
  onEdit,
  onRemove,
  onKeepMine,
  onUseSource,
  onSource,
}: {
  row: Row
  first: boolean
  last: boolean
  onMove: (dir: -1 | 1) => void
  onEdit: () => void
  onRemove: () => void
  onKeepMine: () => void
  onUseSource: () => void
  onSource: () => void
}) {
  return (
    <li className="card card-border bg-base-100">
      <div className="card-body gap-2 p-2.5 sm:p-3">
        <div className="flex items-start gap-1.5">
          <div className="flex shrink-0 flex-col">
            <button className="btn btn-ghost btn-xs btn-square" disabled={first} title="Subir" aria-label="Subir" onClick={() => onMove(-1)}>
              <Icon name="arrowUp" />
            </button>
            <button className="btn btn-ghost btn-xs btn-square" disabled={last} title="Bajar" aria-label="Bajar" onClick={() => onMove(1)}>
              <Icon name="arrowDown" />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {row.time && <span className="badge badge-sm badge-primary badge-soft tabular-nums">{row.time}</span>}
              <span className="font-bold">{row.name || 'Sin nombre'}</span>
              <span className="text-xs text-base-content/60">{row.hc}</span>
              {row.source === 'calendar' && <span className="badge badge-sm badge-warning">Solo en el calendar</span>}
              {row.source === 'manual' && <span className="badge badge-sm badge-ghost">Agregado a mano</span>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm">
              <span>{row.surgery || 'Sin cirugía'}</span>
              {row.eye && <span className="badge badge-sm badge-secondary badge-soft">{row.eye}</span>}
              {row.duration && <span className="text-xs text-base-content/50">{row.duration} min</span>}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0 text-xs text-base-content/80">
              <Detail label="Cirujano" value={row.surgeon} />
              <Detail label="Ayudante" value={row.assistant} />
              <Detail label="Anestesia" value={row.anesthesia} />
              <Detail label="Dioptrías" value={row.diopters} />
              <Detail label="Tel." value={[row.contact, row.phone].filter(Boolean).join(' ')} />
              <Detail label="DNI" value={row.dni} />
            </div>
            <button className="badge badge-sm badge-ghost mt-1 gap-1" title="Ver de dónde salió cada dato y los datos originales" onClick={onSource}>
              <Icon name="fileText" className="size-3" /> {originLabel(row)}
            </button>
            {row.notes && <p className="mt-0.5 text-xs italic text-base-content/70">{row.notes}</p>}
            {row.warning && (
              <p className="mt-1 flex items-start gap-1 text-xs text-warning-content">
                <Icon name="warning" className="mt-px size-3.5 text-warning" />
                <span>{row.warning}</span>
              </p>
            )}
          </div>
          <div className="flex shrink-0">
            <button className="btn btn-ghost btn-sm btn-square" title="Editar" aria-label="Editar" onClick={onEdit}>
              <Icon name="pencil" />
            </button>
            <button className="btn btn-ghost btn-sm btn-square text-error" title="Sacar del checklist" aria-label="Sacar del checklist" onClick={onRemove}>
              <Icon name="close" />
            </button>
          </div>
        </div>
        {row.conflicts && (
          <div role="alert" className="alert alert-warning alert-soft flex-col items-start gap-1.5 p-2 text-xs text-base-content">
            <p className="font-semibold">Difiere de la agenda/el calendar:</p>
            <ul className="flex flex-col gap-0.5">
              {row.conflicts.map((c) => (
                <li key={c.field}>
                  <span className="font-semibold">{FIELD_LABELS[c.field]}</span>: en el checklist <q>{c.mine || 'vacío'}</q>, ahora dice <q>{c.now || 'vacío'}</q>
                  {c.was !== undefined && c.was !== c.now && <span className="text-base-content/60"> (antes decía <q>{c.was || 'vacío'}</q>)</span>}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button className="btn btn-xs" onClick={onKeepMine}>
                Dejar el mío
              </button>
              <button className="btn btn-xs btn-primary" onClick={onUseSource}>
                Usar el de la agenda/calendar
              </button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-[1fr_1fr_1fr_2fr]">
          <Check row={row} field="time" label="Horario" />
          <Check row={row} field="prequi" label="Prequi" />
          <Check row={row} field="hcCheck" label="HC" />
          <Check row={row} field="extra" label="Notas" className="col-span-3 sm:col-span-1" />
        </div>
      </div>
    </li>
  )
}
