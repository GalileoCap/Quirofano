import { clean } from '../agenda.ts'
import { dayOfWeek } from '../dates.ts'
import { DAY_LABELS, FIELD_LABELS, longDate } from '../format.ts'
import { useSuggestions } from '../hooks.ts'
import { useStore } from '../store.ts'
import { SUGGESTED_FIELDS } from '../suggest.ts'
import { CALL_HOURS_BEFORE, WEEK_FIELDS, callTime } from '../tasks.ts'
import type { Field, Row } from '../types.ts'
import Icon from './Icon.tsx'
import { originLabel } from './RowParts.tsx'

/** Lo que tiene la cirugía, por si el dato que falta está en las notas o en otro lado. */
const CONTEXT: Field[] = ['surgery', 'eye', 'surgeon', 'assistant', 'duration', 'anesthesia', 'contact', 'phone', 'notes', 'extra']

/** Lo que se revisa desde la pestaña Tareas: los campos que se cargan, el texto vacío y lo que dice la casilla. */
export const CHECKS: Record<'diopters' | 'phone' | 'name' | 'data' | 'call', { fields: readonly Field[]; placeholder: string; label: (has: boolean) => string }> = {
  diopters: { fields: ['diopters'], placeholder: 'Sin dioptrías cargadas', label: (has: boolean) => (has ? 'Revisé el lente' : 'Revisé el lente: así está bien sin dioptrías') },
  phone: { fields: ['phone'], placeholder: 'Sin teléfono cargado', label: (has: boolean) => (has ? 'Teléfono revisado' : 'Así está bien sin teléfono') },
  name: { fields: ['name'], placeholder: 'Sin nombre cargado', label: (has: boolean) => (has ? 'Nombre revisado' : 'Así está bien sin nombre') },
  data: { fields: WEEK_FIELDS, placeholder: 'Sin cargar', label: (has: boolean) => (has ? 'Datos revisados' : 'Así está bien con los datos que faltan') },
  // desde "Llamar al paciente": los datos de la semana y el teléfono; lo que falta se reconoce en las marcas de esa fila, no acá
  call: { fields: [...WEEK_FIELDS, 'phone'], placeholder: 'Sin cargar', label: () => '' },
}

export type CheckKind = keyof typeof CHECKS

/**
 * Revisión de uno o varios datos de una cirugía (dioptrías, teléfono, nombre o los datos de la semana): muestra todo
 * lo que tiene la cirugía, deja cargar los datos a mano y reconocer que así está bien. Lo que se escribe se guarda al escribirlo.
 */
export default function SurgeryCheckDialog({
  row,
  kind,
  checked,
  onCheck,
  onSource,
  onClose,
  note,
}: {
  row: Row
  kind: CheckKind
  /** La casilla de esta cirugía está tildada */
  checked: boolean
  onCheck: (done: boolean) => void
  onSource: () => void
  onClose: () => void
  /** La nota de la tarea (la de la llamada), para escribirla mientras se habla con el paciente */
  note?: { value: string; onChange: (value: string) => void }
}) {
  const setEdit = useStore((s) => s.setEdit)
  const suggestions = useSuggestions()
  const { fields, placeholder, label } = CHECKS[kind]
  const has = fields.every((f) => !!clean(row[f]))
  const citado = callTime(row.time)
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

        {kind === 'call' && (
          <p className="mt-3 rounded-box bg-base-200 px-3 py-2 text-sm">
            {citado ? (
              <>
                Citar a las <span className="text-lg font-bold tabular-nums">{citado}</span>{' '}
                <span className="text-base-content/60">
                  ({CALL_HOURS_BEFORE} h antes del horario {row.time.trim()})
                </span>
              </>
            ) : (
              <span className="text-base-content/70">
                {clean(row.time) ? `No se puede calcular la hora de citación: el horario dice «${row.time.trim()}».` : 'Sin horario: escribilo abajo y acá aparece la hora de citación.'}
              </span>
            )}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {fields.map((f) => (
            <label key={f} className={`flex flex-col gap-0.5 text-xs font-semibold ${fields.length === 1 ? 'col-span-2' : ''}`}>
              {FIELD_LABELS[f]}
              {/* texto libre, como todos los campos (para poder anotar); las sugerencias no completan nada solas */}
              <input
                className="input w-full font-normal"
                value={row[f]}
                placeholder={placeholder}
                list={SUGGESTED_FIELDS.includes(f) ? `sugerencias-${f}` : undefined}
                onChange={(e) => setEdit(row, f, e.target.value)}
              />
            </label>
          ))}
        </div>
        {SUGGESTED_FIELDS.filter((f) => fields.includes(f)).map((f) => (
          <datalist key={f} id={`sugerencias-${f}`}>
            {suggestions[f]?.map((v) => <option key={v} value={v} />)}
          </datalist>
        ))}
        {note && (
          <label className="mt-3 flex flex-col gap-0.5 text-xs font-semibold">
            Nota de la llamada
            <input className="input w-full font-normal" value={note.value} placeholder="Escribí lo que te dice el paciente" onChange={(e) => note.onChange(e.target.value)} />
          </label>
        )}
        {/* con lo que falta cargado no hay nada que reconocer; con las dioptrías la casilla es la revisión del lente */}
        {kind !== 'call' && (kind === 'diopters' || !has) && (
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={checked} onChange={(e) => onCheck(e.target.checked)} />
            {label(has)}
          </label>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-base-300 pt-3 text-sm">
          {CONTEXT.filter((f) => !fields.includes(f) && row[f].trim()).map((f) => (
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
