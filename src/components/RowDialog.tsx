import { useStore } from '../store.ts'
import type { Field, Row } from '../types.ts'

const EDITABLE: { field: Field; label: string; wide?: boolean }[] = [
  { field: 'name', label: 'Paciente', wide: true },
  { field: 'hc', label: 'Historia clínica' },
  { field: 'dni', label: 'DNI' },
  { field: 'surgery', label: 'Cirugía', wide: true },
  { field: 'surgeon', label: 'Cirujano' },
  { field: 'assistant', label: 'Ayudante' },
  { field: 'eye', label: 'Ojo' },
  { field: 'duration', label: 'Duración (min)' },
  { field: 'time', label: 'Horario (vacío = automático)' },
  { field: 'anesthesia', label: 'Anestesia' },
  { field: 'diopters', label: 'Dioptrías' },
  { field: 'phone', label: 'Teléfono', wide: true },
  { field: 'contact', label: 'Contacto' },
  { field: 'notes', label: 'Observaciones', wide: true },
  { field: 'extra', label: 'Notas del checklist', wide: true },
  { field: 'quirofano', label: 'Quirófano' },
  { field: 'quiroDia', label: 'Quiró día' },
]

/** Todos los campos de una cirugía. Cada cambio se guarda al escribirlo. */
export default function RowDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const setEdit = useStore((s) => s.setEdit)
  const manualTime = useStore((s) => s.edits[row.key]?.time ?? '')
  return (
    <dialog className="modal modal-open modal-bottom sm:modal-middle" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-xl">
        <h3 className="text-lg font-bold">{row.name || 'Cirugía'}</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {EDITABLE.map(({ field, label, wide }) => (
            <label key={field} className={`flex flex-col gap-0.5 text-xs font-semibold ${wide ? 'col-span-2' : ''}`}>
              {label}
              {/* el horario automático se ve como sugerencia: solo cuenta lo que se escribe */}
              <input
                className="input input-sm w-full font-normal"
                value={field === 'time' ? manualTime : row[field]}
                placeholder={field === 'time' ? row.time : undefined}
                onChange={(e) => setEdit(row.key, field, e.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="modal-action">
          <button className="btn btn-sm btn-primary" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </dialog>
  )
}
