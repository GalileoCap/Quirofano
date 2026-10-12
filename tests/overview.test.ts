import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAgenda } from '../src/agenda.ts'
import { applyEdits } from '../src/checklist.ts'
import { classifyEvents, parseIcs } from '../src/ics.ts'
import { mergeChecklist } from '../src/merge.ts'
import { flagNotes, inFilter, rowFlags } from '../src/overview.ts'
import type { Row } from '../src/types.ts'

// Datos inventados: nunca poner pacientes reales en el repo
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

test('una fila donde la agenda y el calendar coinciden no tiene diferencias, y lo que falta a mano se ve aparte', () => {
  const f = rowFlags(find(week().rows, 'PEREZ JUAN'))
  assert.deepEqual([f.sources, f.confirm, f.edited, f.missing, f.presence, f.warning], [[], [], [], [], undefined, false])
  // el horario, el prequi y la HC se escriben a mano: al principio están todos sin completar
  assert.deepEqual(f.pending, ['time', 'prequi', 'hcCheck'])
})

test('agenda y calendar que dicen cosas distintas en un campo, o en la fecha, se marcan', () => {
  const { rows } = week()
  assert.deepEqual(rowFlags(find(rows, 'GOMEZ ANA')).sources, ['surgeon'])
  assert.deepEqual(rowFlags(find(rows, 'LOPEZ RITA')).sources, ['date'])
})

test('una fila que está en una sola fuente lo dice, y lo que no tiene se marca como faltante', () => {
  const f = rowFlags(find(week().rows, 'SIN AGENDA SIMON'))
  assert.deepEqual(f.presence, { kind: 'only', missingIn: 'agenda' })
  assert.deepEqual(f.missing.toSorted(), ['duration', 'eye', 'hc'])
  assert.deepEqual(rowFlags({ ...find(week().rows, 'SIN AGENDA SIMON'), source: 'manual' }).presence, { kind: 'extra' })
})

test('lo escrito a mano que difiere de las fuentes se marca como editado, y como por confirmar si nadie lo confirmó', () => {
  const { rows } = week()
  const perez = find(rows, 'PEREZ JUAN')
  const gomez = find(rows, 'GOMEZ ANA')
  const out = applyEdits(
    rows,
    { [perez.key]: { eye: 'IZQUIERDO', time: '8:30' }, [gomez.key]: { eye: 'DERECHO' } },
    // Perez: ya se confirmó contra lo que decían las fuentes; Gomez: edición vieja, sin confirmar
    { [perez.key]: { eye: 'DERECHO' } },
  )
  const fp = rowFlags(find(out, 'PEREZ JUAN'))
  assert.deepEqual([fp.edited, fp.confirm], [['eye'], []])
  // el horario es una columna a mano: escribirlo no es una diferencia, solo deja de estar pendiente
  assert.deepEqual(fp.pending, ['prequi', 'hcCheck'])
  const fg = rowFlags(find(out, 'GOMEZ ANA'))
  assert.deepEqual([fg.edited, fg.confirm], [['eye'], ['eye']])
})

test('lo que se escribe a mano para completar un dato faltante lo saca de faltantes', () => {
  const { rows } = week()
  const simon = find(rows, 'SIN AGENDA SIMON')
  const out = applyEdits(rows, { [simon.key]: { hc: '999/00', duration: '30', eye: 'DERECHO' } })
  assert.deepEqual(rowFlags(find(out, 'SIN AGENDA SIMON')).missing, [])
})

test('cada filtro deja pasar a las filas que corresponden', () => {
  const { rows } = week()
  const names = (filter: Parameters<typeof inFilter>[1]) => rows.filter((r) => inFilter(rowFlags(r), filter)).map((r) => r.name).toSorted()
  assert.deepEqual(names('all'), ['GOMEZ ANA', 'LOPEZ RITA', 'PEREZ JUAN', 'RAMOS EVA', 'SIN AGENDA SIMON'])
  // "Agenda ≠ calendar" es solo de campos; que esté en otro día o en una sola fuente es de fecha o presencia
  assert.deepEqual(names('sources'), ['GOMEZ ANA'])
  assert.deepEqual(names('presence'), ['LOPEZ RITA', 'RAMOS EVA', 'SIN AGENDA SIMON'])
  assert.deepEqual(names('missing'), ['SIN AGENDA SIMON'])
  assert.deepEqual(names('confirm'), [])
})

test('lo que está en la agenda y no en el calendar entra al checklist como una diferencia de presencia, y lo sacado a mano también', () => {
  const { rows, excluded } = week()
  assert.deepEqual(excluded, [])
  const ramos = rowFlags(find(rows, 'RAMOS EVA'))
  assert.deepEqual(ramos.presence, { kind: 'only', missingIn: 'calendar' })
  assert.deepEqual([inFilter(ramos, 'presence'), inFilter(ramos, 'sources'), inFilter(ramos, 'missing')], [true, false, false])
  assert.deepEqual(rowFlags(find(rows, 'SIN AGENDA SIMON')).presence, { kind: 'only', missingIn: 'agenda' })
  const sacada = rowFlags(find(week().rows, 'PEREZ JUAN'), 'removed')
  assert.deepEqual([inFilter(sacada, 'presence'), inFilter(sacada, 'edited')], [true, false])
})

test('los textos de las marcas no repiten como editado lo que ya figura por confirmar, y lo faltante solo se avisa en filas incluidas', () => {
  const { rows } = week()
  const gomez = find(rows, 'GOMEZ ANA')
  const [edited] = applyEdits(rows, { [gomez.key]: { eye: 'DERECHO', anesthesia: 'GENERAL' } }, { [gomez.key]: { anesthesia: gomez.anesthesia } }).filter((r) => r.name === 'GOMEZ ANA')
  assert.deepEqual(flagNotes(rowFlags(edited)).map((n) => n.text), ['Sin confirmar: Ojo', 'Agenda ≠ calendar: Cirujano', 'Editado: Anestesia'])
  const simon = find(rows, 'SIN AGENDA SIMON')
  assert.deepEqual(flagNotes(rowFlags(simon)).map((n) => n.text), ['Está en el calendar pero no en la agenda', 'Falta: HC, Ojo, Duración'])
  assert.deepEqual(flagNotes(rowFlags(simon, 'removed')).map((n) => n.text), ['Falta: la sacaste a mano'])
})
