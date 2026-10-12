import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AGENDA_COLUMNS, parseAgenda } from '../src/agenda.ts'
import { classifyEvents, describeEvent, parseIcs } from '../src/ics.ts'
import { mergeChecklist } from '../src/merge.ts'
import { disagree, otherAgendaRows } from '../src/origin.ts'

// Datos inventados: nunca poner pacientes reales en el repo
const HEADER = 'Marca temporal,Marca temporal,APELLIDO Y  NOMBRE  ,OBRA SOCIAL,DURACION,CIRUGIA,CIRUJANO,AYUDANTE,,JERARQUIA,TELEFONO DE CONTACTO,INSUMO A UTILIZAR,DIOPTRIAS,ANESTESIA,PEDIDO B,OBSERVACIONES,EDAD,DNI,'
const agendaCsv = [
  HEADER,
  '1/09/2026 10:00:00,13/10/2026,PEREZ JUAN,100/00,60 min,CATARATA,DIAZ,LUNA,DERECHO,ESPOSA,1111,LIO,.,LOCAL,No,,70,123,',
  '2/03/2026 10:00:00,05/03/2026,PEREZ JUAN,100/00,60,CATARATA,DIAZ,LUNA,IZQUIERDO,-,1111,,,LOCAL,No,,70,123,',
  '3/09/2026 10:00:00,13/10/2026,GOMEZ ANA,200/00,30,ANTIANGIOGENICO,DIAZ,.,IZQUIERDO,-,2222,,,LOCAL,No,,.,.,',
].join('\n')

const ics = (name: string, events: [string, string, string?][]) =>
  [
    'BEGIN:VCALENDAR',
    `X-WR-CALNAME:${name}`,
    ...events.flatMap(([d, t, desc]) => [
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${+d + 1}`,
      `SUMMARY:${t}`,
      ...(desc ? [`DESCRIPTION:${desc}`] : []),
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join('\r\n')

test('parseAgenda guarda las celdas crudas, y las columnas dicen cómo se lee cada una', () => {
  const [a] = parseAgenda(agendaCsv)
  assert.equal(a.cells.length, 19)
  assert.equal(a.cells[4], '60 min')
  assert.equal(AGENDA_COLUMNS.length, 18)
  assert.equal(AGENDA_COLUMNS[4].read(a), '60')
  // la celda "." se ignora: se lee como vacío
  assert.equal(a.cells[12], '.')
  assert.equal(AGENDA_COLUMNS[12].read(a), '')
})

test('el cruce anota de dónde salió cada campo y cómo se encontró la fila de la agenda', () => {
  const agenda = parseAgenda(agendaCsv)
  const { events, problems } = classifyEvents(
    parseIcs(
      ics('AGENDA', [
        // el calendar trae HC y ojo/dioptrías; el nombre está escrito en otro orden
        ['20261013', 'CATARATA / JUAN PEREZ / DIAZ / LUNA', 'DERECHO / +21.00 / 100/00 / 1111'],
        ['20261013', 'ANTIANGIOGENICO / GOMEZ ANA / DIAZ / -'],
        ['20261013', 'CATARATA / SIN AGENDA SIMON / DIAZ / -'],
      ]),
    ),
  )
  const res = mergeChecklist({ agenda, events, problems, from: '2026-10-12', to: '2026-10-18' })
  const perez = res.rows.find((r) => r.name === 'PEREZ JUAN')!
  assert.equal(perez.origin?.by, 'hc')
  assert.equal(perez.origin?.agenda?.line, 2)
  assert.equal(perez.origin?.event?.title, 'CATARATA / JUAN PEREZ / DIAZ / LUNA')
  assert.equal(perez.origin?.event?.description, 'DERECHO / +21.00 / 100/00 / 1111')
  // las dioptrías de la agenda eran "." (vacías): las puso el calendar; el ojo coincide y se atribuye a la agenda
  assert.equal(perez.origin?.fields.diopters, 'calendar')
  assert.equal(perez.origin?.fields.eye, 'agenda')
  assert.equal(perez.origin?.fields.surgeon, 'agenda')
  assert.equal(perez.origin?.fields.time, undefined)

  const gomez = res.rows.find((r) => r.name === 'GOMEZ ANA')!
  assert.equal(gomez.origin?.by, 'name')

  const solo = res.rows.find((r) => r.name === 'SIN AGENDA SIMON')!
  assert.equal(solo.origin?.agenda, undefined)
  assert.equal(solo.origin?.fields.name, 'calendar')
})

test('las filas que solo vienen de la agenda dicen que son de la agenda', () => {
  const res = mergeChecklist({ agenda: parseAgenda(agendaCsv), events: [], problems: [], from: '2026-10-12', to: '2026-10-18' })
  assert.ok(res.rows.every((r) => r.origin?.event === undefined && r.origin?.agenda && r.origin.fields.name === 'agenda'))
})

test('describeEvent explica qué pasó con cada evento, también con los que se ignoran', () => {
  const [ok, free, personal] = parseIcs(
    ics('AGENDA', [
      ['20261013', 'CATARATA / PEREZ JUAN / DIAZ / LUNA'],
      ['20261013', 'CATARAT DIAZ'],
      ['20261013', 'Dentista'],
    ]),
  )
  assert.equal(describeEvent(ok).status, 'surgery')
  assert.equal(describeEvent(free).status, 'problem')
  assert.equal(describeEvent(personal).status, 'ignored')
  assert.equal(describeEvent({ ...ok, cancelled: true }).reason, 'Cancelado en el calendario')
  assert.equal(describeEvent({ ...ok, calendar: 'Días feriados' }).status, 'ignored')
  assert.equal(describeEvent({ ...ok, calendar: 'SUSPENSION QUIRURGICA' }).status, 'suspension')
})

test('otherAgendaRows: mismo paciente en otras filas, la más reciente primero; disagree ignora acentos y mayúsculas', () => {
  const agenda = parseAgenda(agendaCsv)
  const res = mergeChecklist({ agenda, events: [], problems: [], from: '2026-10-12', to: '2026-10-18' })
  const perez = res.rows.find((r) => r.name === 'PEREZ JUAN')!
  // la agenda se vuelve a leer en cada pantalla: la fila usada se reconoce por su línea, no por identidad
  assert.deepEqual(otherAgendaRows(parseAgenda(agendaCsv), perez).map((a) => a.line), [3])
  assert.equal(disagree('Díaz', 'DIAZ'), false)
  assert.equal(disagree('DIAZ', 'MATA'), true)
  assert.equal(disagree('', 'MATA'), false)
})
