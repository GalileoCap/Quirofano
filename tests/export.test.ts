import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sheetCsv, weekRange } from '../src/checklist.ts'
import type { Field, Row } from '../src/types.ts'
import { FIELDS } from '../src/types.ts'

// Datos inventados: nunca poner pacientes reales en el repo
const row = (date: string, fields: Partial<Record<Field, string>>): Row => ({
  ...(Object.fromEntries(FIELDS.map((f) => [f, ''])) as Record<Field, string>),
  key: `${date}|${fields.hc}`,
  date,
  source: 'manual',
  ...fields,
})

/** Una fila de 21 columnas, como en la planilla. */
const line = (...cells: string[]) => [...cells, ...Array(21 - cells.length).fill('')].join(',')

test('el CSV exportado tiene la forma de la planilla Checklist: días del último al primero, separados por una fila vacía, sin salto de línea final', () => {
  const csv = sheetCsv([
    row('2026-10-13', { name: 'PEREZ JUAN', hc: '100/00', duration: '60', surgery: 'CATARATA', surgeon: 'DIAZ', eye: 'DERECHO', prequi: 'OK', hcCheck: 'OK' }),
    row('2026-10-14', { name: 'GOMEZ ANA', hc: '200/00', duration: '30', surgery: 'ANTIANGIOGENICO', notes: 'ojo, con la presión', extra: 'llamar' }),
  ])
  assert.deepEqual(csv.split('\r\n'), [
    line(...Array(19).fill(''), 'QUIROFANO', 'QUIRO DIA'),
    line('', '', '', '', '', 'MIERCOLES', ...Array(9).fill(''), 'PREQUI', 'HC'),
    line('14/10/2026', 'GOMEZ ANA', '200/00', '30', '', 'ANTIANGIOGENICO', '', '', '', '', '', '', '', '"ojo, con la presión"', '', '', '', 'llamar'),
    line(),
    line('', '', '', '', '', 'MARTES'),
    line('13/10/2026', 'PEREZ JUAN', '100/00', '60', '', 'CATARATA', 'DIAZ', '', 'DERECHO', '', '', '', '', '', '', 'OK', 'OK'),
  ])
})

test('el rango de una semana es la semana entera salvo que haya uno guardado que caiga dentro de ella', () => {
  const monday = '2026-10-12'
  assert.deepEqual(weekRange(monday), { from: '2026-10-12', to: '2026-10-18' })
  assert.deepEqual(weekRange(monday, { [monday]: { from: '2026-10-12', to: '2026-10-16' } }), { from: '2026-10-12', to: '2026-10-16' })
  // el de otra semana no vale, ni uno que se sale de la semana o está al revés
  assert.deepEqual(weekRange(monday, { '2026-10-19': { from: '2026-10-19', to: '2026-10-20' } }), { from: '2026-10-12', to: '2026-10-18' })
  assert.deepEqual(weekRange(monday, { [monday]: { from: '2026-10-12', to: '2026-10-19' } }), { from: '2026-10-12', to: '2026-10-18' })
  assert.deepEqual(weekRange(monday, { [monday]: { from: '2026-10-16', to: '2026-10-13' } }), { from: '2026-10-12', to: '2026-10-18' })
})
