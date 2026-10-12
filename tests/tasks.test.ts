import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NO_TASK, TASK_DEFS, lensChecks, lensTask, surgeryTasks, taskStatus, weekTasks, type TaskState } from '../src/tasks.ts'
import { useStore } from '../src/store.ts'
import { FIELDS, type Fields, type Row, type Source } from '../src/types.ts'

// Datos inventados: nunca poner pacientes reales en el repo

// el store guarda en localStorage, que Node no trae
const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) },
})

const EMPTY = Object.fromEntries(FIELDS.map((f) => [f, ''])) as Fields

const mk = (date: string, hc: string, source: Source = 'both'): Row => ({
  ...EMPTY,
  name: `PACIENTE ${hc}`,
  hc,
  duration: '45',
  surgery: 'CATARATA',
  surgeon: 'DIAZ',
  eye: 'DERECHO',
  key: `${date}|PACIENTE ${hc}|${hc}`,
  date,
  source,
})

const MONDAY = '2026-10-12'
const NEXT_MONDAY = '2026-10-19'

const ids = (items: { def: { id: string } }[]) => items.map((i) => i.def.id)
const keys = (items: { key: string }[]) => items.map((i) => i.key)

// definiciones

test('hay tres tareas con ids únicos: valija y lentes de la semana (1 día antes), llamar por cirugía (2 días antes)', () => {
  assert.equal(new Set(TASK_DEFS.map((d) => d.id)).size, TASK_DEFS.length)
  assert.deepEqual(
    TASK_DEFS.map((d) => [d.id, d.scope, d.daysBefore]),
    [
      ['valija', 'week', 1],
      ['lentes', 'week', 1],
      ['llamar', 'surgery', 2],
    ],
  )
  assert.equal(NO_TASK.done, false)
  assert.equal(NO_TASK.note, '')
})

// estado

test('hecha gana sobre todo; si no, vencida antes de la fecha, "hoy" el mismo día y pendiente después', () => {
  assert.equal(taskStatus('2026-10-11', true, '2026-10-12'), 'done')
  assert.equal(taskStatus('2026-10-11', true, '2026-10-11'), 'done')
  assert.equal(taskStatus('2026-10-11', true, '2026-10-01'), 'done')
  assert.equal(taskStatus('2026-10-11', false, '2026-10-12'), 'overdue')
  assert.equal(taskStatus('2026-10-11', false, '2026-10-11'), 'today')
  assert.equal(taskStatus('2026-10-11', false, '2026-10-10'), 'pending')
  // la comparación es por fecha y no por texto: cruza el mes y el año
  assert.equal(taskStatus('2026-01-04', false, '2025-12-31'), 'pending')
  assert.equal(taskStatus('2025-12-31', false, '2026-01-01'), 'overdue')
})

// tareas de la semana

test('las tareas de la semana son solo las dos semanales, en el orden de las definiciones', () => {
  const items = weekTasks(MONDAY, {}, '2026-10-01')
  assert.deepEqual(ids(items), ['valija', 'lentes'])
  assert.deepEqual(items.map((i) => i.def.scope), ['week', 'week'])
  assert.deepEqual(items.map((i) => i.state), [NO_TASK, NO_TASK])
})

test('las tareas de la semana vencen el domingo anterior al lunes, también al cruzar mes y año', () => {
  const casos: [string, string][] = [
    ['2026-10-12', '2026-10-11'],
    ['2026-06-01', '2026-05-31'],
    ['2026-01-05', '2026-01-04'],
    ['2024-03-04', '2024-03-03'],
  ]
  for (const [monday, due] of casos) {
    assert.deepEqual(
      weekTasks(monday, {}, '2020-01-01').map((i) => i.due),
      [due, due],
      monday,
    )
  }
  // un lunes de fin de año: el domingo anterior sigue en diciembre
  assert.deepEqual(weekTasks('2025-12-29', {}, '2020-01-01').map((i) => i.due), ['2025-12-28', '2025-12-28'])
})

test('el estado de las tareas de la semana sigue a "hoy": pendiente, hoy y vencida', () => {
  assert.deepEqual(weekTasks(MONDAY, {}, '2026-10-09').map((i) => i.status), ['pending', 'pending'])
  assert.deepEqual(weekTasks(MONDAY, {}, '2026-10-11').map((i) => i.status), ['today', 'today'])
  assert.deepEqual(weekTasks(MONDAY, {}, '2026-10-12').map((i) => i.status), ['overdue', 'overdue'])
})

test('lo guardado bajo la clave de una tarea de la semana vuelve como su estado, y las otras siguen vacías', () => {
  const first = weekTasks(MONDAY, {}, '2026-10-12')
  const saved: TaskState = { done: true, note: 'en el baúl' }
  const again = weekTasks(MONDAY, { [first[0]!.key]: saved }, '2026-10-12')
  assert.deepEqual(again[0]!.state, saved)
  assert.equal(again[0]!.status, 'done')
  assert.deepEqual(again[1]!.state, NO_TASK)
  assert.equal(again[1]!.status, 'overdue')

  // una nota sola no cierra la tarea
  const noteOnly = weekTasks(MONDAY, { [first[1]!.key]: { done: false, note: 'faltan dos' } }, '2026-10-12')
  assert.deepEqual(noteOnly[1]!.state, { done: false, note: 'faltan dos' })
  assert.equal(noteOnly[1]!.status, 'overdue')
})

test('las claves de las tareas de la semana son estables, distintas entre tareas y entre semanas, y lo hecho una semana no pasa a otra', () => {
  const a = weekTasks(MONDAY, {}, '2026-10-12')
  assert.deepEqual(keys(weekTasks(MONDAY, {}, '2026-11-30')), keys(a))
  assert.equal(new Set(keys(a)).size, a.length)

  const b = weekTasks(NEXT_MONDAY, {}, '2026-10-12')
  const todas = [...keys(a), ...keys(b)]
  assert.equal(new Set(todas).size, todas.length)

  const saved = { [a[0]!.key]: { done: true, note: '' } }
  assert.deepEqual(weekTasks(NEXT_MONDAY, saved, '2026-10-12').map((i) => i.state), [NO_TASK, NO_TASK])
  assert.deepEqual(weekTasks(MONDAY, saved, '2026-10-12').map((i) => i.state), [{ done: true, note: '' }, NO_TASK])
})

// tareas por cirugía

test('cada cirugía trae un "llamar al paciente" con vencimiento dos días antes, en el orden de las filas, con su fila', () => {
  const rows = [mk('2026-10-14', '1/00'), mk('2026-10-13', '2/00'), mk('2026-10-16', '3/00')]
  const items = surgeryTasks(rows, {}, '2026-10-01')
  assert.deepEqual(ids(items), ['llamar', 'llamar', 'llamar'])
  assert.deepEqual(items.map((i) => i.row), rows)
  assert.deepEqual(items.map((i) => i.due), ['2026-10-12', '2026-10-11', '2026-10-14'])
  assert.deepEqual(items.map((i) => i.def.scope), ['surgery', 'surgery', 'surgery'])
  assert.deepEqual(items.map((i) => i.state), [NO_TASK, NO_TASK, NO_TASK])
})

test('una cirugía de lunes se llama el sábado (días corridos, sin ajustar por el fin de semana), y cruzar el mes no cambia la cuenta', () => {
  assert.deepEqual(surgeryTasks([mk('2026-10-12', '1/00')], {}, '2026-10-01').map((i) => i.due), ['2026-10-10'])
  assert.deepEqual(surgeryTasks([mk('2026-11-02', '1/00')], {}, '2026-10-01').map((i) => i.due), ['2026-10-31'])
  assert.deepEqual(surgeryTasks([mk('2026-01-01', '1/00')], {}, '2025-12-01').map((i) => i.due), ['2025-12-30'])
})

test('el estado de "llamar" sigue a "hoy" y lo hecho gana aunque haya vencido', () => {
  const row = mk('2026-10-14', '1/00')
  const statusAt = (now: string, tasks: Record<string, TaskState> = {}) => surgeryTasks([row], tasks, now)[0]!.status
  assert.equal(statusAt('2026-10-11'), 'pending')
  assert.equal(statusAt('2026-10-12'), 'today')
  assert.equal(statusAt('2026-10-13'), 'overdue')
  const key = surgeryTasks([row], {}, '2026-10-13')[0]!.key
  assert.equal(statusAt('2026-10-13', { [key]: { done: true, note: '' } }), 'done')
})

test('sin filas no hay tareas por cirugía', () => {
  assert.deepEqual(surgeryTasks([], {}, '2026-10-12'), [])
})

test('las claves de "llamar" son estables y distintas por cirugía, también con la misma HC en dos fechas o dos HC el mismo día', () => {
  const mismaHc1 = mk('2026-10-14', '1/00')
  const mismaHc2 = mk('2026-10-16', '1/00')
  const otraHc = mk('2026-10-14', '2/00')
  const rows = [mismaHc1, mismaHc2, otraHc]
  const a = surgeryTasks(rows, {}, '2026-10-12')
  assert.deepEqual(keys(surgeryTasks(rows, {}, '2026-12-01')), keys(a))
  assert.equal(new Set(keys(a)).size, 3)
  // no depende del lugar que ocupa la fila
  assert.deepEqual(keys(surgeryTasks([otraHc, mismaHc2, mismaHc1], {}, '2026-10-12')), [a[2]!.key, a[1]!.key, a[0]!.key])
})

test('lo guardado bajo la clave de la llamada de una cirugía vuelve como su estado y no se filtra a la otra', () => {
  const rows = [mk('2026-10-14', '1/00'), mk('2026-10-16', '1/00'), mk('2026-10-14', '2/00')]
  const first = surgeryTasks(rows, {}, '2026-10-12')
  const saved: TaskState = { done: true, note: 'no atiende, probar a la tarde' }
  const again = surgeryTasks(rows, { [first[1]!.key]: saved }, '2026-10-12')
  assert.deepEqual(again.map((i) => i.state), [NO_TASK, saved, NO_TASK])
  assert.deepEqual(again.map((i) => i.status), ['today', 'done', 'today'])
})

// store

const reset = () => useStore.getState().clearUserData()

test('setTask empieza vacío y suma a lo que ya había: tildar conserva la nota y escribir la nota conserva el tilde', () => {
  reset()
  assert.deepEqual(useStore.getState().tasks, {})
  useStore.getState().setTask('t|1', { done: true })
  assert.deepEqual(useStore.getState().tasks, { 't|1': { done: true, note: '' } })
  useStore.getState().setTask('t|1', { note: 'llamé, no atendió' })
  assert.deepEqual(useStore.getState().tasks, { 't|1': { done: true, note: 'llamé, no atendió' } })
  useStore.getState().setTask('t|1', { done: false })
  assert.deepEqual(useStore.getState().tasks, { 't|1': { done: false, note: 'llamé, no atendió' } })
})

test('una nota sin tilde se guarda, y las demás tareas no se tocan', () => {
  reset()
  useStore.getState().setTask('t|1', { done: true })
  useStore.getState().setTask('t|2', { note: 'revisar el jueves' })
  assert.deepEqual(useStore.getState().tasks, { 't|1': { done: true, note: '' }, 't|2': { done: false, note: 'revisar el jueves' } })
})

test('si la tarea vuelve a no hecha y sin nota se borra la entrada, sin dejar vacíos; las demás quedan', () => {
  reset()
  useStore.getState().setTask('t|1', { done: true, note: 'listo' })
  useStore.getState().setTask('t|2', { done: true })
  useStore.getState().setTask('t|1', { note: '' })
  assert.deepEqual(useStore.getState().tasks, { 't|1': { done: true, note: '' }, 't|2': { done: true, note: '' } })
  useStore.getState().setTask('t|1', { done: false })
  assert.deepEqual(useStore.getState().tasks, { 't|2': { done: true, note: '' } })
  assert.equal('t|1' in useStore.getState().tasks, false)

  // una tarea que nunca tuvo nada y recibe un parche vacío tampoco deja entrada
  useStore.getState().setTask('t|3', {})
  useStore.getState().setTask('t|4', { done: false, note: '' })
  assert.deepEqual(Object.keys(useStore.getState().tasks), ['t|2'])
})

test('clearUserData vacía las tareas', () => {
  reset()
  useStore.getState().setTask('t|1', { done: true })
  useStore.getState().clearUserData()
  assert.deepEqual(useStore.getState().tasks, {})
})

test('importUserData carga las tareas del respaldo, y uno viejo sin tasks las deja vacías', () => {
  reset()
  useStore.getState().setTask('t|viejo', { done: true })
  useStore.getState().importUserData({ edits: {}, tasks: { 't|1': { done: true, note: 'ok' } } })
  assert.deepEqual(useStore.getState().tasks, { 't|1': { done: true, note: 'ok' } })

  useStore.getState().importUserData({ edits: {} })
  assert.deepEqual(useStore.getState().tasks, {})
})

test('lo guardado con setTask bajo la clave de una tarea es lo que weekTasks y surgeryTasks devuelven como estado', () => {
  reset()
  const row = mk('2026-10-14', '1/00')
  const week = weekTasks(MONDAY, useStore.getState().tasks, '2026-10-12')
  const call = surgeryTasks([row], useStore.getState().tasks, '2026-10-12')
  useStore.getState().setTask(week[0]!.key, { done: true })
  useStore.getState().setTask(call[0]!.key, { note: 'al celular de la hija' })

  const { tasks } = useStore.getState()
  assert.deepEqual(weekTasks(MONDAY, tasks, '2026-10-12').map((i) => i.state), [{ done: true, note: '' }, NO_TASK])
  assert.deepEqual(surgeryTasks([row], tasks, '2026-10-12').map((i) => i.state), [{ done: false, note: 'al celular de la hija' }])
})

// revisión de lentes por cirugía

const withDiopters = (date: string, hc: string, diopters: string): Row => ({ ...mk(date, hc), diopters })

test('hay una revisión de lentes por fila, en el orden dado y con su fila; sin filas no hay ninguna', () => {
  const rows = [mk('2026-10-14', '1/00'), mk('2026-10-13', '2/00'), mk('2026-10-16', '3/00')]
  const checks = lensChecks(rows, {})
  assert.equal(checks.length, 3)
  assert.deepEqual(checks.map((c) => c.row), rows)
  assert.deepEqual(checks.map((c) => c.state), [NO_TASK, NO_TASK, NO_TASK])
  assert.deepEqual(lensChecks([], {}), [])
})

test('hasDiopters es verdadero con cualquier contenido real y falso con vacío, espacios o solo marcas de "nada"', () => {
  const sin = ['', '   ', '.', '-', '--', ' . ']
  const con = ['+21.00', '22', '19.50/10', '23.5/23,00', 'OD +21']
  const rows = [...sin, ...con].map((d, i) => withDiopters('2026-10-14', `${i + 1}/00`, d))
  assert.deepEqual(
    lensChecks(rows, {}).map((c) => c.hasDiopters),
    [...sin.map(() => false), ...con.map(() => true)],
  )
})

test('las claves de la revisión de lentes son estables y distintas por cirugía, también con la misma HC en dos fechas', () => {
  const rows = [mk('2026-10-14', '1/00'), mk('2026-10-16', '1/00'), mk('2026-10-14', '2/00')]
  const a = lensChecks(rows, {})
  assert.deepEqual(keys(lensChecks(rows, { 'x|1': { done: true, note: '' } })), keys(a))
  assert.equal(new Set(keys(a)).size, 3)
})

test('la clave de la revisión de lentes no choca con la de "llamar" de la misma cirugía ni con las de la semana', () => {
  const rows = [mk('2026-10-14', '1/00'), mk('2026-10-16', '1/00'), mk('2026-10-14', '2/00')]
  const lentes = keys(lensChecks(rows, {}))
  const llamar = keys(surgeryTasks(rows, {}, '2026-10-12'))
  const semana = [...keys(weekTasks(MONDAY, {}, '2026-10-12')), ...keys(weekTasks(NEXT_MONDAY, {}, '2026-10-12'))]
  const todas = [...lentes, ...llamar, ...semana]
  assert.equal(new Set(todas).size, todas.length)
  rows.forEach((_, i) => assert.notEqual(lentes[i], llamar[i]))
})

test('lo guardado bajo la clave de una revisión de lentes vuelve como su estado, solo en esa cirugía', () => {
  const rows = [mk('2026-10-14', '1/00'), mk('2026-10-16', '1/00'), mk('2026-10-14', '2/00')]
  const saved: TaskState = { done: true, note: 'sin dioptrías, está bien así' }
  const again = lensChecks(rows, { [lensChecks(rows, {})[1]!.key]: saved })
  assert.deepEqual(again.map((c) => c.state), [NO_TASK, saved, NO_TASK])
})

test('tildar la revisión de lentes con setTask no toca el "llamar" de la misma cirugía, y al revés', () => {
  reset()
  const row = withDiopters('2026-10-14', '1/00', '+21.00')
  const lens = lensChecks([row], useStore.getState().tasks)[0]!
  const call = surgeryTasks([row], useStore.getState().tasks, '2026-10-12')[0]!

  useStore.getState().setTask(lens.key, { done: true })
  assert.deepEqual(lensChecks([row], useStore.getState().tasks)[0]!.state, { done: true, note: '' })
  assert.deepEqual(surgeryTasks([row], useStore.getState().tasks, '2026-10-12')[0]!.state, NO_TASK)

  reset()
  useStore.getState().setTask(call.key, { done: true, note: 'llamé' })
  assert.deepEqual(surgeryTasks([row], useStore.getState().tasks, '2026-10-12')[0]!.state, { done: true, note: 'llamé' })
  assert.deepEqual(lensChecks([row], useStore.getState().tasks)[0]!.state, NO_TASK)
})

// la tarea semanal de lentes depende de las revisiones por cirugía

const LENS_ROWS = [mk('2026-10-14', '1/00'), mk('2026-10-13', '2/00'), mk('2026-10-16', '3/00')]
const LENS_KEYS = lensChecks(LENS_ROWS, {}).map((c) => c.key)
const DONE: TaskState = { done: true, note: '' }

// estado guardado con las revisiones de los índices dados tildadas
const checked = (...idx: number[]): Record<string, TaskState> => Object.fromEntries(idx.map((i) => [LENS_KEYS[i]!, DONE]))
const lensItem = (tasks: Record<string, TaskState>, now: string) => weekTasks(MONDAY, tasks, now)[1]!

test('lensTask: la tarea de lentes está hecha solo cuando están hechas todas las revisiones de las cirugías', () => {
  const now = '2026-10-09'
  const result = (tasks: Record<string, TaskState>) => lensTask(lensItem({}, now), lensChecks(LENS_ROWS, tasks), now)
  assert.equal(result({}).state.done, false)
  assert.equal(result(checked(1)).state.done, false)
  assert.equal(result(checked(0, 2)).state.done, false)
  assert.equal(result(checked(0, 1, 2)).state.done, true)
  assert.equal(result(checked(0, 1, 2)).status, 'done')
})

test('lensTask: sin revisiones (semana sin cirugías) la tarea de lentes está hecha', () => {
  const now = '2026-10-09'
  const item = lensTask(lensItem({}, now), lensChecks([], {}), now)
  assert.equal(item.state.done, true)
  assert.equal(item.status, 'done')
})

test('lensTask: lo que se guardó como hecho en la tarea misma no la cierra mientras falte una revisión, y lo guardado como no hecho no la frena si están todas', () => {
  const now = '2026-10-09'
  const key = lensItem({}, now).key

  const falsoHecho = { ...checked(0, 2), [key]: DONE }
  const pendiente = lensTask(lensItem(falsoHecho, now), lensChecks(LENS_ROWS, falsoHecho), now)
  assert.equal(pendiente.state.done, false)
  assert.equal(pendiente.status, 'pending')

  const falsoPendiente = { ...checked(0, 1, 2), [key]: { done: false, note: '' } }
  const hecha = lensTask(lensItem(falsoPendiente, now), lensChecks(LENS_ROWS, falsoPendiente), now)
  assert.equal(hecha.state.done, true)
  assert.equal(hecha.status, 'done')
})

test('lensTask: conserva la nota guardada y no cambia la clave, la definición ni el vencimiento', () => {
  const now = '2026-10-09'
  const tasks = { ...checked(0), [lensItem({}, now).key]: { done: false, note: 'faltan los de la tarde' } }
  const original = lensItem(tasks, now)
  const pendiente = lensTask(original, lensChecks(LENS_ROWS, tasks), now)
  assert.deepEqual(pendiente.state, { done: false, note: 'faltan los de la tarde' })
  assert.equal(pendiente.key, original.key)
  assert.equal(pendiente.def, original.def)
  assert.equal(pendiente.due, original.due)

  const todas = { ...checked(0, 1, 2), [original.key]: { done: false, note: 'faltan los de la tarde' } }
  const hecha = lensTask(lensItem(todas, now), lensChecks(LENS_ROWS, todas), now)
  assert.deepEqual(hecha.state, { done: true, note: 'faltan los de la tarde' })
  assert.equal(hecha.key, original.key)
  assert.equal(hecha.due, original.due)
})

const statusAt = (now: string, tasks: Record<string, TaskState>) => lensTask(lensItem(tasks, now), lensChecks(LENS_ROWS, tasks), now).status

test('lensTask: el estado sigue a "hoy" (pendiente, hoy, vencida) si falta una revisión, y hecha gana aunque haya vencido', () => {
  assert.equal(statusAt('2026-10-10', checked(0, 1)), 'pending')
  assert.equal(statusAt('2026-10-11', checked(0, 1)), 'today')
  assert.equal(statusAt('2026-10-12', checked(0, 1)), 'overdue')
  assert.equal(statusAt('2026-10-12', checked(0, 1, 2)), 'done')
})
