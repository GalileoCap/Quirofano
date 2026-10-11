import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAgenda, parseDate } from '../src/agenda.ts'
import { sheetTsv, sortRows, withTimes } from '../src/checklist.ts'
import { parseCsv } from '../src/csv.ts'
import { classifyEvents, parseIcs } from '../src/ics.ts'
import { mergeChecklist, nameMatch } from '../src/merge.ts'

// Datos inventados: nunca poner pacientes reales en el repo
const HEADER = 'Marca temporal,Marca temporal,APELLIDO Y  NOMBRE  ,OBRA SOCIAL,DURACION,CIRUGIA,CIRUJANO,AYUDANTE,,JERARQUIA,TELEFONO DE CONTACTO,INSUMO A UTILIZAR,DIOPTRIAS,ANESTESIA,PEDIDO B,OBSERVACIONES,EDAD,DNI,'
const agendaCsv = [
  HEADER,
  '1/09/2026 10:00:00,13/10/2026,PEREZ JUAN,100/00,60,CATARATA,DIAZ,LUNA,DERECHO,ESPOSA,1111,LIO,+21.00,LOCAL + APOYO,No,"GANCHOS, ojo",70,123,',
  '2/09/2026 10:00:00,13/10/2026,GOMEZ ANA,200/00,30 min,ANTIANGIOGENICO,DIAZ,.,IZQUIERDO,-,2222,,,LOCAL + APOYO,No,,.,.,',
  '3/09/2026 10:00:00,14/10/2026,SUSPENDIDO SOL,300/00,60,CATARATA,DIAZ,-,DERECHO,-,3333,,,LOCAL + APOYO,No,,.,.,',
  '4/09/2026 10:00:00,14/10/2026,SOLO AGENDA SARA,400/00,60,CATARATA,DIAZ,-,DERECHO,-,4444,,,LOCAL + APOYO,No,,.,.,',
  '5/09/2026 10:00:00,01/062026,REPROGRAMADA RITA,500/00,90,CATARATA,DIAZ,-,DERECHO,-,5555,,,LOCAL + APOYO,No,,.,.,',
].join('\n')

const ics = (name: string, events: [string, string][]) =>
  [
    'BEGIN:VCALENDAR',
    `X-WR-CALNAME:${name}`,
    ...events.flatMap(([d, t]) => ['BEGIN:VEVENT', `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${+d + 1}`, `SUMMARY:${t}`, 'END:VEVENT']),
    'END:VCALENDAR',
  ].join('\r\n')

test('parseCsv: comillas, comas y saltos de línea dentro de una celda', () => {
  assert.deepEqual(parseCsv('a,"b,c","d\ne"\r\n"x""y",,z'), [['a', 'b,c', 'd\ne'], ['x"y', '', 'z']])
})

test('parseDate: celdas rotas dan null', () => {
  assert.equal(parseDate('5/04/2026 21:04:46'), '2026-04-05')
  for (const bad of ['ABARC', '01/062026', '20/05/0004', '']) assert.equal(parseDate(bad), null)
})

test('parseAgenda: columnas corridas y marcadores de "nada"', () => {
  const [a] = parseAgenda(agendaCsv)
  assert.equal(a.eye, 'DERECHO')
  assert.equal(a.contact, 'ESPOSA')
  assert.equal(a.duration, 60)
  assert.equal(a.notes, 'GANCHOS, ojo')
  assert.equal(parseAgenda(agendaCsv)[1].assistant, '')
  assert.equal(parseAgenda(agendaCsv)[1].duration, 30)
})

test('nameMatch: orden de palabras y nombres incompletos', () => {
  assert.equal(nameMatch('Pérez, Juan', 'PEREZ JUAN'), 3)
  assert.equal(nameMatch('JUAN PEREZ', 'PEREZ JUAN'), 2)
  assert.equal(nameMatch('LOPEZ MARTA', 'LOPEZ MARTA ELENA'), 1)
  assert.equal(nameMatch('GOMEZ ANA', 'GOMEZ ROSA'), 0)
})

test('mergeChecklist: cruza calendar y agenda, separa suspendidas y avisa lo que no puede cruzar', () => {
  const agenda = parseAgenda(agendaCsv)
  const raw = [
    ...parseIcs(
      ics('AGENDA QUIRURGICA', [
        ['20261013', 'CATARATA / PEREZ JUAN / DIAZ / LUNA'],
        ['20261013', 'ANTIANGIOGENICO / GOMEZ ANA / DIAZ / -'],
        ['20261014', 'CATARATA / REPROGRAMADA RITA / DIAZ / -'],
        ['20261014', 'CATARATA / SIN AGENDA SIMON / DIAZ / -'],
        ['20261014', 'CATARAT DIAZ'],
      ]),
    ),
    ...parseIcs(ics('SUSPENSION QUIRURGICA', [['20261014', 'CATARATA / SUSPENDIDO SOL / DIAZ / -']])),
    ...parseIcs(ics('Días feriados en Argentina', [['20261012', 'Día del Respeto a la Diversidad']])),
  ]
  const { events, problems } = classifyEvents(raw)
  assert.equal(events.length, 5)
  assert.equal(problems.length, 1)

  const res = mergeChecklist({ agenda, events, problems, from: '2026-10-12', to: '2026-10-18' })
  const byName = Object.fromEntries(res.rows.map((r) => [r.name, r]))
  assert.equal(res.rows.length, 4)
  assert.equal(byName['PEREZ JUAN'].source, 'both')
  assert.equal(byName['PEREZ JUAN'].phone, '1111')
  assert.equal(byName['PEREZ JUAN'].warning, undefined)
  // la fecha de la agenda está rota: se usa igual, con aviso
  assert.equal(byName['REPROGRAMADA RITA'].duration, '90')
  assert.match(byName['REPROGRAMADA RITA'].warning!, /rota/)
  // en el calendar pero no en la agenda
  assert.equal(byName['SIN AGENDA SIMON'].source, 'calendar')
  assert.deepEqual(
    res.excluded.map((x) => [x.row.name, x.reason]),
    [
      ['SUSPENDIDO SOL', 'suspended'],
      ['SOLO AGENDA SARA', 'not-in-calendar'],
    ],
  )
  assert.equal(res.warnings.length, 1)
})

test('mergeChecklist: sin calendar en esas fechas usa la fecha de la agenda', () => {
  const res = mergeChecklist({ agenda: parseAgenda(agendaCsv), events: [], problems: [], from: '2026-10-12', to: '2026-10-18' })
  assert.equal(res.rows.length, 4)
  assert.equal(res.calendarCovers, false)
})

test('withTimes: una cirugía atrás de otra según la duración, y se respeta lo escrito a mano', () => {
  const res = mergeChecklist({ agenda: parseAgenda(agendaCsv), events: [], problems: [], from: '2026-10-13', to: '2026-10-13' })
  const rows = withTimes(res.rows, 8 * 60)
  assert.deepEqual(rows.map((r) => r.time), ['8-9', '9-9.30'])
  const manual = withTimes(res.rows.map((r, i) => (i === 0 ? { ...r, time: '7-8' } : r)), 8 * 60)
  assert.deepEqual(manual.map((r) => r.time), ['7-8', '9-9.30'])
})

test('sortRows: respeta el orden elegido y deja las filas nuevas al final', () => {
  const res = mergeChecklist({ agenda: parseAgenda(agendaCsv), events: [], problems: [], from: '2026-10-13', to: '2026-10-13' })
  const [a, b] = res.rows
  assert.deepEqual(sortRows(res.rows, { '2026-10-13': [b.key, a.key] }).map((r) => r.key), [b.key, a.key])
  assert.deepEqual(sortRows(res.rows, { '2026-10-13': [b.key] }).map((r) => r.key), [b.key, a.key])
})

test('sheetTsv: formato de la planilla, días del último al primero', () => {
  const res = mergeChecklist({ agenda: parseAgenda(agendaCsv), events: [], problems: [], from: '2026-10-13', to: '2026-10-14' })
  const lines = sheetTsv(withTimes(res.rows, 480)).split('\n').map((l) => l.split('\t'))
  assert.equal(lines[0][19], 'QUIROFANO')
  assert.equal(lines[1][5], 'MIERCOLES')
  assert.equal(lines[1][15], 'PREQUI')
  assert.equal(lines.at(-3)![5], 'MARTES')
  assert.ok(lines.every((l) => l.length === 21))
})
