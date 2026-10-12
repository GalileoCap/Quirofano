import { useState } from 'react'
import { dayOfWeek, today } from '../dates.ts'
import { DAY_LABELS, shortDate } from '../format.ts'
import { useChecklist } from '../hooks.ts'
import { useStore } from '../store.ts'
import { lensChecks, lensTask, nameChecks, phoneChecks, surgeryTasks, weekTasks, type LensCheck, type TaskItem, type TaskState, type TaskStatus } from '../tasks.ts'
import type { Row } from '../types.ts'
import Icon from './Icon.tsx'
import SourceDialog from './SourceDialog.tsx'
import SurgeryCheckDialog, { type CheckField } from './SurgeryCheckDialog.tsx'
import WeekNav from './WeekNav.tsx'

const dayLabel = (iso: string) => `${DAY_LABELS[dayOfWeek(iso)].toLowerCase()} ${shortDate(iso)}`

const STATUS_BADGE: Record<TaskStatus, { cls: string; text: (due: string) => string }> = {
  done: { cls: 'badge-success badge-soft', text: () => 'Hecha' },
  overdue: { cls: 'badge-error', text: (due) => `Venció el ${dayLabel(due)}` },
  today: { cls: 'badge-warning', text: () => 'Vence hoy' },
  pending: { cls: 'badge-ghost', text: (due) => `Para el ${dayLabel(due)}` },
}

/** Una tarea: casilla, texto, cuándo vence y su nota (texto libre). `children` es el material de referencia de la tarea. */
function TaskLine({ item, title, derived = false, highlight = false, flags, uniform = false, children }: { item: TaskItem; title: React.ReactNode; /** Sin casilla: su estado sale de sus sub-items */ derived?: boolean; /** Falta un dato y nadie reconoció que así está bien */ highlight?: boolean; /** Marcas de datos que faltan, en la misma línea para que todas las filas midan lo mismo */ flags?: React.ReactNode; /** Todas las filas de la lista miden lo mismo: el título va en su propia línea (en el teléfono, dos con el alto reservado) */ uniform?: boolean; children?: React.ReactNode }) {
  const setTask = useStore((s) => s.setTask)
  const [writing, setWriting] = useState(false)
  const { key, state, status, due } = item
  const badge = STATUS_BADGE[status]
  return (
    <li className={`flex flex-col gap-1.5 border-l-4 py-1.5 pl-2 ${highlight ? 'bg-warning/15' : ''} ${status === 'overdue' ? 'border-error' : status === 'today' ? 'border-warning' : 'border-transparent'}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {derived ? (
          <span className={`min-w-0 flex-1 ${state.done ? 'text-base-content/50 line-through' : ''}`}>{title}</span>
        ) : (
          <label className={`flex min-w-0 cursor-pointer items-center gap-2 ${uniform ? 'basis-full sm:basis-0 sm:flex-1' : 'flex-1'}`}>
            <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={state.done} onChange={(e) => setTask(key, { done: e.target.checked })} />
            <span className={`min-w-0 ${uniform ? 'line-clamp-2 min-h-[2lh] sm:line-clamp-1 sm:min-h-0' : ''} ${state.done ? 'text-base-content/50 line-through' : ''}`}>{title}</span>
          </label>
        )}
        {flags}
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

/**
 * Las dioptrías tal como están en cada cirugía, para revisar los lentes: se muestran, no se suman ni se interpretan.
 * El check de cada cirugía es "ya lo revisé" (las que no tienen dioptrías se resaltan, y ahí quiere decir que así está bien).
 * Tocar la fila abre la cirugía para mirarla entera y cargar las dioptrías.
 */
function Diopters({ checks, onOpen }: { checks: LensCheck[]; onOpen: (key: string) => void }) {
  const setTask = useStore((s) => s.setTask)
  const reviewed = checks.filter((c) => c.state.done).length
  const missing = checks.filter((c) => !c.hasDiopters)
  const unsettled = missing.filter((c) => !c.state.done).length
  return (
    <details className="text-sm" open>
      <summary className="cursor-pointer text-base-content/70">
        Lentes por cirugía ({reviewed} de {checks.length} revisadas
        {missing.length > 0 ? `, ${unsettled} sin dioptrías por mirar` : ''})
      </summary>
      <ul className="mt-1 flex flex-col">
        {checks.map(({ key, row, hasDiopters, state }) => (
          <li key={key} className={`flex items-center gap-2 border-l-4 pl-2 ${!hasDiopters && !state.done ? 'border-warning bg-warning/15' : 'border-transparent'}`}>
            <input
              type="checkbox"
              className="checkbox checkbox-primary checkbox-xs"
              aria-label={`Revisé el lente de ${row.name || 'esta cirugía'}`}
              checked={state.done}
              onChange={(e) => setTask(key, { done: e.target.checked })}
            />
            <button className="flex min-w-0 flex-1 items-center gap-2 rounded py-1 text-left hover:bg-base-200/70" title="Ver la cirugía y cargar las dioptrías" onClick={() => onOpen(row.key)}>
              <span className="w-20 shrink-0 whitespace-nowrap tabular-nums text-base-content/60">
                {DAY_LABELS[dayOfWeek(row.date)].slice(0, 3)} {shortDate(row.date)}
              </span>
              <span className={`min-w-0 flex-1 truncate ${state.done ? 'text-base-content/50' : ''}`}>{row.name || 'sin nombre'}</span>
              {hasDiopters ? (
                <span className="font-semibold">{row.diopters}</span>
              ) : (
                <span className={`badge badge-sm ${state.done ? 'badge-ghost' : 'badge-warning'}`}>{state.done ? 'Sin dioptrías, está bien' : 'Sin dioptrías'}</span>
              )}
            </button>
          </li>
        ))}
        {!checks.length && <li className="text-base-content/60">No hay cirugías esta semana.</li>}
      </ul>
    </details>
  )
}

const MISSING = {
  phone: { badge: 'Sin teléfono', ok: 'Sin teléfono, está bien', title: 'Ver la cirugía y cargar el teléfono' },
  name: { badge: 'Sin nombre', ok: 'Sin nombre, está bien', title: 'Ver la cirugía y cargar el nombre' },
} as const

/**
 * Marca en la línea de "llamar al paciente" cuando a la cirugía le falta el teléfono o el nombre: el check reconoce que
 * así está bien, tocar la marca abre la cirugía para mirarla entera y cargarlo.
 */
function Missing({ field, check, onOpen }: { field: 'phone' | 'name'; check: { key: string; row: Row; state: TaskState }; onOpen: (key: string) => void }) {
  const setTask = useStore((s) => s.setTask)
  const { key, row, state } = check
  const text = MISSING[field]
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="checkbox"
        className="checkbox checkbox-primary checkbox-xs"
        aria-label={`${text.badge} de ${row.name || 'esta cirugía'}: así está bien`}
        checked={state.done}
        onChange={(e) => setTask(key, { done: e.target.checked })}
      />
      <button className={`badge badge-sm ${state.done ? 'badge-ghost' : 'badge-warning'}`} title={text.title} onClick={() => onOpen(row.key)}>
        {state.done ? text.ok : text.badge}
      </button>
    </span>
  )
}

const pending = (items: TaskItem[]) => items.filter((i) => !i.state.done).length

function Count({ items }: { items: TaskItem[] }) {
  const n = pending(items)
  return <span className="text-sm text-base-content/60">{n ? `${n} ${n === 1 ? 'pendiente' : 'pendientes'}` : 'Todo hecho'}</span>
}

/** Tareas de la residente: las de la semana (antes del lunes) y las de cada cirugía. Viven solo en el sitio; no entran en la planilla. */
export default function TasksView({ monday, setMonday }: { monday: string; setMonday: (monday: string) => void }) {
  const { rows, excluded } = useChecklist(monday)
  const tasks = useStore((s) => s.tasks)
  const setTask = useStore((s) => s.setTask)
  const [checking, setChecking] = useState<{ field: CheckField; key: string } | null>(null)
  const [sourcing, setSourcing] = useState<string | null>(null)
  const now = today()
  const checks = lensChecks(rows, tasks)
  // la tarea de lentes depende de las revisiones de cada cirugía
  const weekly = weekTasks(monday, tasks, now).map((i) => (i.def.id === 'lentes' ? lensTask(i, checks, now) : i))
  const phones = phoneChecks(rows, tasks)
  const names = nameChecks(rows, tasks)
  const noPhone = phones.filter((p) => !p.hasPhone)
  const noName = names.filter((n) => !n.hasName)
  const checksOf = { diopters: checks, phone: phones, name: names }
  // la casilla y la fila abiertas, de dioptrías, teléfono o nombre
  const open = checking && checksOf[checking.field].find((c) => c.row.key === checking.key)
  const sourcingRow = rows.find((r) => r.key === sourcing) ?? excluded.find((x) => x.row.key === sourcing)?.row
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
              <TaskLine key={item.key} item={item} title={item.def.label} derived={item.def.id === 'lentes'}>
                {item.def.id === 'lentes' && <Diopters checks={checks} onOpen={(key) => setChecking({ field: 'diopters', key })} />}
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
          {noPhone.length > 0 && (
            <p className="text-sm text-base-content/70">
              {noPhone.filter((p) => !p.state.done).length} de {noPhone.length} cirugías sin teléfono por mirar
            </p>
          )}
          {noName.length > 0 && (
            <p className="text-sm text-base-content/70">
              {noName.filter((n) => !n.state.done).length} de {noName.length} cirugías sin nombre por mirar
            </p>
          )}
          {!days.length && <p className="py-4 text-center text-base-content/60">No hay cirugías esta semana.</p>}
          {days.map((date) => (
            <div key={date} className="flex flex-col">
              <h4 className="font-display text-base font-semibold italic text-primary">
                {DAY_LABELS[dayOfWeek(date)]} <span className="font-sans text-sm font-normal not-italic text-base-content/60">{shortDate(date)}</span>
              </h4>
              <ul className="flex flex-col">
                {bySurgery
                  .filter((t) => t.row.date === date)
                  .map((item) => {
                    const phone = phones.find((p) => p.row.key === item.row.key)
                    const name = names.find((n) => n.row.key === item.row.key)
                    return (
                      <TaskLine
                        key={item.key}
                        item={item}
                        uniform
                        flags={
                          <>
                            {name && !name.hasName && <Missing field="name" check={name} onOpen={(key) => setChecking({ field: 'name', key })} />}
                            {phone && !phone.hasPhone && <Missing field="phone" check={phone} onOpen={(key) => setChecking({ field: 'phone', key })} />}
                          </>
                        }
                        highlight={(!!phone && !phone.hasPhone && !phone.state.done) || (!!name && !name.hasName && !name.state.done)}
                        title={
                          <>
                            {item.def.label}: <span className="font-semibold">{name?.hasName ? item.row.name : 'sin nombre'}</span>
                            {phone?.hasPhone && (
                              <span className="ml-1.5 inline-flex items-center gap-1 text-sm text-base-content/70">
                                · {item.row.phone}
                              </span>
                            )}
                          </>
                        }
                      >
</TaskLine>
                    )
                  })}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <p className="flex items-center gap-1.5 px-1 text-xs text-base-content/60">
        <Icon name="listChecks" className="size-3.5" /> Las tareas quedan solo en este navegador: no salen en la planilla que exportás.
      </p>
      {checking && open && (
        <SurgeryCheckDialog
          row={open.row}
          field={checking.field}
          checked={open.state.done}
          onCheck={(done) => setTask(open.key, { done })}
          onSource={() => setSourcing(open.row.key)}
          onClose={() => setChecking(null)}
        />
      )}
      {sourcingRow && <SourceDialog row={sourcingRow} onClose={() => setSourcing(null)} />}
    </div>
  )
}
