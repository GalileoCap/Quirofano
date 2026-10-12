import { clean } from './agenda.ts'
import { addDaysTo } from './dates.ts'
import type { Row } from './types.ts'

/**
 * Una tarea de la residente, aparte del checklist: no sale en la planilla que se exporta, solo vive en el sitio.
 * `week` es una vez por semana, `surgery` una vez por cirugía. Agregar una tarea es agregar una entrada acá.
 */
export type TaskDef = {
  id: string
  scope: 'week' | 'surgery'
  label: string
  /** Días antes del lunes de la semana (`week`) o del día de la cirugía (`surgery`) en que vence */
  daysBefore: number
}

export const TASK_DEFS: TaskDef[] = [
  { id: 'valija', scope: 'week', label: 'Hacer la valija', daysBefore: 1 },
  { id: 'lentes', scope: 'week', label: 'Revisar que haya suficientes lentes', daysBefore: 1 },
  { id: 'llamar', scope: 'surgery', label: 'Llamar al paciente', daysBefore: 2 },
]

/** Lo que se guarda de una tarea: si está hecha y la nota que escribió la persona. */
export type TaskState = { done: boolean; note: string }

export const NO_TASK: TaskState = { done: false, note: '' }

export type TaskStatus = 'done' | 'overdue' | 'today' | 'pending'

export type TaskItem = { key: string; def: TaskDef; due: string; state: TaskState; status: TaskStatus }

/** Hecha, vencida (la fecha ya pasó), para hoy o pendiente. Hecha manda sobre lo demás. */
export function taskStatus(due: string, done: boolean, now: string): TaskStatus {
  if (done) return 'done'
  if (due < now) return 'overdue'
  return due === now ? 'today' : 'pending'
}

const itemOf = (def: TaskDef, owner: string, anchor: string, tasks: Record<string, TaskState>, now: string): TaskItem => {
  const key = `${def.id}|${owner}`
  const state = tasks[key] ?? NO_TASK
  const due = addDaysTo(anchor, -def.daysBefore)
  return { key, def, due, state, status: taskStatus(due, state.done, now) }
}

/** Las tareas de la semana que empieza en `monday`: vencen el domingo anterior, antes del lunes. */
export function weekTasks(monday: string, tasks: Record<string, TaskState>, now: string): TaskItem[] {
  return TASK_DEFS.filter((d) => d.scope === 'week').map((d) => itemOf(d, monday, monday, tasks, now))
}

/** Las tareas de cada cirugía. Van por la clave de la fila (`fecha|HC`): si la cirugía cambia de día, es otra cirugía para sus tareas. */
export function surgeryTasks(rows: Row[], tasks: Record<string, TaskState>, now: string): (TaskItem & { row: Row })[] {
  return rows.flatMap((row) => TASK_DEFS.filter((d) => d.scope === 'surgery').map((d) => ({ ...itemOf(d, row.key, row.date, tasks, now), row })))
}

/** La revisión del lente de una cirugía, dentro de la tarea de la semana "Revisar que haya suficientes lentes". */
export type LensCheck = { key: string; row: Row; hasDiopters: boolean; state: TaskState }

/**
 * Una revisión por cirugía. Tildada quiere decir "ya revisé el lente"; si la cirugía no tiene dioptrías, "así está bien".
 * Va por la clave de la fila, con un prefijo propio para no chocar con las tareas de la cirugía.
 */
export function lensChecks(rows: Row[], tasks: Record<string, TaskState>): LensCheck[] {
  return rows.map((row) => {
    const key = `lente|${row.key}`
    return { key, row, hasDiopters: !!clean(row.diopters), state: tasks[key] ?? NO_TASK }
  })
}

/** Si una cirugía no tiene teléfono, tildar quiere decir "así está bien". Es aparte de "llamar al paciente" (la llamada hecha). */
export type PhoneCheck = { key: string; row: Row; hasPhone: boolean; state: TaskState }

/** Una por cirugía, con su prefijo propio para no chocar con las demás claves. */
export function phoneChecks(rows: Row[], tasks: Record<string, TaskState>): PhoneCheck[] {
  return rows.map((row) => {
    const key = `telefono|${row.key}`
    return { key, row, hasPhone: !!clean(row.phone), state: tasks[key] ?? NO_TASK }
  })
}

/**
 * La tarea de la semana "Revisar que haya suficientes lentes" no se tilda: depende de sus revisiones por cirugía y
 * está hecha cuando todas lo están (sin cirugías, no queda nada por revisar). Lo que se guardó como hecho en ella no cuenta.
 */
export function lensTask(item: TaskItem, checks: LensCheck[], now: string): TaskItem {
  const done = checks.every((c) => c.state.done)
  return { ...item, state: { ...item.state, done }, status: taskStatus(item.due, done, now) }
}
