import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeChecklist } from '../src/merge.ts'
import { problemKey, problemSignature, problemText, splitProblems } from '../src/problems.ts'
import { useStore } from '../src/store.ts'
import type { AgendaRow, CalEvent, CalProblem } from '../src/types.ts'

// Datos inventados: nunca poner pacientes reales en el repo

// el store guarda en localStorage, que Node no trae
const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) },
})

const problem = (over: Partial<CalProblem> = {}): CalProblem => ({
  date: '2026-10-14',
  title: 'CATARAT BROCHARD ORTELLADO',
  calendar: 'AGENDA',
  description: 'DERECHO / 100/00',
  ...over,
})

const agendaRow: AgendaRow = {
  line: 2,
  stamp: null,
  date: '2026-10-13',
  name: 'PACIENTE 1/00',
  hc: '1/00',
  duration: 45,
  surgery: 'CATARATA',
  surgeon: 'DIAZ',
  assistant: '',
  eye: 'DERECHO',
  contact: '',
  phone: '',
  supplies: '',
  diopters: '',
  anesthesia: '',
  pedidoB: '',
  notes: '',
  age: '',
  dni: '',
  cells: [],
}

// una cirugía legible, pero fuera de la semana: el calendar tiene eventos y ninguno cae en el rango
const laterEvent: CalEvent = {
  date: '2026-10-26',
  title: 'CATARATA / PACIENTE 2/00 / DIAZ',
  calendar: 'AGENDA',
  kind: 'surgery',
  surgery: 'CATARATA',
  name: 'PACIENTE 2/00',
  surgeon: 'DIAZ',
  assistant: '',
  eye: 'DERECHO',
  diopters: '',
  hc: '2/00',
  phone: '',
  description: '',
}

// merge

test('mergeChecklist deja en problems los eventos ilegibles del rango, en el orden de entrada, y no suma una línea a warnings por cada uno', () => {
  const first = problem({ date: '2026-10-16', title: 'CATARAT UNO' })
  const outside = problem({ date: '2026-10-19', title: 'CATARAT FUERA' })
  const before = problem({ date: '2026-10-11', title: 'CATARAT ANTES' })
  const edgeFrom = problem({ date: '2026-10-12', title: 'CATARAT BORDE DESDE' })
  const edgeTo = problem({ date: '2026-10-18', title: 'CATARAT BORDE HASTA' })
  const res = mergeChecklist({
    agenda: [agendaRow],
    events: [laterEvent],
    problems: [first, outside, before, edgeFrom, edgeTo],
    from: '2026-10-12',
    to: '2026-10-18',
  })
  assert.deepEqual(res.problems, [first, edgeFrom, edgeTo])
  assert.deepEqual(res.warnings.filter((w) => /CATARAT/.test(w)), [])
})

test('mergeChecklist sigue avisando en warnings que el calendar no cubre las fechas, haya o no eventos ilegibles', () => {
  for (const problems of [[], [problem({ date: '2026-10-14' })]]) {
    const res = mergeChecklist({ agenda: [agendaRow], events: [laterEvent], problems, from: '2026-10-12', to: '2026-10-18' })
    assert.equal(res.warnings.length, 1)
    assert.match(res.warnings[0]!, /^El calendar no tiene cirugías en estas fechas/)
  }
})

// problemText

test('problemText dice el título y el día y el mes con dos cifras, sin el año', () => {
  assert.equal(
    problemText(problem({ date: '2026-10-14', title: 'CATARAT BROCHARD ORTELLADO' })),
    'El evento "CATARAT BROCHARD ORTELLADO" del 14/10 no tiene el formato "CIRUGÍA / PACIENTE / CIRUJANO": no lo pude cruzar.',
  )
  assert.equal(
    problemText(problem({ date: '2026-10-04', title: '/CATABROCHARD/' })),
    'El evento "/CATABROCHARD/" del 04/10 no tiene el formato "CIRUGÍA / PACIENTE / CIRUJANO": no lo pude cruzar.',
  )
  assert.match(problemText(problem({ date: '2027-01-05' })), /del 05\/01 no tiene/)
})

// problemKey

test('problemKey identifica el evento: es estable, cambia con la fecha, el calendario o el título, y no con la descripción', () => {
  const p = problem()
  assert.equal(problemKey(p), problemKey({ ...p }))
  assert.equal(problemKey(p), problemKey(problem({ description: 'otra descripción' })))
  assert.equal(problemKey(p), problemKey(problem({ description: '' })))

  const keys = [p, problem({ date: '2026-10-15' }), problem({ calendar: 'AGENDA QUIRURGICA' }), problem({ title: 'CATARAT OTRO' })].map(problemKey)
  assert.equal(new Set(keys).size, keys.length)
})

// problemSignature

test('problemSignature dice qué trae el evento: cambia con la descripción y es igual para problemas iguales', () => {
  const p = problem()
  assert.equal(problemSignature(p), problemSignature({ ...p }))
  assert.notEqual(problemSignature(p), problemSignature(problem({ description: 'IZQUIERDO / 100/00' })))
  assert.notEqual(problemSignature(p), problemSignature(problem({ description: '' })))
})

// splitProblems

test('splitProblems: sin reconocimientos todo queda abierto', () => {
  const list = [problem(), problem({ title: 'CATARAT OTRO' })]
  assert.deepEqual(splitProblems(list, {}), { open: list, acked: [] })
  assert.deepEqual(splitProblems([], {}), { open: [], acked: [] })
})

test('splitProblems: el que tiene reconocida su huella actual va a acked, y solo ese', () => {
  const a = problem({ title: 'CATARAT A' })
  const b = problem({ title: 'CATARAT B' })
  const res = splitProblems([a, b], { [problemKey(a)]: problemSignature(a) })
  assert.deepEqual(res, { open: [b], acked: [a] })
})

test('splitProblems: si después la descripción del evento cambia, el reconocimiento viejo no vale y vuelve a estar abierto', () => {
  const before = problem({ description: 'DERECHO / 100/00' })
  const acks = { [problemKey(before)]: problemSignature(before) }
  assert.deepEqual(splitProblems([before], acks).acked, [before])

  const after = problem({ description: 'IZQUIERDO / 100/00' })
  assert.equal(problemKey(after), problemKey(before))
  assert.deepEqual(splitProblems([after], acks), { open: [after], acked: [] })
})

test('splitProblems: la huella reconocida bajo la clave de otro evento no silencia a este', () => {
  const a = problem({ title: 'CATARAT A' })
  const b = problem({ title: 'CATARAT B' })
  const acks = { [problemKey(a)]: problemSignature(b), [problemKey(b)]: problemSignature(a) }
  assert.deepEqual(splitProblems([a, b], acks), { open: [a, b], acked: [] })
  assert.deepEqual(splitProblems([a], { otra: problemSignature(a) }), { open: [a], acked: [] })
})

test('splitProblems conserva el orden de entrada en las dos listas', () => {
  const list = ['A', 'B', 'C', 'D', 'E'].map((t) => problem({ title: `CATARAT ${t}` }))
  const [a, b, c, d, e] = list as [CalProblem, CalProblem, CalProblem, CalProblem, CalProblem]
  const acks = Object.fromEntries([e, b, d].map((p) => [problemKey(p), problemSignature(p)]))
  assert.deepEqual(splitProblems(list, acks), { open: [a, c], acked: [b, d, e] })
})

// store

const reset = () => useStore.getState().clearUserData()

test('reconocer un evento ilegible en el store lo pasa a acked, deshacerlo lo devuelve a open y borrar los datos lo vacía', () => {
  reset()
  const p = problem()
  const other = problem({ title: 'CATARAT OTRO' })
  const list = [p, other]
  assert.deepEqual(splitProblems(list, useStore.getState().acks), { open: list, acked: [] })

  useStore.getState().acknowledge(problemKey(p), problemSignature(p))
  assert.deepEqual(splitProblems(list, useStore.getState().acks), { open: [other], acked: [p] })

  useStore.getState().unacknowledge(problemKey(p))
  assert.deepEqual(splitProblems(list, useStore.getState().acks), { open: list, acked: [] })

  useStore.getState().acknowledge(problemKey(p), problemSignature(p))
  useStore.getState().acknowledge(problemKey(other), problemSignature(other))
  assert.deepEqual(splitProblems(list, useStore.getState().acks), { open: [], acked: list })
  useStore.getState().clearUserData()
  assert.deepEqual(splitProblems(list, useStore.getState().acks), { open: list, acked: [] })
})
