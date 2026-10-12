import { useState } from 'react'
import { clean } from '../agenda.ts'
import { dayOfWeek, today } from '../dates.ts'
import { DAY_LABELS, shortDate } from '../format.ts'
import { useChecklist } from '../hooks.ts'
import { useStore } from '../store.ts'
import { surgeryTasks, weekTasks, type TaskItem, type TaskStatus } from '../tasks.ts'
import type { Row } from '../types.ts'
import Icon from './Icon.tsx'
import WeekNav from './WeekNav.tsx'

const dayLabel = (iso: string) => `${DAY_LABELS[dayOfWeek(iso)].toLowerCase()} ${shortDate(iso)}`

const STATUS_BADGE: Record<TaskStatus, { cls: string; text: (due: string) => string }> = {
  done: { cls: 'badge-success badge-soft', text: () => 'Hecha' },
  overdue: { cls: 'badge-error', text: (due) => `Venció el ${dayLabel(due)}` },
  today: { cls: 'badge-warning', text: () => 'Vence hoy' },
  pending: { cls: 'badge-ghost', text: (due) => `Para el ${dayLabel(due)}` },
}

/** Una tarea: casilla, texto, cuándo vence y su nota (texto libre). `children` es el material de referencia de la tarea. */
function TaskLine({ item, title, children }: { item: TaskItem; title: React.ReactNode; children?: React.ReactNode }) {
  const setTask = useStore((s) => s.setTask)
  const [writing, setWriting] = useState(false)
  const { key, state, status, due } = item
  const badge = STATUS_BADGE[status]
  return (
    <li className={`flex flex-col gap-1.5 border-l-4 py-1.5 pl-2 ${status === 'overdue' ? 'border-error' : status === 'today' ? 'border-warning' : 'border-transparent'}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
          <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={state.done} onChange={(e) => setTask(key, { done: e.target.checked })} />
          <span className={`min-w-0 ${state.done ? 'text-base-content/50 line-through' : ''}`}>{title}</span>
        </label>
        <span className={`badge badge-sm h-auto whitespace-normal py-0.5 text-left ${badge.cls}`}>{badge.text(due)}</span>
        <button className="btn btn-ghost btn-xs btn-square" title="Nota" aria-label={`Nota de ${item.def.label}`} aria-expanded={writing || !!state.note} onClick={() => setWriting(true)}>
          <Icon name="pencil" />
        </button>
      </div>
      {(writing || state.note) && (
        <input
          type="text"
          className="input input-sm w-full"
          placeholder="Nota"
          aria-label={`Texto de la nota de ${item.def.label}`}
          autoFocus={writing && !state.note}
          value={state.note}
          onChange={(e) => setTask(key, { note: e.target.value })}
        />
      )}
      {children}
    </li>
  )
}

/** Las dioptrías tal como están en cada cirugía, para revisar los lentes: se muestran, no se suman ni se interpretan. */
function Diopters({ rows }: { rows: Row[] }) {
  const withDiopters = rows.filter((r) => clean(r.diopters))
  const missing = rows.length - withDiopters.length
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-base-content/70">
        Dioptrías de las cirugías de la semana ({withDiopters.length}
        {missing > 0 ? `, ${missing} sin cargar` : ''})
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {withDiopters.map((r) => (
          <li key={r.key} className="flex gap-2">
            <span className="w-20 shrink-0 whitespace-nowrap tabular-nums text-base-content/60">
              {DAY_LABELS[dayOfWeek(r.date)].slice(0, 3)} {shortDate(r.date)}
            </span>
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="font-semibold">{r.diopters}</span>
          </li>
        ))}
        {!withDiopters.length && <li className="text-base-content/60">Ninguna cirugía tiene dioptrías cargadas.</li>}
      </ul>
    </details>
  )
}

const pending = (items: TaskItem[]) => items.filter((i) => !i.state.done).length

function Count({ items }: { items: TaskItem[] }) {
  const n = pending(items)
  return <span className="text-sm text-base-content/60">{n ? `${n} ${n === 1 ? 'pendiente' : 'pendientes'}` : 'Todo hecho'}</span>
}

/** Tareas de la residente: las de la semana (antes del lunes) y las de cada cirugía. Viven solo en el sitio; no entran en la planilla. */
export default function TasksView({ monday, setMonday }: { monday: string; setMonday: (monday: string) => void }) {
  const { rows } = useChecklist(monday)
  const tasks = useStore((s) => s.tasks)
  const now = today()
  const weekly = weekTasks(monday, tasks, now)
  const bySurgery = surgeryTasks(rows, tasks, now)
  const days = [...new Set(bySurgery.map((t) => t.row.date))]

  return (
    <div className="flex flex-col gap-3">
      <div className="card card-border bg-base-100">
        <div className="card-body flex-row flex-wrap items-center gap-2 p-2.5 sm:p-3">
          <WeekNav monday={monday} onChange={setMonday} />
        </div>
      </div>

      <section className="card card-border bg-base-100">
        <div className="card-body gap-2 p-3 sm:p-4">
          <div className="flex items-baseline gap-2">
            <h3 className="card-title flex-1 text-base">De la semana</h3>
            <Count items={weekly} />
          </div>
          <ul className="flex flex-col">
            {weekly.map((item) => (
              <TaskLine key={item.key} item={item} title={item.def.label}>
                {item.def.id === 'lentes' && <Diopters rows={rows} />}
              </TaskLine>
            ))}
          </ul>
        </div>
      </section>

      <section className="card card-border bg-base-100">
        <div className="card-body gap-2 p-3 sm:p-4">
          <div className="flex items-baseline gap-2">
            <h3 className="card-title flex-1 text-base">De cada cirugía</h3>
            <Count items={bySurgery} />
          </div>
          {!days.length && <p className="py-4 text-center text-base-content/60">No hay cirugías esta semana.</p>}
          {days.map((date) => (
            <div key={date} className="flex flex-col">
              <h4 className="font-display text-base font-semibold italic text-primary">
                {DAY_LABELS[dayOfWeek(date)]} <span className="font-sans text-sm font-normal not-italic text-base-content/60">{shortDate(date)}</span>
              </h4>
              <ul className="flex flex-col">
                {bySurgery
                  .filter((t) => t.row.date === date)
                  .map((item) => (
                    <TaskLine
                      key={item.key}
                      item={item}
                      title={
                        <>
                          {item.def.label}: <span className="font-semibold">{item.row.name || 'sin nombre'}</span>
                          {item.row.phone.trim() && (
                            <span className="ml-1.5 inline-flex items-center gap-1 text-sm text-base-content/70">
                              · {item.row.phone}
                            </span>
                          )}
                        </>
                      }
                    />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <p className="flex items-center gap-1.5 px-1 text-xs text-base-content/60">
        <Icon name="listChecks" className="size-3.5" /> Las tareas quedan solo en este navegador: no salen en la planilla que exportás.
      </p>
    </div>
  )
}
