import { dayOfWeek } from '../dates.ts'
import { DAY_LABELS, FIELD_LABELS, longDate } from '../format.ts'
import { useStore } from '../store.ts'
import type { Field, Row } from '../types.ts'
import Icon from './Icon.tsx'
import { originLabel } from './RowParts.tsx'

/** Lo que tiene la cirugía además de las dioptrías, por si están en las notas o en otro dato. */
const CONTEXT: Field[] = ['surgery', 'eye', 'surgeon', 'assistant', 'duration', 'anesthesia', 'contact', 'phone', 'notes', 'extra']

/**
 * Revisión del lente de una cirugía: muestra todo lo que tiene (las dioptrías pueden estar en las notas o en otro lado),
 * deja cargar las dioptrías a mano y reconocer que así está bien. Lo que se escribe se guarda al escribirlo.
 */
export default function LensDialog({
  row,
  checked,
  onCheck,
  onSource,
  onClose,
}: {
  row: Row
  /** La revisión de esta cirugía está tildada */
  checked: boolean
  onCheck: (done: boolean) => void
  onSource: () => void
  onClose: () => void
}) {
  const setEdit = useStore((s) => s.setEdit)
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
          {FIELD_LABELS.diopters}
          {/* texto libre, como todos los campos (para poder anotar) */}
          <input className="input w-full font-normal" value={row.diopters} placeholder="Sin dioptrías cargadas" onChange={(e) => setEdit(row, 'diopters', e.target.value)} />
        </label>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={checked} onChange={(e) => onCheck(e.target.checked)} />
          {row.diopters.trim() ? 'Revisé el lente' : 'Revisé el lente: así está bien sin dioptrías'}
        </label>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-base-300 pt-3 text-sm">
          {CONTEXT.filter((f) => row[f].trim()).map((f) => (
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
