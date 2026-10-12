import { FIELD_LABELS } from '../format.ts'
import { flagNotes, type Flags, type Note } from '../overview.ts'
import type { Field, Row } from '../types.ts'
import Icon from './Icon.tsx'

const BADGE: Record<Note['kind'], string> = {
  presence: 'badge-error h-auto whitespace-normal py-0.5 text-left font-bold',
  confirm: 'badge-warning',
  sources: 'badge-error badge-soft',
  edited: 'badge-info badge-soft',
  missing: 'badge-ghost border-dashed border-error/50',
}

/** Cómo se marca un campo: por confirmar, fuentes que no coinciden, escrito a mano. */
export function mark(f: Field, flags: Flags) {
  if (flags.confirm.includes(f)) return 'rounded bg-warning/40 px-1'
  if (flags.sources.includes(f)) return 'rounded bg-error/20 px-1'
  if (flags.edited.includes(f)) return 'italic underline decoration-dotted underline-offset-2'
  return ''
}

/** Las marcas de la fila, en palabras (las mismas del tooltip del calendario). */
export function Chips({ flags, row }: { flags: Flags; row: Row }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {flagNotes(flags).map((n) => (
        <span key={n.kind + n.text} className={`badge badge-sm ${BADGE[n.kind]}`}>
          {n.text}
        </span>
      ))}
      {flags.acked && (
        <span className="badge badge-sm badge-ghost" title="Reconocida: avisa de nuevo si cambia en la agenda o el calendar">
          Reconocida
        </span>
      )}
      {flags.warning && <Icon name="warning" className="size-4 text-warning" aria-label={row.warning} />}
    </span>
  )
}

/** De qué fuentes salió la fila, como texto corto: "Agenda L214 + Calendar". */
export const originLabel = (row: Row) => {
  const { agenda, event } = row.origin ?? {}
  return [agenda && `Agenda L${agenda.line}`, event && 'Calendar'].filter(Boolean).join(' + ') || 'A mano'
}

/** Lo escrito a mano que difiere de lo que dicen hoy las fuentes, con los botones para resolverlo. */
export function Conflicts({ row, onKeepMine, onUseSource }: { row: Row; onKeepMine: () => void; onUseSource: () => void }) {
  if (!row.conflicts) return null
  return (
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
  )
}
