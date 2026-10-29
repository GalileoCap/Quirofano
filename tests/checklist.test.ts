import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAgenda, parseDate } from '../src/agenda.ts'
import { sheetTsv, sortRows } from '../src/checklist.ts'
import { parseCsv } from '../src/csv.ts'
import { classifyEvents, parseDescription, parseIcs } from '../src/ics.ts'
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

test('parseDescription: formato actual y viejo, reconociendo cada dato por su forma', () => {
  assert.deepEqual(parseDescription('IZQUIERDO / +21.00 / 72763/00 / 1132138847 (TENGO WPP)'), {
    eye: 'IZQUIERDO', diopters: '+21.00', hc: '72763/00', phone: '1132138847 (TENGO WPP)', name: '',
  })
  assert.deepEqual(parseDescription('DERECHO /  / 602720 / 1122683163 \\; 15-3958'), {
    eye: 'DERECHO', diopters: '', hc: '602720', phone: '1122683163 \\; 15-3958', name: '',
  })
  const old = parseDescription('OI / CORULO OSCAR / 59628/00 / 42643381 o 1168029951')
  assert.equal(old.name, 'CORULO OSCAR')
  assert.equal(old.hc, '59628/00')
  assert.equal(old.eye, 'OI')
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
  assert.equal(res.rows.length, 5)
  assert.equal(byName['PEREZ JUAN'].source, 'both')
  assert.equal(byName['PEREZ JUAN'].phone, '1111')
  assert.equal(byName['PEREZ JUAN'].warning, undefined)
  // la fecha de la agenda está rota: de esa fila sale solo quién es, con aviso
  assert.equal(byName['REPROGRAMADA RITA'].phone, '5555')
  assert.equal(byName['REPROGRAMADA RITA'].duration, '')
  assert.match(byName['REPROGRAMADA RITA'].warning!, /rota/)
  // en el calendar pero no en la agenda
  assert.equal(byName['SIN AGENDA SIMON'].source, 'calendar')
  // en la agenda pero no en el calendar: entra al checklist igual
  assert.equal(byName['SOLO AGENDA SARA'].source, 'agenda')
  assert.deepEqual(res.excluded.map((x) => [x.row.name, x.reason]), [['SUSPENDIDO SOL', 'suspended']])
  // el evento ilegible va en `problems` (para poder reconocerlo), no entre los avisos generales
  assert.equal(res.problems.length, 1)
  assert.equal(res.warnings.length, 0)
})

test('mergeChecklist: sin calendar en esas fechas usa la fecha de la agenda', () => {
  const res = mergeChecklist({ agenda: parseAgenda(agendaCsv), events: [], problems: [], from: '2026-10-12', to: '2026-10-18' })
  assert.equal(res.rows.length, 4)
  assert.equal(res.calendarCovers, false)
})

test('ningún campo se completa solo: el horario queda vacío hasta que se escribe, aunque falte la duración', () => {
  const res = mergeChecklist({ agenda: parseAgenda(agendaCsv), events: [], problems: [], from: '2026-10-13', to: '2026-10-14' })
  assert.ok(res.rows.length >= 3)
  assert.ok(res.rows.every((r) => r.time === '' && r.prequi === '' && r.quirofano === ''))
  const withEmptyDuration = res.rows.map((r) => ({ ...r, duration: '' }))
  const lines = sheetTsv(withEmptyDuration).split('\n').map((l) => l.split('\t'))
  assert.ok(lines.slice(2).filter((l) => l[1]).every((l) => l[3] === '' && l[4] === ''))
})

test('sortRows: respeta el orden elegido y deja las filas nuevas al final', () => {
  const res = mergeChecklist({ agenda: parseAgenda(agendaCsv), events: [], problems: [], from: '2026-10-13', to: '2026-10-13' })
  const [a, b] = res.rows
  assert.deepEqual(sortRows(res.rows, { '2026-10-13': [b.key, a.key] }).map((r) => r.key), [b.key, a.key])
  assert.deepEqual(sortRows(res.rows, { '2026-10-13': [b.key] }).map((r) => r.key), [b.key, a.key])
})

test('sheetTsv: formato de la planilla, días del último al primero', () => {
  const res = mergeChecklist({ agenda: parseAgenda(agendaCsv), events: [], problems: [], from: '2026-10-13', to: '2026-10-14' })
  const lines = sheetTsv(res.rows).split('\n').map((l) => l.split('\t'))
  assert.equal(lines[0][19], 'QUIROFANO')
  assert.equal(lines[1][5], 'MIERCOLES')
  assert.equal(lines[1][15], 'PREQUI')
  assert.equal(lines.at(-3)![5], 'MARTES')
  assert.ok(lines.every((l) => l.length === 21))
})

test('calendar real: la HC de la descripción cruza aunque el nombre esté mal escrito, y el formato viejo se entiende', () => {
  const agenda = parseAgenda(
    [
      HEADER,
      '1/09/2026 10:00:00,13/10/2026,PEREZ JUAN CARLOS,100/00,60,CATARATA,DIAZ,LUNA,DERECHO,-,1111,LIO,+21.00,LOCAL + APOYO,No,,70,123,',
      '2/09/2026 10:00:00,13/10/2026,PEREZ JUAN CARLOS,101/00,60,CATARATA,DIAZ,LUNA,DERECHO,-,2222,LIO,+20.00,LOCAL + APOYO,No,,70,123,',
    ].join('\n'),
  )
  const raw = [
    ...parseIcs(ics('AGENDA', [['20261013', 'CATARATA / PEREZ J / DIAZ / LUNA', 'DERECHO / +20.00 / 101/00 / 2222']])),
    // la misma cirugía cargada también en el otro calendario, con el formato viejo
    ...parseIcs(ics('AGENDA QUIRURGICA', [['20261013', 'CATARATA / DIAZ', 'OD / PEREZ JUAN CARLOS / 101/00 / 2222']])),
  ]
  const { events } = classifyEvents(raw)
  assert.equal(events.length, 2)
  assert.equal(events[1].name, 'PEREZ JUAN CARLOS')
  const res = mergeChecklist({ agenda, events, problems: [], from: '2026-10-12', to: '2026-10-18' })
  // la fila de la agenda que no se cruzó (100/00) entra igual, solo de la agenda
  assert.deepEqual(res.rows.map((r) => [r.hc, r.source]), [['101/00', 'both'], ['100/00', 'agenda']])
  assert.equal(res.rows[0].diopters, '+20.00')
  assert.equal(res.rows[0].warning, undefined)
  assert.deepEqual(res.excluded, [])
})

test('ningún evento sin formato se pierde: con algo de cirugía (palabra, HC, teléfono, ojo) avisa fuerte y el resto queda en la lista', () => {
  const titles = [
    'CATARAT BROCHARD ORTELLADO',
    'BLANCO ANICETO EECC BROCHARD / DIB',
    'PAZ ELENA - 164700/00 - Basocelular - ANESTESIA GENERAL',
    'Ramon Diaz FO 1128000000',
    'SOSA ANA - TRIAMCINOLONA SUBTENON OJO DERECHO',
    'Lia Ruiz Chala, granu',
    'VACACIONES',
  ]
  const raw = [...parseIcs(ics('AGENDA', titles.map((t) => ['20261014', t]))), ...parseIcs(ics('SUSPENSION QUIRURGICA', [['20261014', 'GIMENEZ']]))]
  const { events, problems } = classifyEvents(raw)
  assert.equal(events.length, 0)
  assert.deepEqual(problems.map((p) => [p.title, p.strong]), [...titles.map((t, i) => [t, i < 5]), ['GIMENEZ', true]])
})

test('un evento cancelado o de un calendario que no es de cirugías sigue afuera', () => {
  const raw = parseIcs(ics('Feriados en Argentina', [['20261014', 'FERIADO']]))
  assert.deepEqual(classifyEvents(raw).problems, [])
})

test('una fila de la agenda sin nombre ni HC pero con datos entra igual, aunque haya dos iguales ese día', () => {
  const agenda = parseAgenda(
    [HEADER, '4/08/2026 10:04:32,11/08/2026,-,-,90,PLASTICA OCULAR PTERIGION,RECALDE,MATA,,,,,,,,,,,', '4/08/2026 10:06:00,11/08/2026,-,-,90,PLASTICA OCULAR PTERIGION,RECALDE,MATA,,,,,,,,,,,', '12/08/2024,,,,,,,,,,,,,,,,,,'].join('\n'),
  )
  const res = mergeChecklist({ agenda, events: [], problems: [], from: '2026-08-10', to: '2026-08-16' })
  assert.deepEqual(res.rows.map((r) => [r.surgery, r.line]), [['PLASTICA OCULAR PTERIGION', 2], ['PLASTICA OCULAR PTERIGION', 3]])
})

test('de una fila de la agenda de otra fecha se toman solo los datos de la persona: el ojo y las dioptrías pueden ser de otra cirugía', () => {
  const agenda = parseAgenda([HEADER, '1/05/2026 10:00:00,15/05/2026,PEREZ JUAN,100/00,60,CATARATA,DIAZ,LUNA,DERECHO,ESPOSA,1111,LIO,+21.00,LOCAL + APOYO,No,GANCHOS,70,123,'].join('\n'))
  const { events } = classifyEvents(parseIcs(ics('AGENDA', [['20260902', 'CATARATA / PEREZ JUAN / ROLLAN / BELU']])))
  const [row] = mergeChecklist({ agenda, events, problems: [], from: '2026-08-31', to: '2026-09-06' }).rows
  const { name, hc, phone, contact, dni, surgery, surgeon, assistant, eye, diopters, duration, anesthesia, notes } = row
  assert.deepEqual(
    { name, hc, phone, contact, dni, surgery, surgeon, assistant, eye, diopters, duration, anesthesia, notes },
    { name: 'PEREZ JUAN', hc: '100/00', phone: '1111', contact: 'ESPOSA', dni: '123', surgery: 'CATARATA', surgeon: 'ROLLAN', assistant: 'BELU', eye: '', diopters: '', duration: '', anesthesia: '', notes: '' },
  )
  assert.match(row.warning!, /15\/05\/2026/)
  assert.equal(row.origin?.agenda?.line, 2)
})

test('un nombre de una sola palabra ("SD") no cruza con una fila de la agenda de otra fecha', () => {
  const agenda = parseAgenda([HEADER, '26/03/2026 16:40:10,12/06/2026,sd,-,30,ANTIANGIOGENICO,-,-,DERECHO,-,-,LIO,,LOCAL + APOYO,SI,,,-,'].join('\n'))
  const { events } = classifyEvents(parseIcs(ics('AGENDA', [['20261106', 'GLAUCOMA I STENT / SD / IZQUIERDO']])))
  const res = mergeChecklist({ agenda, events, problems: [], from: '2026-11-02', to: '2026-11-08' })
  assert.deepEqual(res.rows.map((r) => [r.source, r.surgery, r.duration]), [['calendar', 'GLAUCOMA I STENT', '']])
})
