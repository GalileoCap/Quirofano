import { dayOfWeek } from '../dates.ts'
import { DAY_LABELS, FIELD_LABELS, longDate } from '../format.ts'
import { REQUIRED_FIELDS, rowFlags, type Flags } from '../overview.ts'
import { useStore } from '../store.ts'
import type { Field, Row } from '../types.ts'
import Icon from './Icon.tsx'
import { Chips, Conflicts, mark, originLabel } from './RowParts.tsx'

/** Un dato de la cirugía: título chico y el valor tal cual está en el checklist, con las mismas marcas que el resumen. */
function Fact({ row, flags, field, className = '' }: { row: Row; flags: Flags; field: Field; className?: string }) {
  const value = row[field].trim()
  const missing = !value && REQUIRED_FIELDS.includes(field)
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-base-content/60">{FIELD_LABELS[field]}</dt>
      <dd className="break-words">
        {missing ? (
          <span className="rounded border border-dashed border-error/60 px-1 text-error/80">falta</span>
        ) : value ? (
          <span className={mark(field, flags)}>{value}</span>
        ) : (
          <span className="text-base-content/30">—</span>
        )}
      </dd>
    </div>
  )
}

/** Lo que se completa a mano: el valor si lo hay, "sin completar" si no. */
function Manual({ row, field }: { row: Row; field: Field }) {
  const value = row[field].trim()
  return (
    <div className="min-w-0">
      <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-base-content/60">{FIELD_LABELS[field]}</dt>
      <dd className={`break-words ${value ? 'font-semibold text-success' : 'text-base-content/35'}`}>{value || 'sin completar'}</dd>
    </div>
  )
}

/** La cirugía completa, para mirarla cómoda. Editar es otro paso: abre el formulario. */
export default function DetailDialog({
  row,
  dayRows,
  onEdit,
  onSource,
  onRemove,
  onClose,
}: {
  row: Row
  /** Las cirugías incluidas del mismo día, en orden (para subir y bajar). */
  dayRows: Row[]
  onEdit: () => void
  onSource: () => void
  onRemove: () => void
  onClose: () => void
}) {
  const moveRow = useStore((s) => s.moveRow)
  const keepMine = useStore((s) => s.keepMine)
  const takeSource = useStore((s) => s.takeSource)
  const flags = rowFlags(row)
  const pos = dayRows.findIndex((r) => r.key === row.key)
  const move = (dir: -1 | 1) => moveRow(row.date, dayRows.map((r) => r.key), row.key, dir)

  return (
    <dialog className="modal modal-open modal-bottom sm:modal-middle" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-2xl p-4 sm:p-6">
        <p className="text-sm text-base-content/60">
          {DAY_LABELS[dayOfWeek(row.date)]} {longDate(row.date)}
          {row.time && <span className="badge badge-sm badge-primary badge-soft ml-2 tabular-nums">{row.time}</span>}
        </p>
        <h3 className="font-display text-2xl font-semibold italic text-primary">
          <span className={mark('name', flags)}>{row.name || 'Sin nombre'}</span>
        </h3>
        <p className="mt-0.5 text-sm text-base-content/70">
          <span className="text-base-content/50">HC </span>
          <span className={mark('hc', flags)}>{row.hc || '—'}</span>
          {row.dni && (
            <>
              <span className="text-base-content/50"> · DNI </span>
              {row.dni}
            </>
          )}
        </p>
        <div className="mt-2 empty:hidden">
          <Chips flags={flags} row={row} />
        </div>
        {row.warning && (
          <p className="mt-2 flex items-start gap-1 text-xs">
            <Icon name="warning" className="mt-px size-3.5 shrink-0 text-warning" />
            <span>{row.warning}</span>
          </p>
        )}
        {row.conflicts && (
          <div className="mt-3">
            <Conflicts row={row} onKeepMine={() => keepMine(row.key, row.conflicts ?? [])} onUseSource={() => takeSource(row.key, row.conflicts ?? [])} />
          </div>
        )}

        <div className="mt-4 rounded-box bg-base-200/60 p-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`text-lg font-semibold ${mark('surgery', flags)}`}>{row.surgery.trim() || <span className="rounded border border-dashed border-error/60 px-1 text-base text-error/80">sin cirugía</span>}</span>
            {row.eye.trim() && <span className={`badge badge-secondary badge-soft ${mark('eye', flags)}`}>{row.eye}</span>}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <Fact row={row} flags={flags} field="surgeon" />
            <Fact row={row} flags={flags} field="assistant" />
            <Fact row={row} flags={flags} field="anesthesia" />
            <Fact row={row} flags={flags} field="duration" />
            <Fact row={row} flags={flags} field="diopters" />
            {!row.eye.trim() && <Fact row={row} flags={flags} field="eye" />}
          </dl>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Fact row={row} flags={flags} field="contact" />
          <Fact row={row} flags={flags} field="phone" className="sm:col-span-2" />
        </dl>

        {row.notes.trim() && (
          <div className="mt-4">
            <h4 className="text-[0.65rem] font-bold uppercase tracking-wide text-base-content/60">{FIELD_LABELS.notes}</h4>
            <p className={`mt-0.5 whitespace-pre-line break-words text-sm ${mark('notes', flags)}`}>{row.notes}</p>
          </div>
        )}

        <div className="mt-4 border-t border-base-300 pt-3">
          <h4 className="text-xs font-semibold text-base-content/70">Del checklist (se completan a mano)</h4>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <Manual row={row} field="time" />
            <Manual row={row} field="prequi" />
            <Manual row={row} field="hcCheck" />
            <Manual row={row} field="quirofano" />
            <Manual row={row} field="quiroDia" />
          </dl>
          {row.extra.trim() && (
            <p className="mt-2 whitespace-pre-line break-words text-sm italic text-base-content/80">
              <span className="not-italic text-[0.65rem] font-bold uppercase tracking-wide text-base-content/60">{FIELD_LABELS.extra} </span>
              {row.extra}
            </p>
          )}
        </div>

        <button className="badge badge-ghost mt-4 gap-1" title="Ver de dónde salió cada dato y los datos originales" onClick={onSource}>
          <Icon name="fileText" className="size-3" /> {originLabel(row)}
        </button>

        <div className="modal-action sticky bottom-0 -mx-4 -mb-4 flex-wrap items-center justify-between gap-y-2 border-t border-base-300 bg-base-100 px-4 pb-4 pt-3 sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6">
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-sm btn-square" disabled={pos <= 0} title="Subir en el día" aria-label="Subir en el día" onClick={() => move(-1)}>
              <Icon name="arrowUp" />
            </button>
            <span className="hidden text-xs tabular-nums text-base-content/60 sm:inline">
              {pos + 1} de {dayRows.length}
            </span>
            <button className="btn btn-ghost btn-sm btn-square" disabled={pos === dayRows.length - 1} title="Bajar en el día" aria-label="Bajar en el día" onClick={() => move(1)}>
              <Icon name="arrowDown" />
            </button>
            <button className="btn btn-ghost btn-sm text-error max-sm:btn-square" title="Sacar del checklist" aria-label="Sacar del checklist" onClick={onRemove}>
              <Icon name="close" /> <span className="hidden sm:inline">Sacar</span>
            </button>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={onClose}>
              Cerrar
            </button>
            <button className="btn btn-sm btn-primary" onClick={onEdit}>
              <Icon name="pencil" /> Editar
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
