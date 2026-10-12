import { FIELD_LABELS, longDate } from '../format.ts'
import { useAgenda } from '../hooks.ts'
import { agendaValue, disagree, eventValue, otherAgendaRows, SOURCE_FIELDS } from '../origin.ts'
import type { Row } from '../types.ts'
import { AgendaCells, EventRaw } from './SourceParts.tsx'

/** Cómo se armó la fila, en una frase. */
function summary(row: Row) {
  const { agenda, event, by } = row.origin ?? {}
  if (row.source === 'manual' || !row.origin) return 'La agregaste a mano: no viene de la agenda ni del calendar.'
  if (agenda && event)
    return `Está en el calendar (${event.calendar || 'sin nombre de calendario'}) y la completé con la fila ${agenda.line} de la agenda, que encontré por ${by === 'hc' ? 'la HC' : 'el nombre'}. La fecha es la del calendar.`
  if (event) return 'Está en el calendar, pero no encontré al paciente en la agenda: los datos son los del evento.'
  return `Sale solo de la fila ${agenda!.line} de la agenda${row.source === 'agenda' ? ', con su fecha' : ''}: no hay evento en el calendar.`
}

const Cell = ({ value, used, clash }: { value: string; used: boolean; clash: boolean }) => (
  <td className={`break-words px-1.5 py-1 align-top ${clash ? 'bg-warning/20' : ''} ${used ? 'font-semibold' : 'text-base-content/70'}`}>
    {value || <span className="text-base-content/30">—</span>}
  </td>
)

/** De dónde salió cada dato de una cirugía y los datos originales de la agenda y del calendar. */
export default function SourceDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const agenda = useAgenda()
  const { agenda: a, event: e, fields } = row.origin ?? { fields: {} }
  const fieldRows = SOURCE_FIELDS.map((f) => ({
    f,
    mine: row[f],
    fromAgenda: a ? agendaValue(a, f) : '',
    fromEvent: e ? eventValue(e, f) : '',
    edited: !!row.src && row[f] !== row.src[f],
  })).filter((x) => x.mine || x.fromAgenda || x.fromEvent)
  const others = otherAgendaRows(agenda, row)

  return (
    <dialog className="modal modal-open modal-bottom sm:modal-middle" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="modal-box max-w-2xl p-3 sm:p-5">
        <h3 className="text-lg font-bold">{row.name || 'Cirugía'}</h3>
        <p className="mt-1 text-sm">{summary(row)}</p>
        {row.warning && <p className="mt-1 text-sm text-warning-content">{row.warning}</p>}

        {row.origin && (
          <>
            <h4 className="mt-4 text-sm font-semibold">Dato por dato</h4>
            <p className="text-xs text-base-content/60">En negrita, la fuente de donde salió el dato. Amarillo: la agenda y el calendar no coinciden.</p>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full table-fixed text-xs">
                <thead className="text-left text-base-content/60">
                  <tr>
                    <th className="w-[22%] px-1.5 py-1 font-semibold">Campo</th>
                    <th className="px-1.5 py-1 font-semibold">Checklist</th>
                    <th className="px-1.5 py-1 font-semibold">Agenda</th>
                    <th className="px-1.5 py-1 font-semibold">Calendar</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldRows.map(({ f, mine, fromAgenda, fromEvent, edited }) => {
                    const clash = disagree(fromAgenda, fromEvent)
                    return (
                      <tr key={f} className="border-t border-base-300">
                        <th className="px-1.5 py-1 text-left align-top font-normal text-base-content/60">{FIELD_LABELS[f]}</th>
                        <td className="break-words px-1.5 py-1 align-top">
                          {mine || <span className="text-base-content/30">—</span>}
                          {edited && <span className="badge badge-xs badge-primary badge-soft ml-1">a mano</span>}
                        </td>
                        <Cell value={fromAgenda} used={!edited && fields[f] === 'agenda'} clash={clash} />
                        <Cell value={fromEvent} used={!edited && fields[f] === 'calendar'} clash={clash} />
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {a && (
          <>
            <h4 className="mt-4 text-sm font-semibold">Fila de la agenda (línea {a.line} del CSV)</h4>
            <p className="mb-1 text-xs text-base-content/60">Lo escrito en cada celda, y cómo lo leyó la app cuando difiere.</p>
            <AgendaCells row={a} />
          </>
        )}
        {e && (
          <>
            <h4 className="mt-4 text-sm font-semibold">Evento del calendar</h4>
            <div className="mt-1">
              <EventRaw event={e} />
            </div>
          </>
        )}
        {others.length > 0 && (
          <>
            <h4 className="mt-4 text-sm font-semibold">Otras filas de la agenda de este paciente</h4>
            <p className="mb-1 text-xs text-base-content/60">Reprogramaciones o cirugías de otros años: por si el cruce eligió la fila equivocada.</p>
            <ul className="flex flex-col gap-0.5 text-xs">
              {others.map((o) => (
                <li key={o.line}>
                  <span className="tabular-nums text-base-content/60">L{o.line}</span> · {o.date ? longDate(o.date) : <span className="text-warning-content">fecha ilegible</span>} ·{' '}
                  {[o.surgery, o.eye, o.surgeon].filter(Boolean).join(' · ')}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="modal-action">
          <button className="btn btn-sm btn-primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  )
}
