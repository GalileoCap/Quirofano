import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAgenda } from '../src/agenda.ts'
import { applyEdits } from '../src/checklist.ts'
import { classifyEvents, parseIcs } from '../src/ics.ts'
import { mergeChecklist } from '../src/merge.ts'
import { elsewhereDates, FILTER_LABELS, FILTERS, flagNotes, inFilter, itemsOf, rowFlags } from '../src/overview.ts'
import type { Presence } from '../src/overview.ts'
import type { AgendaRow, CalEvent, Excluded, Fields, Row, Source } from '../src/types.ts'

// Datos inventados: nunca poner pacientes reales en el repo

const EMPTY: Fields = {
  name: '',
  hc: '',
  duration: '',
  time: '',
  surgery: '',
  surgeon: '',
  assistant: '',
  eye: '',
  contact: '',
  phone: '',
  diopters: '',
  anesthesia: '',
  notes: '',
  dni: '',
  prequi: '',
  hcCheck: '',
  extra: '',
  quirofano: '',
  quiroDia: '',
}

// Una fila con todos los datos obligatorios, para que no aparezcan avisos de "Falta" que no vienen al caso
const mk = (date: string, hc: string, source: Source, over: Partial<Row> = {}): Row => {
  const base: Row = {
    ...EMPTY,
    name: `PACIENTE ${hc}`,
    hc,
    duration: '45',
    surgery: 'CATARATA',
    surgeon: 'DIAZ',
    eye: 'DERECHO',
    key: '',
    date,
    source,
    ...over,
  }
  return { ...base, key: over.key ?? `${base.date}|${base.name}|${base.hc}|${source}` }
}

const exc = (row: Row, reason: Excluded['reason']): Excluded => ({ row, reason })
const asObject = (m: Map<string, string[]>) => Object.fromEntries(m)

const agendaRow = (date: string | null): AgendaRow => ({
  line: 2,
  stamp: null,
  date,
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
})

const calEvent = (date: string): CalEvent => ({
  date,
  title: 'CATARATA / PACIENTE 1/00 / DIAZ',
  calendar: 'AGENDA',
  kind: 'surgery',
  surgery: 'CATARATA',
  name: 'PACIENTE 1/00',
  surgeon: 'DIAZ',
  assistant: '',
  eye: 'DERECHO',
  diopters: '',
  hc: '1/00',
  phone: '',
  description: '',
})

// Una fila cruzada: la agenda la tiene en `agendaDate` y el calendar en `calDate`
const both = (agendaDate: string | null, calDate: string): Row =>
  mk(calDate, '1/00', 'both', { origin: { agenda: agendaRow(agendaDate), event: calEvent(calDate), by: 'hc', fields: {} } })

// Una fila que está en una sola fuente; `missingIn` es la que no la tiene (y cubre esa fecha)
const only = (date: string, hc: string, missingIn: 'agenda' | 'calendar', over: Partial<Row> = {}): Row =>
  mk(date, hc, missingIn === 'calendar' ? 'agenda' : 'calendar', {
    origin: { ...(missingIn === 'calendar' ? { agenda: agendaRow(date) } : { event: calEvent(date) }), fields: {}, missing: missingIn },
    ...over,
  })

const con = (row: Row, excluded: Excluded['reason'] | undefined, dates: string[]) => flagNotes(rowFlags(row, excluded, dates))[0]?.text
const presenceOf =(row: Row, excluded?: Excluded['reason']): Presence | undefined => rowFlags(row, excluded).presence

// Misma semana que tests/overview.test.ts, pasada por el cruce real
const HEADER = 'Marca temporal,Marca temporal,APELLIDO Y  NOMBRE  ,OBRA SOCIAL,DURACION,CIRUGIA,CIRUJANO,AYUDANTE,,JERARQUIA,TELEFONO DE CONTACTO,INSUMO A UTILIZAR,DIOPTRIAS,ANESTESIA,PEDIDO B,OBSERVACIONES,EDAD,DNI,'
const agendaCsv = [
  HEADER,
  '1/09/2026 10:00:00,13/10/2026,PEREZ JUAN,100/00,60 min,CATARATA,DIAZ,LUNA,DERECHO,ESPOSA,1111,LIO,.,LOCAL,No,,70,123,',
  '3/09/2026 10:00:00,13/10/2026,GOMEZ ANA,200/00,30,ANTIANGIOGENICO,DIAZ,.,IZQUIERDO,-,2222,,,LOCAL,No,,.,.,',
  '4/09/2026 10:00:00,13/10/2026,LOPEZ RITA,300/00,45,CATARATA,MATA,.,DERECHO,-,3333,,,LOCAL,No,,.,.,',
  '5/09/2026 10:00:00,14/10/2026,RAMOS EVA,400/00,45,CATARATA,MATA,.,DERECHO,-,4444,,,LOCAL,No,,.,.,',
].join('\n')

const ics = (events: [string, string, string?][]) =>
  [
    'BEGIN:VCALENDAR',
    'X-WR-CALNAME:AGENDA',
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

const week = () => {
  const { events, problems } = classifyEvents(
    parseIcs(
      ics([
        ['20261013', 'CATARATA / PEREZ JUAN / DIAZ / LUNA', 'DERECHO / +21.00 / 100/00 / 1111'],
        // el calendar dice otro cirujano que la agenda
        ['20261013', 'ANTIANGIOGENICO / GOMEZ ANA / MATA / -', 'IZQUIERDO / / 200/00 / 2222'],
        // la agenda la tiene el 13 y el calendar el 15
        ['20261015', 'CATARATA / LOPEZ RITA / MATA / -', 'DERECHO / / 300/00 / 3333'],
        ['20261013', 'CATARATA / SIN AGENDA SIMON / DIAZ / -'],
      ]),
    ),
  )
  return mergeChecklist({ agenda: parseAgenda(agendaCsv), events, problems, from: '2026-10-12', to: '2026-10-18' })
}
const find = (rows: Row[], name: string) => rows.find((r) => r.name === name)!

// presence

test('la presencia: a mano sobra, y con fechas iguales no hay presencia', () => {
  assert.deepEqual(presenceOf(mk('2026-10-14', '1/00', 'manual')), { kind: 'extra' })
  assert.equal(presenceOf(both('2026-10-15', '2026-10-15')), undefined)
})

test('estar en una sola fuente es una diferencia solo si la otra fuente cubre esa fecha', () => {
  assert.deepEqual(presenceOf(only('2026-10-14', '1/00', 'calendar')), { kind: 'only', missingIn: 'calendar' })
  assert.deepEqual(presenceOf(only('2026-10-14', '1/00', 'agenda')), { kind: 'only', missingIn: 'agenda' })
  // sin calendar cargado para esas fechas, que la agenda sea la única fuente no es una diferencia
  assert.equal(presenceOf(mk('2026-10-14', '1/00', 'agenda', { origin: { agenda: agendaRow('2026-10-14'), fields: {} } })), undefined)
})

test('una fila cruzada con la agenda y el calendar en días distintos es de fecha, y una fecha ilegible de la agenda queda en null', () => {
  assert.deepEqual(presenceOf(both('2026-10-13', '2026-10-15')), { kind: 'date', agenda: '2026-10-13', calendar: '2026-10-15' })
  assert.deepEqual(presenceOf(both(null, '2026-10-15')), { kind: 'date', agenda: null, calendar: '2026-10-15' })
})

test('lo excluido gana sobre la fuente de la fila, y cada motivo da su presencia', () => {
  assert.deepEqual(presenceOf(mk('2026-10-14', '1/00', 'manual'), 'removed'), { kind: 'removed' })
  assert.deepEqual(presenceOf(both('2026-10-13', '2026-10-15'), 'removed'), { kind: 'removed' })
  assert.deepEqual(presenceOf(mk('2026-10-14', '1/00', 'calendar'), 'suspended'), { kind: 'suspended' })
})

test('rowFlags anota en elsewhere las fechas que le pasan, y por defecto va vacío', () => {
  const row = mk('2026-10-14', '1/00', 'manual')
  assert.deepEqual(rowFlags(row).elsewhere, [])
  assert.deepEqual(rowFlags(row, undefined, ['2026-10-16']).elsewhere, ['2026-10-16'])
})

// elsewhereDates

test('una cirugía movida de día une los dos lados: la que sobra apunta a la que falta y al revés', () => {
  const sobra = mk('2026-10-14', '5/00', 'manual')
  const falta = mk('2026-10-16', '5/00', 'agenda')
  assert.deepEqual(asObject(elsewhereDates([sobra], [exc(falta, 'removed')])), {
    [sobra.key]: ['2026-10-16'],
    [falta.key]: ['2026-10-14'],
  })
})

test('una fila que está en una sola fuente en otro día también queda unida con la que se escribió a mano', () => {
  const sobra = mk('2026-10-14', '5/00', 'manual')
  const soloAgenda = only('2026-10-16', '5/00', 'calendar')
  assert.deepEqual(asObject(elsewhereDates([sobra, soloAgenda], [])), {
    [sobra.key]: ['2026-10-16'],
    [soloAgenda.key]: ['2026-10-14'],
  })
})

test('la misma persona con dos cirugías reales en días distintos no se marca como movida, ni una fila a mano sola', () => {
  const rows = [mk('2026-10-13', '6/00', 'both'), mk('2026-10-15', '6/00', 'both'), mk('2026-10-14', '7/00', 'manual')]
  const excluded = [exc(mk('2026-10-17', '6/00', 'agenda'), 'removed')]
  assert.equal(elsewhereDates(rows, excluded).size, 0)
})

test('una suspendida no cuenta para unir los lados, pero una sacada a mano de la misma persona sí', () => {
  const sobra = mk('2026-10-14', '8/00', 'manual')
  const suspendida = mk('2026-10-16', '8/00', 'calendar')
  assert.equal(elsewhereDates([sobra], [exc(suspendida, 'suspended')]).size, 0)
  const sacada = mk('2026-10-17', '8/00', 'agenda')
  assert.deepEqual(asObject(elsewhereDates([sobra], [exc(suspendida, 'suspended'), exc(sacada, 'removed')])), {
    [sobra.key]: ['2026-10-17'],
    [sacada.key]: ['2026-10-14'],
  })
})

test('si a alguna de las dos filas le falta la HC se compara el nombre sin importar mayúsculas ni espacios, pero con las dos HC manda la HC', () => {
  const sinHc = mk('2026-10-14', '', 'manual', { name: ' paz  luis ' })
  const otraSinHc = mk('2026-10-16', '', 'agenda', { name: 'PAZ LUIS' })
  assert.deepEqual(asObject(elsewhereDates([sinHc], [exc(otraSinHc, 'removed')])), { [sinHc.key]: ['2026-10-16'], [otraSinHc.key]: ['2026-10-14'] })
  // solo una tiene HC: igual se compara el nombre
  const conHc = mk('2026-10-16', '9/00', 'agenda', { name: 'PAZ LUIS' })
  assert.deepEqual(asObject(elsewhereDates([sinHc], [exc(conHc, 'removed')])), { [sinHc.key]: ['2026-10-16'], [conHc.key]: ['2026-10-14'] })
  // las dos tienen HC y son distintas: el nombre igual no las junta
  const manual = mk('2026-10-14', '1/00', 'manual', { name: 'PAZ LUIS' })
  const otra = mk('2026-10-16', '2/00', 'agenda', { name: 'PAZ LUIS' })
  assert.equal(elsewhereDates([manual], [exc(otra, 'removed')]).size, 0)
})

test('la HC coincide aunque cambien las mayúsculas o los espacios, aunque los nombres no se parezcan', () => {
  const sobra = mk('2026-10-14', ' 12/00a ', 'manual', { name: 'UNO' })
  for (const hc of ['12/00A', '12 / 00 a']) {
    const falta = mk('2026-10-16', hc, 'agenda', { name: 'OTRO NOMBRE' })
    assert.deepEqual(elsewhereDates([sobra], [exc(falta, 'removed')]).get(sobra.key), ['2026-10-16'])
  }
})

test('las fechas salen ordenadas, sin repetir y sin el propio día, y la que falta solo recibe las de filas a mano', () => {
  const sobra = mk('2026-10-14', '10/00', 'manual')
  const rows = [sobra, mk('2026-10-16', '10/00', 'both'), mk('2026-10-14', '10/00', 'both')]
  const falta17 = mk('2026-10-17', '10/00', 'agenda')
  const falta16 = mk('2026-10-16', '10/00', 'agenda', { key: 'otra-clave-16' })
  const map = elsewhereDates(rows, [exc(falta17, 'removed'), exc(falta16, 'removed')])
  assert.deepEqual(map.get(sobra.key), ['2026-10-16', '2026-10-17'])
  assert.deepEqual(map.get(falta17.key), ['2026-10-14'])
})

// flagNotes

test('cada presencia tiene su texto, y es la primera nota', () => {
  const casos: [string, ReturnType<typeof rowFlags>, string][] = [
    ['extra', rowFlags(mk('2026-10-14', '1/00', 'manual')), 'Sobra: no está en la agenda ni en el calendar'],
    ['removed', rowFlags(mk('2026-10-14', '1/00', 'agenda'), 'removed'), 'Falta: la sacaste a mano'],
    ['only agenda', rowFlags(only('2026-10-14', '1/00', 'calendar')), 'Está en la agenda pero no en el calendar'],
    ['only calendar', rowFlags(only('2026-10-14', '1/00', 'agenda')), 'Está en el calendar pero no en la agenda'],
    ['suspended', rowFlags(mk('2026-10-14', '1/00', 'calendar'), 'suspended'), 'Suspendida en el calendar'],
    ['date', rowFlags(both('2026-10-13', '2026-10-15')), 'Otro día: la agenda dice 13/10, el calendar 15/10'],
    ['date sin agenda', rowFlags(both(null, '2026-10-15')), 'Otro día: la agenda tiene la fecha ilegible, el calendar 15/10'],
  ]
  for (const [nombre, flags, texto] of casos) {
    const [primera] = flagNotes(flags)
    assert.deepEqual([nombre, primera?.kind, primera?.text], [nombre, 'presence', texto])
  }
})

test('las fechas de otros días se agregan al texto de lo que sobra y de lo que falta, y a nada más', () => {
  const manual = mk('2026-10-14', '1/00', 'manual')
  assert.equal(con(manual, undefined, ['2026-10-16']), 'Sobra: no está en la agenda ni en el calendar · las fuentes la tienen el 16/10')
  assert.equal(con(manual, undefined, ['2026-10-16', '2026-10-17']), 'Sobra: no está en la agenda ni en el calendar · las fuentes la tienen el 16/10, 17/10')
  const agenda = mk('2026-10-16', '1/00', 'agenda')
  assert.equal(con(agenda, 'removed', ['2026-10-14']), 'Falta: la sacaste a mano · en el checklist está el 14/10')
  assert.equal(con(only('2026-10-16', '1/00', 'calendar'), undefined, ['2026-10-14']), 'Está en la agenda pero no en el calendar · a mano está el 14/10')
  // en los otros tipos no agrega nada
  assert.equal(con(agenda, undefined, ['2026-10-14']), undefined)
  assert.equal(con(agenda, 'suspended', ['2026-10-14']), 'Suspendida en el calendar')
  assert.equal(con(both('2026-10-13', '2026-10-15'), undefined, ['2026-10-14']), 'Otro día: la agenda dice 13/10, el calendar 15/10')
})

test('la nota de agenda ≠ calendar no menciona la fecha: sola no hay nota, y con campos lista solo los campos', () => {
  const { rows } = week()
  const lopez = find(rows, 'LOPEZ RITA')
  // el cruce real: la agenda y el calendar dicen solo el día distinto
  assert.deepEqual(flagNotes(rowFlags(lopez)).map((n) => n.text), ['Otro día: la agenda dice 13/10, el calendar 15/10'])
  assert.equal(flagNotes(rowFlags(lopez)).some((n) => n.kind === 'sources'), false)
  const gomez = find(rows, 'GOMEZ ANA')
  assert.deepEqual(flagNotes({ ...rowFlags(gomez), sources: ['date', 'surgeon'] }).map((n) => n.text), ['Agenda ≠ calendar: Cirujano'])
})

test('con presencia y otras diferencias, la presencia va primero y las demás notas siguen como siempre', () => {
  const { rows } = week()
  const lopez = find(rows, 'LOPEZ RITA')
  const [editada] = applyEdits(rows, { [lopez.key]: { eye: 'IZQUIERDO', anesthesia: 'GENERAL' } }, { [lopez.key]: { anesthesia: lopez.anesthesia } }).filter((r) => r.name === 'LOPEZ RITA')
  const notes = flagNotes(rowFlags(editada))
  assert.deepEqual(notes.map((n) => n.kind), ['presence', 'confirm', 'edited'])
  assert.deepEqual(notes.map((n) => n.text), ['Otro día: la agenda dice 13/10, el calendar 15/10', 'Sin confirmar: Ojo', 'Editado: Anestesia'])
  // lo faltante se sigue avisando en las filas incluidas, después de la presencia
  const simon = find(rows, 'SIN AGENDA SIMON')
  assert.deepEqual(flagNotes(rowFlags(simon)).map((n) => n.text), ['Está en el calendar pero no en la agenda', 'Falta: HC, Ojo, Duración'])
})

// filtros

test('hay un filtro nuevo de fecha o presencia, antes de los de siempre', () => {
  assert.deepEqual([...FILTERS], ['all', 'presence', 'confirm', 'sources', 'edited', 'missing', 'pending'])
  assert.equal(FILTER_LABELS.presence, 'Fecha o presencia')
})

test('el filtro de presencia deja pasar lo que sobra, lo que falta y lo de otro día, y no lo que está en una sola fuente', () => {
  const { rows } = week()
  const names = rows.filter((r) => inFilter(rowFlags(r), 'presence')).map((r) => r.name).toSorted()
  // lo que está en una sola fuente (con la otra cubriendo la fecha) también es de presencia
  assert.deepEqual(names, ['LOPEZ RITA', 'RAMOS EVA', 'SIN AGENDA SIMON'])
  assert.equal(inFilter(rowFlags(find(rows, 'PEREZ JUAN'), 'removed'), 'presence'), true)
  assert.equal(inFilter(rowFlags(find(rows, 'PEREZ JUAN')), 'presence'), false)
})

test('el filtro agenda ≠ calendar queda para campos distintos: ni la fecha sola ni una sola fuente', () => {
  const { rows } = week()
  const names = rows.filter((r) => inFilter(rowFlags(r), 'sources')).map((r) => r.name).toSorted()
  assert.deepEqual(names, ['GOMEZ ANA'])
  // la fecha más un campo distinto sí cuenta
  assert.equal(inFilter({ ...rowFlags(find(rows, 'GOMEZ ANA')), sources: ['date', 'surgeon'] }, 'sources'), true)
  assert.equal(inFilter({ ...rowFlags(find(rows, 'GOMEZ ANA')), sources: ['date'] }, 'sources'), false)
})

test('el filtro de editadas queda para campos corregidos: no entran las agregadas a mano ni las sacadas', () => {
  const { rows } = week()
  const perez = find(rows, 'PEREZ JUAN')
  const out = applyEdits(rows, { [perez.key]: { eye: 'IZQUIERDO' } }, { [perez.key]: { eye: 'DERECHO' } })
  assert.deepEqual(out.filter((r) => inFilter(rowFlags(r), 'edited')).map((r) => r.name), ['PEREZ JUAN'])
  assert.equal(inFilter(rowFlags({ ...find(rows, 'SIN AGENDA SIMON'), source: 'manual' }), 'edited'), false)
  assert.equal(inFilter(rowFlags(perez, 'removed'), 'edited'), false)
})

// itemsOf (la unión que usan las vistas)

test('itemsOf marca cada fila con su presencia y le pasa el otro día: la cirugía movida queda unida de los dos lados', () => {
  const sobra = mk('2026-10-14', '9/00', 'manual', { key: 'a' })
  const falta = mk('2026-10-16', '9/00', 'agenda', { key: 'b' })
  const items = itemsOf([sobra], [exc(falta, 'removed')])
  assert.deepEqual(
    items.map((i) => [i.row.key, i.flags.presence?.kind, i.flags.elsewhere]),
    [
      ['a', 'extra', ['2026-10-16']],
      ['b', 'removed', ['2026-10-14']],
    ],
  )
})
