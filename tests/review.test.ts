import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyEdits } from '../src/checklist.ts'
import { diffRows, findOrphans, resolveEdit } from '../src/review.ts'
import { FIELDS, type Fields, type Row } from '../src/types.ts'

// Datos inventados: nunca poner pacientes reales en el repo
const empty = Object.fromEntries(FIELDS.map((f) => [f, ''])) as Fields
const row = (date: string, hc: string, over: Partial<Row> = {}): Row => ({
  ...empty,
  name: `PACIENTE ${hc}`,
  hc,
  surgery: 'CATARATA',
  surgeon: 'DIAZ',
  key: `${date}|${hc}`,
  date,
  source: 'both',
  ...over,
})

test('lo escrito a mano que no cambió en las fuentes rige sin avisos', () => {
  const src = row('2026-10-13', '1/00')
  const { edit, conflicts } = resolveEdit(src, { surgeon: 'LUNA', prequi: 'OK' }, { surgeon: 'DIAZ', prequi: '' })
  assert.deepEqual(edit, { surgeon: 'LUNA', prequi: 'OK' })
  assert.deepEqual(conflicts, [])
})

test('si las fuentes cambian un campo que editaste, pide confirmar y sigue rigiendo lo tuyo', () => {
  const src = row('2026-10-13', '1/00', { surgeon: 'PAINO' })
  const { edit, conflicts } = resolveEdit(src, { surgeon: 'LUNA' }, { surgeon: 'DIAZ' })
  assert.equal(edit.surgeon, 'LUNA')
  assert.deepEqual(conflicts, [{ field: 'surgeon', mine: 'LUNA', was: 'DIAZ', now: 'PAINO' }])
})

test('ediciones viejas (sin confirmar) que difieren de las fuentes también se avisan; las columnas solo del checklist no', () => {
  const src = row('2026-10-13', '1/00')
  const { conflicts } = resolveEdit(src, { surgeon: 'LUNA', prequi: 'OK', extra: 'x', time: '9-10' }, undefined)
  assert.deepEqual(conflicts.map((c) => c.field), ['surgeon'])
  assert.equal(conflicts[0].was, undefined)
})

test('lo escrito que coincide con las fuentes, o que era igual a lo que decían, no es una diferencia', () => {
  const src = row('2026-10-13', '1/00', { surgeon: 'PAINO' })
  assert.deepEqual(resolveEdit(src, { surgeon: 'PAINO' }, undefined).conflicts, [])
  const r = resolveEdit(src, { surgeon: 'DIAZ' }, { surgeon: 'DIAZ' })
  assert.deepEqual(r.edit, {})
  assert.deepEqual(r.conflicts, [])
})

test('confirmar (base = lo que dicen hoy las fuentes) apaga el aviso; si vuelven a cambiar, vuelve', () => {
  const edits = { '2026-10-13|1/00': { surgeon: 'LUNA' } }
  const [a] = applyEdits([row('2026-10-13', '1/00', { surgeon: 'PAINO' })], edits, { '2026-10-13|1/00': { surgeon: 'PAINO' } })
  assert.equal(a.surgeon, 'LUNA')
  assert.equal(a.conflicts, undefined)
  const [b] = applyEdits([row('2026-10-13', '1/00', { surgeon: 'MATA' })], edits, { '2026-10-13|1/00': { surgeon: 'PAINO' } })
  assert.equal(b.conflicts?.[0].now, 'MATA')
})

test('findOrphans: trabajo manual en una cirugía que desapareció, y a dónde se movió', () => {
  const snaps = { '2026-10-14|2/00': { ...row('2026-10-14', '2/00'), date: '2026-10-14' }, '2026-10-14|3/00': { ...row('2026-10-14', '3/00'), date: '2026-10-14' } }
  const orphans = findOrphans({
    present: [row('2026-10-16', '2/00')],
    snaps,
    edits: { '2026-10-14|2/00': { prequi: 'OK' }, '2026-10-14|3/00': { prequi: '' } },
    included: {},
    from: '2026-10-05',
  })
  // la 3/00 no tenía nada escrito: no se avisa (la cubren las novedades)
  assert.equal(orphans.length, 1)
  assert.equal(orphans[0].movedTo?.date, '2026-10-16')
})

test('diffRows: nuevas, movidas, canceladas y con datos distintos; lo que ya tiene conflicto no se repite', () => {
  const before = [row('2026-10-13', '1/00'), row('2026-10-14', '2/00'), row('2026-10-15', '3/00'), row('2026-10-15', '4/00', { surgeon: 'DIAZ' })]
  const after = [row('2026-10-13', '1/00'), row('2026-10-16', '2/00'), row('2026-10-17', '5/00'), row('2026-10-15', '4/00', { surgeon: 'PAINO' })]
  const kinds = Object.fromEntries(diffRows(before, after, {}, {}).map((n) => [n.name, n.kind]))
  assert.deepEqual(kinds, { 'PACIENTE 2/00': 'moved', 'PACIENTE 5/00': 'added', 'PACIENTE 3/00': 'removed', 'PACIENTE 4/00': 'changed' })
  // el cirujano de la 4/00 lo editó ella: va por la vía de la confirmación, no como novedad
  assert.equal(diffRows(before, after, { '2026-10-15|4/00': { surgeon: 'LUNA' } }, {}).some((n) => n.kind === 'changed'), false)
})
