import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sheetCsv } from '../src/checklist.ts'
import { compareSheet, parseSheet } from '../src/compare.ts'
import { blankFields } from '../src/persist.ts'
import type { Fields, Row } from '../src/types.ts'

const row = (date: string, f: Partial<Fields>, source: Row['source'] = 'both'): Row => ({ ...blankFields(), ...f, key: `${date}|${f.hc || f.name}`, date, source })

// la planilla que arma la residente: otra cabecera, NUMERO es la HC y HC es la casilla
const planilla = [
  'FECHA,PACIENTE,NUMERO,DURACION,HORARIO,CIRUGIA,CIRUJANO 1°,AYUDANTE,OJO,DIOPTRIAS,ANESTESIA,TELEFENO,COMENTARIOS,PREQUI,HC,GOTAS,,QUIROFANO,HOSPITAL DIA,LLAMADO',
  ',,,,,,,,,,,,,,,,,,,',
  ',,,,,MARTES,,,,,,,,,,,,,,',
  '3/11/2026,PEREZ JUAN,100/00,60,8-9,CATARATA,DIAZ,-,DERECHO,+21.00,LOCAL + APOYO,1111,AAS,OK,SI,SI,VENCEN,,,',
  '3/11/2026,GOMEZ ANA,,,,,,,,,,,,,,,,,,',
  ',,,,,LUNES,,,,,,,,,,,,,,',
  '2/11/2026,LOPEZ RAUL,200/00,30,,ANTIANGIOGENICO,LUNA,.,IZQUIERDO,,LOCAL + APOYO,2222,,,,,,,,',
].join('\n')

test('parseSheet lee la planilla por el nombre de cada columna y avisa las que la app no tiene', () => {
  const s = parseSheet(planilla)!
  assert.deepEqual(s.rows.map((r) => [r.date, r.values.name, r.values.hc]), [['2026-11-03', 'PEREZ JUAN', '100/00'], ['2026-11-03', 'GOMEZ ANA', ''], ['2026-11-02', 'LOPEZ RAUL', '200/00']])
  const perez = s.rows[0].values
  assert.equal(perez.time, '8-9')
  assert.equal(perez.surgeon, 'DIAZ')
  assert.equal(perez.notes, 'AAS')
  assert.equal(perez.hcCheck, 'SI')
  assert.equal(perez.assistant, '')
  assert.ok(!s.columns.includes('contact'))
  assert.deepEqual(s.ignored, ['GOTAS', 'columna 17'])
})

test('parseSheet lee también el CSV que exporta la app', () => {
  const rows = [row('2026-11-02', { name: 'LOPEZ RAUL', hc: '200/00', time: '9', phone: '2222', extra: 'llamar' })]
  const s = parseSheet(sheetCsv(rows))!
  assert.deepEqual(s.rows.map((r) => [r.date, r.values.name, r.values.time, r.values.phone, r.values.extra]), [['2026-11-02', 'LOPEZ RAUL', '9', '2222', 'llamar']])
  assert.deepEqual(s.ignored, [])
})

test('compareSheet empareja por HC o por nombre en el mismo día y lista solo los campos distintos de las columnas que trae', () => {
  const s = parseSheet(planilla)!
  const app = [
    row('2026-11-02', { name: 'LOPEZ RAUL', hc: '200/00', duration: '30', surgery: 'ANTIANGIOGENICO', surgeon: 'LUNA', eye: 'IZQUIERDO', anesthesia: 'LOCAL + APOYO', phone: '2222', contact: 'hija' }),
    // mal escrito el nombre, misma HC
    row('2026-11-03', { name: 'PERES JUAN', hc: '100/00', duration: '60', surgery: 'catarata', surgeon: 'DIAZ', eye: 'DERECHO', diopters: '21.00', anesthesia: 'LOCAL + APOYO', phone: '1111', notes: 'AAS' }),
  ]
  const d = compareSheet(s, app, [], { from: '2026-11-02', to: '2026-11-08' })
  assert.equal(d.equal, 1)
  const fields = d.changes.filter((c) => c.kind === 'field').map((c) => c.kind === 'field' && [c.field, c.mine, c.theirs])
  assert.deepEqual(fields, [['name', 'PERES JUAN', 'PEREZ JUAN'], ['time', '', '8-9'], ['diopters', '21.00', '+21.00'], ['prequi', '', 'OK'], ['hcCheck', '', 'SI']])
  assert.deepEqual(d.changes.filter((c) => c.kind === 'missing').map((c) => c.kind === 'missing' && c.sheet.values.name), ['GOMEZ ANA'])
})
