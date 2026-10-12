import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAgenda } from '../src/agenda.ts'
import { applyEdits } from '../src/checklist.ts'
import { classifyEvents, parseIcs } from '../src/ics.ts'
import { mergeChecklist } from '../src/merge.ts'
import { flagNotes, inFilter, itemsOf, rowFlags } from '../src/overview.ts'
import { findOrphans } from '../src/review.ts'
import { useStore } from '../src/store.ts'
import { FIELDS, type AgendaRow, type CalEvent, type Excluded, type Fields, type Row, type Source } from '../src/types.ts'

// Datos inventados: nunca poner pacientes reales en el repo

// el store guarda en localStorage, que Node no trae
const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) },
})

const EMPTY = Object.fromEntries(FIELDS.map((f) => [f, ''])) as Fields

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

// Una fila cruzada con clave fija: la agenda la tiene en `agendaDate` y el calendar en `calDate`
const both = (agendaDate: string | null, calDate: string): Row => ({
  ...mk(calDate, '1/00', 'both', { origin: { agenda: agendaRow(agendaDate), event: calEvent(calDate), by: 'hc', fields: {} } }),
  key: 'k1',
})

const withAgenda = (row: Row, over: Partial<AgendaRow>): Row => ({ ...row, origin: { ...row.origin!, agenda: { ...row.origin!.agenda!, ...over } } })

const HEADER = 'Marca temporal,Marca temporal,APELLIDO Y  NOMBRE  ,OBRA SOCIAL,DURACION,CIRUGIA,CIRUJANO,AYUDANTE,,JERARQUIA,TELEFONO DE CONTACTO,INSUMO A UTILIZAR,DIOPTRIAS,ANESTESIA,PEDIDO B,OBSERVACIONES,EDAD,DNI,'
const GOMEZ = '3/09/2026 10:00:00,13/10/2026,GOMEZ ANA,200/00,30,ANTIANGIOGENICO,DIAZ,.,IZQUIERDO,-,2222,,,LOCAL,No,,.,.,'
const agendaCsv = (gomez = GOMEZ) =>
  [
    HEADER,
    '1/09/2026 10:00:00,13/10/2026,PEREZ JUAN,100/00,60 min,CATARATA,DIAZ,LUNA,DERECHO,ESPOSA,1111,LIO,.,LOCAL,No,,70,123,',
    gomez,
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

// Gomez: la agenda dice DIAZ y el calendar MATA. Lopez: la agenda la tiene el 13 y el calendar el 15.
const week = (csv = agendaCsv()) => {
  const { events, problems } = classifyEvents(
    parseIcs(
      ics([
        ['20261013', 'CATARATA / PEREZ JUAN / DIAZ / LUNA', 'DERECHO / +21.00 / 100/00 / 1111'],
        ['20261013', 'ANTIANGIOGENICO / GOMEZ ANA / MATA / -', 'IZQUIERDO / / 200/00 / 2222'],
        ['20261015', 'CATARATA / LOPEZ RITA / MATA / -', 'DERECHO / / 300/00 / 3333'],
        ['20261013', 'CATARATA / SIN AGENDA SIMON / DIAZ / -'],
      ]),
    ),
  )
  return mergeChecklist({ agenda: parseAgenda(csv), events, problems, from: '2026-10-12', to: '2026-10-18' })
}
const find = (rows: Row[], name: string) => rows.find((r) => r.name === name)!

// una fila reconocida: se le pasa la huella que ella misma tiene
const acked = (row: Row, excluded?: Excluded['reason'], elsewhere: string[] = []) => {
  const signature = rowFlags(row, excluded, elsewhere).signature
  assert.notEqual(signature, null)
  return rowFlags(row, excluded, elsewhere, signature!)
}

// fecha o presencia

test('una fila con la fecha distinta en las dos fuentes avisa; con su huella queda en silencio y conserva lo silenciado; con otra huella vuelve a avisar', () => {
  const row = both('2026-10-13', '2026-10-15')
  const plain = rowFlags(row)
  assert.deepEqual(plain.presence, { kind: 'date', agenda: '2026-10-13', calendar: '2026-10-15' })
  assert.equal(typeof plain.signature, 'string')
  assert.equal(plain.acked, undefined)

  const silenced = rowFlags(row, undefined, [], plain.signature!)
  assert.equal(silenced.presence, undefined)
  assert.deepEqual(silenced.sources, [])
  assert.deepEqual(silenced.acked, { presence: plain.presence, sources: plain.sources })
  // la huella se calcula sobre las diferencias reales, haya o no reconocimiento
  assert.equal(silenced.signature, plain.signature)

  const stale = rowFlags(row, undefined, [], `${plain.signature}-otra`)
  assert.deepEqual(stale.presence, plain.presence)
  assert.deepEqual(stale.sources, plain.sources)
  assert.equal(stale.acked, undefined)
})

test('una fila reconocida sale de los filtros de fecha o presencia y de agenda ≠ calendar, y no trae esas notas', () => {
  const { rows } = week()
  for (const name of ['LOPEZ RITA', 'GOMEZ ANA']) {
    const f = acked(find(rows, name))
    assert.deepEqual([name, inFilter(f, 'presence'), inFilter(f, 'sources')], [name, false, false])
    assert.deepEqual(flagNotes(f).filter((n) => n.kind === 'presence' || n.kind === 'sources'), [])
  }
})

test('si después de reconocerla la fuente cambia (otra fecha en el calendar, otro cirujano en la agenda), el reconocimiento viejo ya no vale y vuelve el aviso', () => {
  const before = both('2026-10-13', '2026-10-15')
  const ack = rowFlags(before).signature!
  assert.equal(rowFlags(before, undefined, [], ack).presence, undefined)

  // misma clave, el calendar la movió al 16
  const movedInCalendar = rowFlags(both('2026-10-13', '2026-10-16'), undefined, [], ack)
  assert.deepEqual(movedInCalendar.presence, { kind: 'date', agenda: '2026-10-13', calendar: '2026-10-16' })
  assert.equal(movedInCalendar.acked, undefined)

  // misma clave, la agenda cambió de cirujano
  const surgeonInAgenda = rowFlags(withAgenda(before, { surgeon: 'PAINO' }), undefined, [], ack)
  assert.equal(surgeonInAgenda.presence?.kind, 'date')
  assert.equal(surgeonInAgenda.acked, undefined)
})

test('reconstruir las filas desde las mismas fuentes da la misma huella y la cirugía sigue reconocida', () => {
  const first = find(week().rows, 'LOPEZ RITA')
  const ack = rowFlags(first).signature!
  const again = find(week().rows, 'LOPEZ RITA')
  assert.equal(rowFlags(again).signature, ack)
  const f = rowFlags(again, undefined, [], ack)
  assert.equal(f.presence, undefined)
  assert.notEqual(f.acked, undefined)
})

// campos de agenda ≠ calendar

test('una diferencia de campo entre la agenda y el calendar se reconoce y deja de figurar; si la agenda cambia ese valor a otro, vuelve', () => {
  const gomez = find(week().rows, 'GOMEZ ANA')
  const plain = rowFlags(gomez)
  assert.deepEqual(plain.sources, ['surgeon'])
  const f = rowFlags(gomez, undefined, [], plain.signature!)
  assert.deepEqual(f.sources, [])
  assert.deepEqual(f.acked, { presence: undefined, sources: ['surgeon'] })

  // la agenda ahora dice otro cirujano, que tampoco es el del calendar
  const changed = find(week(agendaCsv(GOMEZ.replace(',DIAZ,', ',PAINO,'))).rows, 'GOMEZ ANA')
  const back = rowFlags(changed, undefined, [], plain.signature!)
  assert.deepEqual(back.sources, ['surgeon'])
  assert.equal(back.acked, undefined)
})

test('reconocer también silencia el aviso del cruce sobre esa diferencia, pero no el de una fila sin nada que reconocer', () => {
  const { rows } = week()
  const gomez = find(rows, 'GOMEZ ANA')
  assert.equal(rowFlags(gomez).warning, true)
  assert.equal(acked(gomez).warning, false)
  assert.equal(rowFlags(find(week(agendaCsv(GOMEZ.replace(',DIAZ,', ',PAINO,'))).rows, 'GOMEZ ANA'), undefined, [], rowFlags(gomez).signature!).warning, true)

  const sinAgenda = find(rows, 'SIN AGENDA SIMON')
  assert.equal(sinAgenda.warning !== undefined, true)
  assert.equal(rowFlags(sinAgenda, undefined, [], 'cualquiera').warning, true)
})

test('reconocer no oculta lo editado, lo por confirmar, lo que falta ni lo pendiente de la misma fila', () => {
  const { rows } = week()
  const gomez = find(rows, 'GOMEZ ANA')
  const [edited] = applyEdits(rows, { [gomez.key]: { eye: 'DERECHO', anesthesia: 'GENERAL' } }, { [gomez.key]: { anesthesia: gomez.anesthesia } }).filter((r) => r.name === 'GOMEZ ANA')
  const plain = rowFlags(edited)
  const silenced = acked(edited)
  assert.deepEqual(silenced.sources, [])
  assert.deepEqual([silenced.confirm, silenced.edited, silenced.missing, silenced.pending], [plain.confirm, plain.edited, plain.missing, plain.pending])
  assert.deepEqual(plain.confirm, ['eye'])
  assert.equal(inFilter(silenced, 'confirm'), true)
  assert.equal(inFilter(silenced, 'edited'), true)
  assert.deepEqual(flagNotes(silenced).map((n) => n.text), ['Sin confirmar: Ojo', 'Editado: Anestesia'])

  // a mano y con datos faltantes: se silencia la presencia, no lo que falta
  const simon = { ...find(rows, 'SIN AGENDA SIMON'), source: 'manual' as const }
  const manual = acked(simon)
  assert.equal(manual.presence, undefined)
  assert.deepEqual(manual.missing, rowFlags(simon).missing)
  assert.equal(inFilter(manual, 'missing'), true)
  assert.equal(inFilter(manual, 'pending'), true)
})

// a mano, sacadas y suspendidas

test('lo que sobra, lo sacado a mano y lo suspendido se reconocen con su huella, y los otros días forman parte de ella', () => {
  const casos: [string, Row, Excluded['reason'] | undefined][] = [
    ['extra', mk('2026-10-14', '1/00', 'manual'), undefined],
    ['removed', mk('2026-10-16', '1/00', 'agenda'), 'removed'],
    ['suspended', mk('2026-10-16', '1/00', 'calendar'), 'suspended'],
  ]
  for (const [nombre, row, excluded] of casos) {
    const plain = rowFlags(row, excluded)
    assert.equal(typeof plain.signature, 'string', nombre)
    const silenced = rowFlags(row, excluded, [], plain.signature!)
    assert.deepEqual([nombre, silenced.presence, silenced.acked?.presence], [nombre, undefined, plain.presence])

    const elsewhere = ['2026-10-17']
    const withElsewhere = rowFlags(row, excluded, elsewhere)
    assert.notEqual(withElsewhere.signature, plain.signature, nombre)
    // el reconocimiento de antes (sin otros días) ya no vale
    assert.deepEqual(rowFlags(row, excluded, elsewhere, plain.signature!).presence, withElsewhere.presence, nombre)
    assert.equal(rowFlags(row, excluded, elsewhere, withElsewhere.signature!).presence, undefined, nombre)
  }
})

test('una fila sin ninguna diferencia reconocible tiene huella null y un reconocimiento cualquiera no cambia nada', () => {
  const { rows } = week()
  for (const name of ['PEREZ JUAN', 'RAMOS EVA']) {
    const row = find(rows, name)
    const plain = rowFlags(row)
    assert.equal(plain.signature, null, name)
    const f = rowFlags(row, undefined, [], 'null')
    assert.deepEqual([name, f.presence, f.sources, f.acked, f.signature], [name, undefined, [], undefined, null])
  }
})

test('la huella no cambia por lo escrito a mano ni por el número de línea de la agenda', () => {
  const { rows } = week()
  const gomez = find(rows, 'GOMEZ ANA')
  const original = rowFlags(gomez).signature
  assert.notEqual(original, null)

  const [edited] = applyEdits(rows, { [gomez.key]: { eye: 'DERECHO', notes: 'ojo', time: '9:00', prequi: 'OK', hcCheck: 'x' } }).filter((r) => r.name === 'GOMEZ ANA')
  assert.equal(rowFlags(edited).signature, original)

  const moved = withAgenda({ ...gomez, line: 99 }, { line: 99 })
  assert.equal(rowFlags(moved).signature, original)
})

// itemsOf

test('itemsOf le pasa a cada fila su reconocimiento por clave, también a las sacadas', () => {
  const sobra = mk('2026-10-14', '9/00', 'manual', { key: 'a' })
  const falta = mk('2026-10-16', '9/00', 'agenda', { key: 'b' })
  const plain = itemsOf([sobra], [exc(falta, 'removed')])
  const [sigA, sigB] = plain.map((i) => i.flags.signature)
  assert.equal(typeof sigA, 'string')
  assert.equal(typeof sigB, 'string')

  const both2 = itemsOf([sobra], [exc(falta, 'removed')], { a: sigA!, b: sigB! })
  assert.deepEqual(both2.map((i) => [i.row.key, i.flags.presence, i.flags.acked?.presence?.kind]), [
    ['a', undefined, 'extra'],
    ['b', undefined, 'removed'],
  ])

  const onlyA = itemsOf([sobra], [exc(falta, 'removed')], { a: sigA! })
  assert.deepEqual(onlyA.map((i) => [i.row.key, i.flags.presence?.kind]), [
    ['a', undefined],
    ['b', 'removed'],
  ])
})

// store

const reset = () => useStore.getState().clearUserData()

test('acknowledge guarda la huella de una fila y unacknowledge la olvida sin tocar las demás', () => {
  reset()
  assert.deepEqual(useStore.getState().acks, {})
  useStore.getState().acknowledge('k|1', 'huella-1')
  useStore.getState().acknowledge('k|2', 'huella-2')
  useStore.getState().acknowledge('k|1', 'huella-nueva')
  assert.deepEqual(useStore.getState().acks, { 'k|1': 'huella-nueva', 'k|2': 'huella-2' })
  useStore.getState().unacknowledge('k|1')
  assert.deepEqual(useStore.getState().acks, { 'k|2': 'huella-2' })
  useStore.getState().unacknowledge('no-existe')
  assert.deepEqual(useStore.getState().acks, { 'k|2': 'huella-2' })
})

test('dropOrphan, moveOrphan y keepOrphan olvidan el reconocimiento de la fila vieja y dejan el de las demás', () => {
  const OLD = '2026-10-14|2/00'
  const snap = { ...EMPTY, name: 'PACIENTE 2/00', hc: '2/00', surgery: 'CATARATA', surgeon: 'DIAZ', date: '2026-10-14' }
  const present = mk('2026-10-16', '2/00', 'both', { key: '2026-10-16|2/00' })
  const orphan = () => {
    const [o] = findOrphans({ present: [present], snaps: { [OLD]: snap }, edits: { [OLD]: { prequi: 'OK' } }, included: {}, from: '2026-10-05' })
    assert.notEqual(o, undefined)
    return o
  }
  const arm = () => {
    reset()
    useStore.setState({ edits: { [OLD]: { prequi: 'OK' } }, snaps: { [OLD]: snap }, acks: { [OLD]: 'huella', otra: 'huella-otra' } })
  }

  arm()
  useStore.getState().dropOrphan(OLD)
  assert.deepEqual(useStore.getState().acks, { otra: 'huella-otra' })

  arm()
  useStore.getState().moveOrphan(orphan())
  assert.deepEqual(useStore.getState().acks, { otra: 'huella-otra' })

  arm()
  useStore.getState().keepOrphan(orphan())
  assert.deepEqual(useStore.getState().acks, { otra: 'huella-otra' })
})

test('clearUserData vacía los reconocimientos', () => {
  reset()
  useStore.getState().acknowledge('k|1', 'huella-1')
  useStore.getState().clearUserData()
  assert.deepEqual(useStore.getState().acks, {})
})

test('importUserData carga los reconocimientos del respaldo, y uno viejo sin acks los deja vacíos', () => {
  reset()
  useStore.getState().importUserData({ edits: {}, acks: { 'k|1': 'huella-1' } })
  assert.deepEqual(useStore.getState().acks, { 'k|1': 'huella-1' })

  useStore.getState().importUserData({ edits: {} })
  assert.deepEqual(useStore.getState().acks, {})
})
