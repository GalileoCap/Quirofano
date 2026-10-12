import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NO_TASK, TASK_DEFS, WEEK_FIELDS, dataChecks, dataTask, lensChecks, nameChecks, phoneChecks, weekTasks, type TaskItem, type TaskState } from '../src/tasks.ts'
import { FIELDS, type Field, type Fields, type Row, type Source } from '../src/types.ts'

// Datos inventados: nunca poner pacientes reales en el repo

const EMPTY = Object.fromEntries(FIELDS.map((f) => [f, ''])) as Fields

const mk = (date: string, hc: string, source: Source = 'both'): Row => ({
  ...EMPTY,
  name: `PACIENTE ${hc}`,
  hc,
  duration: '45',
  time: '8:30',
  surgery: 'CATARATA',
  surgeon: 'DIAZ',
  eye: 'DERECHO',
  key: `${date}|PACIENTE ${hc}|${hc}`,
  date,
  source,
})

// fila completa a la que se le pisan campos (o se le vacían con '')
const withFields = (date: string, hc: string, fields: Partial<Fields>): Row => ({ ...mk(date, hc), ...fields })

const MONDAY = '2026-10-12'
const NEXT_MONDAY = '2026-10-19'
const DONE: TaskState = { done: true, note: '' }

const keys = (items: { key: string }[]) => items.map((i) => i.key)

// la tarea semanal "datos" tal como la arma weekTasks
const datosItem = (tasks: Record<string, TaskState>, now: string, monday = MONDAY): TaskItem => {
  const item = weekTasks(monday, tasks, now).find((i) => i.def.id === 'datos')
  assert.ok(item, 'weekTasks no trae la tarea "datos"')
  return item
}

// definiciones

test('WEEK_FIELDS son exactamente cirugía, cirujano, ojo, duración, paciente y horario, en ese orden', () => {
  const esperados: Field[] = ['surgery', 'surgeon', 'eye', 'duration', 'name', 'time']
  assert.deepEqual(WEEK_FIELDS, esperados)
})

// faltantes

test('una cirugía con todos los datos de la semana no tiene faltantes', () => {
  const checks = dataChecks([mk('2026-10-14', '1/00')], {})
  assert.equal(checks.length, 1)
  assert.deepEqual(checks[0]!.missing, [])
})

test('los faltantes salen en el orden de WEEK_FIELDS aunque falten varios y sin importar en qué orden venga cargada la fila', () => {
  const normal = withFields('2026-10-14', '1/00', { time: '', eye: '', surgery: '' })
  // la misma fila con las propiedades insertadas al revés
  const alReves: Row = Object.fromEntries(Object.entries(normal).toReversed()) as Row
  assert.deepEqual(dataChecks([normal], {})[0]!.missing, ['surgery', 'eye', 'time'])
  assert.deepEqual(dataChecks([alReves], {})[0]!.missing, ['surgery', 'eye', 'time'])

  const todos = withFields('2026-10-14', '2/00', { time: '', name: '', duration: '', eye: '', surgeon: '', surgery: '' })
  assert.deepEqual(dataChecks([todos], {})[0]!.missing, WEEK_FIELDS)
})

test('«.», «-» y los espacios cuentan como vacío, igual que en el resto de la app', () => {
  const rows = [
    withFields('2026-10-14', '1/00', { surgery: '.' }),
    withFields('2026-10-14', '2/00', { surgeon: ' - ' }),
    withFields('2026-10-14', '3/00', { eye: '   ' }),
    withFields('2026-10-14', '4/00', { duration: '--' }),
    withFields('2026-10-14', '5/00', { name: ' . ' }),
    withFields('2026-10-14', '6/00', { time: '' }),
  ]
  assert.deepEqual(
    dataChecks(rows, {}).map((c) => c.missing),
    [['surgery'], ['surgeon'], ['eye'], ['duration'], ['name'], ['time']],
  )
  // un valor real con una nota no es vacío
  const nota = withFields('2026-10-14', '7/00', { eye: 'OD, pero revisar', duration: '60 min, si hay tiempo' })
  assert.deepEqual(dataChecks([nota], {})[0]!.missing, [])
})

test('ayudante, teléfono, dioptrías, anestesia y HC no cuentan como faltantes aunque estén vacíos', () => {
  const row = withFields('2026-10-14', '1/00', { assistant: '', phone: '', diopters: '', anesthesia: '', hc: '', contact: '', notes: '' })
  assert.deepEqual(dataChecks([row], {})[0]!.missing, [])
})

// claves y estado

test('hay un control por fila, en el orden dado y con su fila; sin filas no hay ninguno', () => {
  const rows = [mk('2026-10-14', '1/00'), withFields('2026-10-13', '2/00', { eye: '' }), mk('2026-10-16', '3/00')]
  const checks = dataChecks(rows, {})
  assert.deepEqual(checks.map((c) => c.row), rows)
  assert.deepEqual(checks.map((c) => c.state), [NO_TASK, NO_TASK, NO_TASK])
  assert.deepEqual(dataChecks([], {}), [])
})

test('la clave es "datos|" más la clave de la fila, distinta por cirugía (también con la misma HC en dos fechas)', () => {
  const rows = [mk('2026-10-14', '1/00'), mk('2026-10-16', '1/00'), mk('2026-10-14', '2/00')]
  const checks = dataChecks(rows, {})
  assert.deepEqual(keys(checks), rows.map((r) => `datos|${r.key}`))
  assert.equal(new Set(keys(checks)).size, 3)
})

test('lo guardado bajo la clave de datos vuelve como estado de esa cirugía solo, y lo guardado bajo otras claves no cuenta', () => {
  const rows = [mk('2026-10-14', '1/00'), mk('2026-10-16', '1/00'), mk('2026-10-14', '2/00')]
  const saved: TaskState = { done: true, note: 'el horario lo confirman el lunes' }
  const again = dataChecks(rows, { [`datos|${rows[1]!.key}`]: saved, [`lente|${rows[0]!.key}`]: DONE, [`nombre|${rows[2]!.key}`]: DONE })
  assert.deepEqual(again.map((c) => c.state), [NO_TASK, saved, NO_TASK])
})

test('la clave de datos no choca con las de lentes, teléfono ni nombre de la misma cirugía ni con las de la semana', () => {
  const rows = [mk('2026-10-14', '1/00'), mk('2026-10-16', '1/00'), mk('2026-10-14', '2/00')]
  const datos = keys(dataChecks(rows, {}))
  const otras = [
    ...keys(lensChecks(rows, {})),
    ...keys(phoneChecks(rows, {})),
    ...keys(nameChecks(rows, {})),
    ...keys(weekTasks(MONDAY, {}, '2026-10-12')),
    ...keys(weekTasks(NEXT_MONDAY, {}, '2026-10-12')),
  ]
  const todas = [...datos, ...otras]
  assert.equal(new Set(todas).size, todas.length)
})

// dataTask

// una cirugía completa entre dos incompletas
const ROWS = [withFields('2026-10-14', '1/00', { time: '' }), mk('2026-10-13', '2/00'), withFields('2026-10-16', '3/00', { eye: '', duration: '.' })]
const KEYS = dataChecks(ROWS, {}).map((c) => c.key)

// estado guardado con los controles de los índices dados tildados
const checked = (...idx: number[]): Record<string, TaskState> => Object.fromEntries(idx.map((i) => [KEYS[i]!, DONE]))

test('dataTask: la tarea está hecha cuando están tildadas todas las cirugías incompletas, y no antes', () => {
  const now = '2026-10-09'
  const result = (tasks: Record<string, TaskState>) => dataTask(datosItem({}, now), dataChecks(ROWS, tasks), now)
  assert.equal(result({}).state.done, false)
  assert.equal(result(checked(0)).state.done, false)
  assert.equal(result(checked(2)).state.done, false)
  assert.equal(result(checked(0, 2)).state.done, true)
  assert.equal(result(checked(0, 2)).status, 'done')
})

test('dataTask: las cirugías completas no bloquean aunque no estén tildadas, y tildar una completa no cambia nada', () => {
  const now = '2026-10-09'
  const result = (tasks: Record<string, TaskState>) => dataTask(datosItem({}, now), dataChecks(ROWS, tasks), now)
  // la del medio está completa y sin tildar: con las otras dos tildadas alcanza
  assert.equal(result(checked(0, 2)).state.done, true)
  // tildar la completa sola no ayuda y sumarla a las demás no estorba
  assert.equal(result(checked(1)).state.done, false)
  assert.equal(result(checked(0, 1, 2)).state.done, true)
  assert.equal(result(checked(0, 1)).state.done, false)
})

test('dataTask: sin cirugías, o con todas completas, la tarea está hecha', () => {
  const now = '2026-10-09'
  const vacia = dataTask(datosItem({}, now), dataChecks([], {}), now)
  assert.equal(vacia.state.done, true)
  assert.equal(vacia.status, 'done')

  const completas = [mk('2026-10-14', '1/00'), mk('2026-10-15', '2/00')]
  const todas = dataTask(datosItem({}, now), dataChecks(completas, {}), now)
  assert.equal(todas.state.done, true)
  assert.equal(todas.status, 'done')
})

test('dataTask: mientras falta tildar una, el estado sigue a "hoy": pendiente, hoy y vencida; hecha gana siempre', () => {
  const faltaUna = dataChecks(ROWS, checked(0))
  const todas = dataChecks(ROWS, checked(0, 2))
  const status = (now: string, checks = faltaUna) => dataTask(datosItem({}, now), checks, now).status
  assert.equal(status('2026-10-09'), 'pending')
  assert.equal(status('2026-10-11'), 'today')
  assert.equal(status('2026-10-12'), 'overdue')
  assert.equal(status('2026-10-09', todas), 'done')
  assert.equal(status('2026-10-11', todas), 'done')
  assert.equal(status('2026-10-12', todas), 'done')
})

test('dataTask: lo que se guardó como hecho en la tarea misma no la cierra mientras falte una cirugía, y lo guardado como no hecho no la frena si están todas', () => {
  const now = '2026-10-09'
  const claveTarea = datosItem({}, now).key

  const falsoHecho = { ...checked(0), [claveTarea]: DONE }
  const pendiente = dataTask(datosItem(falsoHecho, now), dataChecks(ROWS, falsoHecho), now)
  assert.equal(pendiente.state.done, false)
  assert.equal(pendiente.status, 'pending')

  const falsoPendiente = { ...checked(0, 2), [claveTarea]: { done: false, note: '' } }
  const hecha = dataTask(datosItem(falsoPendiente, now), dataChecks(ROWS, falsoPendiente), now)
  assert.equal(hecha.state.done, true)
  assert.equal(hecha.status, 'done')
})

test('dataTask: conserva la nota guardada y no cambia la clave, la definición ni el vencimiento', () => {
  const now = '2026-10-09'
  const claveTarea = datosItem({}, now).key
  const tasks = { ...checked(0), [claveTarea]: { done: false, note: 'falta el horario de dos' } }
  const original = datosItem(tasks, now)
  const result = dataTask(original, dataChecks(ROWS, tasks), now)
  assert.equal(result.state.note, 'falta el horario de dos')
  assert.equal(result.key, original.key)
  assert.equal(result.due, original.due)
  assert.deepEqual(result.def, original.def)
})

// tarea de la semana

test('hay una definición "datos" semanal con vencimiento un día antes, y weekTasks la trae vencida el domingo anterior al lunes', () => {
  const defs = TASK_DEFS.filter((d) => d.id === 'datos')
  assert.equal(defs.length, 1)
  assert.equal(defs[0]!.scope, 'week')
  assert.equal(defs[0]!.daysBefore, 1)

  assert.equal(datosItem({}, '2026-10-01').due, '2026-10-11')
  assert.equal(datosItem({}, '2020-01-01', '2026-06-01').due, '2026-05-31')
  assert.equal(datosItem({}, '2020-01-01', '2025-12-29').due, '2025-12-28')
  assert.deepEqual(datosItem({}, '2026-10-01').state, NO_TASK)
})
