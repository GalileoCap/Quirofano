import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NO_TASK, lensChecks, phoneChecks, surgeryTasks, weekTasks, type TaskState } from '../src/tasks.ts'
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

const withPhone = (date: string, hc: string, phone: string): Row => ({ ...mk(date, hc), phone })

const MONDAY = '2026-10-12'
const NEXT_MONDAY = '2026-10-19'

const keys = (items: { key: string }[]) => items.map((i) => i.key)
const reset = () => useStore.getState().clearUserData()

test('hay un aviso de teléfono por fila, en el orden dado y con su fila; sin filas no hay ninguno', () => {
  const rows = [mk('2026-10-14', '1/00'), withPhone('2026-10-13', '2/00', '11 5555-0101'), mk('2026-10-16', '3/00')]
  const checks = phoneChecks(rows, {})
  assert.equal(checks.length, 3)
  assert.deepEqual(checks.map((c) => c.row), rows)
  assert.deepEqual(checks.map((c) => c.state), [NO_TASK, NO_TASK, NO_TASK])
  assert.deepEqual(phoneChecks([], {}), [])
})

test('hasPhone es verdadero con cualquier contenido real y falso con vacío, espacios o solo marcas de "nada"', () => {
  const sin = ['', '   ', '.', '-', '--', ' . ']
  const con = ['11 5555-0101', '5555-0101', '0221 555 0102', 'ver con la hija', '11 5555-0101 (esposa)']
  const rows = [...sin, ...con].map((p, i) => withPhone('2026-10-14', `${i + 1}/00`, p))
  assert.deepEqual(
    phoneChecks(rows, {}).map((c) => c.hasPhone),
    [...sin.map(() => false), ...con.map(() => true)],
  )
})

test('las claves de teléfono son estables y distintas por cirugía, también con la misma HC en dos fechas', () => {
  const rows = [mk('2026-10-14', '1/00'), mk('2026-10-16', '1/00'), mk('2026-10-14', '2/00')]
  const a = phoneChecks(rows, {})
  assert.deepEqual(keys(phoneChecks(rows, { 'x|1': { done: true, note: '' } })), keys(a))
  assert.equal(new Set(keys(a)).size, 3)
})

test('la clave de teléfono no choca con la de lentes ni con la de "llamar" de la misma cirugía ni con las de la semana', () => {
  const rows = [mk('2026-10-14', '1/00'), mk('2026-10-16', '1/00'), mk('2026-10-14', '2/00')]
  const telefono = keys(phoneChecks(rows, {}))
  const lentes = keys(lensChecks(rows, {}))
  const llamar = keys(surgeryTasks(rows, {}, '2026-10-12'))
  const semana = [...keys(weekTasks(MONDAY, {}, '2026-10-12')), ...keys(weekTasks(NEXT_MONDAY, {}, '2026-10-12'))]
  const todas = [...telefono, ...lentes, ...llamar, ...semana]
  assert.equal(new Set(todas).size, todas.length)
})

test('lo guardado bajo la clave de un aviso de teléfono vuelve como su estado, solo en esa cirugía', () => {
  const rows = [mk('2026-10-14', '1/00'), mk('2026-10-16', '1/00'), mk('2026-10-14', '2/00')]
  const saved: TaskState = { done: true, note: 'sin teléfono, ya lo hablé en la consulta' }
  const again = phoneChecks(rows, { [phoneChecks(rows, {})[1]!.key]: saved })
  assert.deepEqual(again.map((c) => c.state), [NO_TASK, saved, NO_TASK])
})

test('tildar el aviso de teléfono con setTask no toca el "llamar" ni los lentes de la misma cirugía, y al revés', () => {
  reset()
  const row = withPhone('2026-10-14', '1/00', '11 5555-0101')
  const phone = phoneChecks([row], useStore.getState().tasks)[0]!
  const call = surgeryTasks([row], useStore.getState().tasks, '2026-10-12')[0]!

  useStore.getState().setTask(phone.key, { done: true })
  assert.deepEqual(phoneChecks([row], useStore.getState().tasks)[0]!.state, { done: true, note: '' })
  assert.deepEqual(surgeryTasks([row], useStore.getState().tasks, '2026-10-12')[0]!.state, NO_TASK)
  assert.deepEqual(lensChecks([row], useStore.getState().tasks)[0]!.state, NO_TASK)

  reset()
  useStore.getState().setTask(call.key, { done: true, note: 'llamé' })
  assert.deepEqual(surgeryTasks([row], useStore.getState().tasks, '2026-10-12')[0]!.state, { done: true, note: 'llamé' })
  assert.deepEqual(phoneChecks([row], useStore.getState().tasks)[0]!.state, NO_TASK)
})
