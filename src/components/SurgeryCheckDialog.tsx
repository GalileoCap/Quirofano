import { clean } from '../agenda.ts'
import { dayOfWeek } from '../dates.ts'
import { DAY_LABELS, FIELD_LABELS, longDate } from '../format.ts'
import { useStore } from '../store.ts'
import type { Field, Row } from '../types.ts'
import Icon from './Icon.tsx'
import { originLabel } from './RowParts.tsx'

/** Lo que tiene la cirugía, por si el dato que falta está en las notas o en otro lado. */
const CONTEXT: Field[] = ['surgery', 'eye', 'surgeon', 'assistant', 'duration', 'anesthesia', 'contact', 'phone', 'notes', 'extra']

/** El dato que se revisa desde cada lista de la pestaña Tareas: su campo, el texto vacío y lo que dice la casilla. */
export const CHECKS = {
  diopters: { placeholder: 'Sin dioptrías cargadas', label: (has: boolean) => (has ? 'Revisé el lente' : 'Revisé el lente: así está bien sin dioptrías') },
  phone: { placeholder: 'Sin teléfono cargado', label: (has: boolean) => (has ? 'Teléfono revisado' : 'Así está bien sin teléfono') },
} as const

export type CheckField = keyof typeof CHECKS

/**
 * Revisión de un dato de una cirugía (dioptrías o teléfono): muestra todo lo que tiene la cirugía,
 * deja cargar el dato a mano y reconocer que así está bien. Lo que se escribe se guarda al escribirlo.
 */
export default function SurgeryCheckDialog({
  row,
  field,
  checked,
  onCheck,
  onSource,
  onClose,
}: {
  row: Row
  field: CheckField
  /** La casilla de esta cirugía está tildada */
  checked: boolean
  onCheck: (done: boolean) => void
  onSource: () => void
  onClose: () => void
}) {
  const setEdit = useStore((s) => s.setEdit)
  const { placeholder, label } = CHECKS[field]
  const has = !!clean(row[field])
  return (
    <dialog className="modal modal-open modal-bottom sm:modal-middle" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-xl p-4 sm:p-6">
        <p className="text-sm text-base-content/60">
          {DAY_LABELS[dayOfWeek(row.date)]} {longDate(row.date)}
        </p>
        <h3 className="font-display text-2xl font-semibold italic text-primary">{row.name || 'Sin nombre'}</h3>
        <p className="mt-0.5 text-sm text-base-content/70">
          <span className="text-base-content/50">HC </span>
          {row.hc || '—'}
          {row.dni && (
            <>
              <span className="text-base-content/50"> · DNI </span>
              {row.dni}
            </>
          )}
        </p>

        <label className="mt-4 flex flex-col gap-0.5 text-xs font-semibold">
          {FIELD_LABELS[field]}
          {/* texto libre, como todos los campos (para poder anotar) */}
          <input className="input w-full font-normal" value={row[field]} placeholder={placeholder} onChange={(e) => setEdit(row, field, e.target.value)} />
        </label>
        {/* con el teléfono cargado no hay nada que reconocer; con las dioptrías la casilla es la revisión del lente */}
        {(field === 'diopters' || !has) && (
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={checked} onChange={(e) => onCheck(e.target.checked)} />
            {label(has)}
          </label>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-base-300 pt-3 text-sm">
          {CONTEXT.filter((f) => f !== field && row[f].trim()).map((f) => (
            <div key={f} className={`min-w-0 ${f === 'notes' || f === 'extra' ? 'col-span-2' : ''}`}>
              <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-base-content/60">{FIELD_LABELS[f]}</dt>
              <dd className="whitespace-pre-line break-words">{row[f]}</dd>
            </div>
          ))}
        </dl>

        <button className="badge badge-ghost mt-4 gap-1" title="Ver de dónde salió cada dato y los datos originales" onClick={onSource}>
          <Icon name="fileText" className="size-3" /> {originLabel(row)}
        </button>

        <div className="modal-action">
          <button className="btn btn-sm btn-primary" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </dialog>
  )
}
