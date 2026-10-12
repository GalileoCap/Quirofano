import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAgenda } from '../src/agenda.ts'
import { classifyEvents, parseIcs } from '../src/ics.ts'
import { suggestions } from '../src/suggest.ts'

// Datos inventados: nunca poner pacientes reales en el repo
const HEADER = 'Marca temporal,Marca temporal,APELLIDO Y  NOMBRE  ,OBRA SOCIAL,DURACION,CIRUGIA,CIRUJANO,AYUDANTE,,JERARQUIA,TELEFONO DE CONTACTO,INSUMO A UTILIZAR,DIOPTRIAS,ANESTESIA,PEDIDO B,OBSERVACIONES,EDAD,DNI,'
const row = (name: string, surgery: string, surgeon: string, eye: string, dur = '60', date = '13/10/2026') =>
  `1/09/2026 10:00:00,${date},${name},100/00,${dur},${surgery},${surgeon},.,${eye},-,1111,,,LOCAL,No,,.,.,`

test('suggestions: valores de la agenda y del calendar, del más usado al menos usado, sin repetir variantes de escritura', () => {
  const agenda = parseAgenda(
    [
      HEADER,
      row('A UNO', 'CATARATA', 'DIAZ', 'DERECHO'),
      row('B DOS', 'CATARATA', 'Díaz', 'DERECHO', '30'),
      row('C TRES', 'ANTIANGIOGENICO', 'DIAZ', 'IZQUIERDO'),
      row('D CUATRO', 'PTERIGION', 'MATA', 'DERECHO', '30 min'),
    ].join('\n'),
  )
  const ics = [
    'BEGIN:VCALENDAR',
    'X-WR-CALNAME:AGENDA',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261013',
    'DTEND;VALUE=DATE:20261014',
    'SUMMARY:PTERIGION / E CINCO / LUNA / BELEN',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const { events } = classifyEvents(parseIcs(ics))
  const s = suggestions(agenda, events, { since: '2025-10-12' })
  // DIAZ y Díaz son la misma persona: se ofrece la grafía más usada, una sola vez
  assert.deepEqual(s.surgeon, ['DIAZ', 'MATA', 'LUNA'])
  assert.deepEqual(s.surgery, ['CATARATA', 'PTERIGION', 'ANTIANGIOGENICO'])
  assert.deepEqual(s.eye, ['DERECHO', 'IZQUIERDO'])
  // el ayudante "." de la agenda es "nada": no se sugiere; el del calendar sí
  assert.deepEqual(s.assistant, ['BELEN'])
  assert.deepEqual(s.duration, ['60', '30'])
})

test('suggestions: solo los campos donde sirve, y con un tope', () => {
  const agenda = parseAgenda([HEADER, ...Array.from({ length: 10 }, (_, i) => row(`P${i}`, `CIRUGIA ${i}`, 'DIAZ', 'DERECHO'))].join('\n'))
  const s = suggestions(agenda, [], { since: '2025-10-12', limit: 3 })
  assert.equal(s.surgery?.length, 3)
  // el nombre del paciente, la HC, el DNI y el teléfono no se sugieren
  for (const f of ['name', 'hc', 'dni', 'phone', 'time', 'prequi'] as const) assert.equal(s[f], undefined)
})

test('suggestions: solo lo del último año (por la fecha de la cirugía, o la de carga si la fecha está rota)', () => {
  const agenda = parseAgenda(
    [
      HEADER,
      row('A UNO', 'CATARATA', 'DIAZ', 'DERECHO', '60', '13/10/2026'),
      row('B DOS', 'PTERIGION', 'VIEJO', 'DERECHO', '60', '05/03/2024'),
      // fecha rota: se usa la marca temporal de la carga (1/09/2026)
      row('C TRES', 'CHALAZION', 'ROTO', 'DERECHO', '60', 'ABARC'),
    ].join('\n'),
  )
  const s = suggestions(agenda, [], { since: '2025-10-12' })
  assert.deepEqual(s.surgeon, ['DIAZ', 'ROTO'])
  assert.deepEqual(s.surgery, ['CATARATA', 'CHALAZION'])
})
