import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CalendarFile, UserData } from '../src/store.ts'
import type { RawEvent } from '../src/ics.ts'
import type { Migration } from '../src/persist.ts'
import { FIELDS, type Fields, type Row } from '../src/types.ts'

// Datos inventados: nunca poner pacientes reales en el repo

// los stores guardan en localStorage, que Node no trae: el shim va antes de cargar los módulos
const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) },
})

const { runMigrations, versionOf, readUserData, readSources, writeBackup, readBackup, USER_VERSION, SOURCES_VERSION } = await import('../src/persist.ts')
const { useStore, useSources } = await import('../src/store.ts')

const EMPTY_FIELDS = Object.fromEntries(FIELDS.map((f) => [f, ''])) as Fields

const EMPTY_USER: UserData = { edits: {}, bases: {}, snaps: {}, order: {}, included: {}, manualRows: [], ranges: {}, acks: {}, tasks: {} }

const manualRow = (key: string, date: string, over: Partial<Fields> = {}): Row => ({ ...EMPTY_FIELDS, name: 'PACIENTE UNO', surgery: 'CATARATA', ...over, key, date, source: 'manual' })

const FULL: UserData = {
  edits: { '2026-10-12|A|1': { eye: 'OD', notes: 'revisar' } },
  bases: { '2026-10-12|A|1': { eye: 'OI' } },
  snaps: { '2026-10-12|A|1': { ...EMPTY_FIELDS, name: 'PACIENTE UNO', hc: '1', date: '2026-10-12' } },
  order: { '2026-10-12': ['2026-10-12|A|1', '2026-10-12|B|2'] },
  included: { '2026-10-12|A|1': true, '2026-10-12|B|2': false },
  manualRows: [manualRow('2026-10-13|C|3', '2026-10-13', { hc: '3' })],
  ranges: { '2026-10-12': { from: '2026-10-12', to: '2026-10-16' } },
  acks: { '2026-10-12|A|1': 'firma' },
  tasks: { 'valija|2026-10-12': { done: true, note: 'lista' } },
}

const event = (over: Partial<RawEvent> = {}): RawEvent => ({ date: '2026-10-12', title: 'CATARATA / UNO / DIAZ', description: 'OD', calendar: 'AGENDA', cancelled: false, ...over })

// pasos

const stamp =
  (tag: string): Migration =>
  (s) => ({ ...s, trace: `${typeof s.trace === 'string' ? s.trace : ''}${tag}` })

test('runMigrations: con la misma versión devuelve el estado y no llama ningún paso', () => {
  let calls = 0
  const state = { a: 1 }
  const out = runMigrations(
    state,
    2,
    2,
    {
      2: (s) => {
        calls++
        return s
      },
    },
  )
  assert.deepEqual(out, { a: 1 })
  assert.equal(calls, 0)
})

test('runMigrations: aplica los pasos desde la versión de origen hasta la de destino, en orden, cada uno con la salida del anterior', () => {
  const steps = { 1: stamp('a'), 2: stamp('b'), 3: stamp('c'), 4: stamp('d') }
  assert.deepEqual(runMigrations({ x: 1 }, 1, 4, steps), { x: 1, trace: 'abc' })
  assert.deepEqual(runMigrations({ x: 1 }, 2, 4, steps), { x: 1, trace: 'bc' })
})

test('runMigrations: si falta un paso de la cadena lanza y no toca el estado de entrada', () => {
  const state = { x: 1 }
  assert.throws(() => runMigrations(state, 1, 3, { 1: stamp('a') }), Error)
  assert.throws(() => runMigrations(state, 0, 1, {}), Error)
  assert.deepEqual(state, { x: 1 })
})

test('runMigrations: datos de una versión más nueva se devuelven sin tocar y sin llamar pasos', () => {
  let calls = 0
  const out = runMigrations(
    { x: 1 },
    5,
    2,
    {
      2: (s) => {
        calls++
        return s
      },
    },
  )
  assert.deepEqual(out, { x: 1 })
  assert.equal(calls, 0)
})

test('runMigrations: un estado que no es objeto plano se trata como vacío', () => {
  const steps = { 1: stamp('a') }
  for (const bad of [null, undefined, 'texto', 7, [1, 2]]) {
    assert.deepEqual(runMigrations(bad, 1, 2, steps), { trace: 'a' })
  }
})

// versionOf

test('versionOf: lee el número de versión del texto que guarda zustand y da null ante cualquier otra cosa', () => {
  assert.equal(versionOf('{"state":{},"version":3}'), 3)
  assert.equal(versionOf('{"state":{},"version":0}'), 0)
  assert.equal(versionOf(null), null)
  assert.equal(versionOf('esto no es json'), null)
  assert.equal(versionOf('[1,2]'), null)
  assert.equal(versionOf('"texto"'), null)
  assert.equal(versionOf('{"state":{}}'), null)
  assert.equal(versionOf('{"state":{},"version":"2"}'), null)
})

// readUserData

test('readUserData: lo que no es un objeto da el UserData vacío', () => {
  for (const bad of [null, undefined, 'texto', 7, true, []]) {
    assert.deepEqual(readUserData(bad), EMPTY_USER)
  }
})

test('readUserData: un UserData válido y completo pasa idéntico', () => {
  assert.deepEqual(readUserData(FULL), FULL)
})

test('readUserData: las claves que faltan quedan vacías y el resto se conserva (respaldo viejo sin acks ni tasks)', () => {
  const viejo = Object.fromEntries(Object.entries(FULL).filter(([k]) => k !== 'acks' && k !== 'tasks'))
  assert.deepEqual(readUserData(viejo), { ...FULL, acks: {}, tasks: {} })
})

test('readUserData: las claves desconocidas no aparecen en el resultado', () => {
  const out = readUserData({ ...FULL, dayStart: '8:00', news: { at: 'x', items: [] } })
  assert.deepEqual(out, FULL)
  assert.equal('dayStart' in out, false)
  assert.equal('news' in out, false)
})

test('readUserData: un campo con el tipo equivocado queda vacío y los demás se conservan', () => {
  const out = readUserData({ ...FULL, edits: 'x', manualRows: {}, order: [], tasks: 3 })
  assert.deepEqual(out, { ...FULL, edits: {}, manualRows: [], order: {}, tasks: {} })
})

test('readUserData: en edits y bases se descartan las entradas que no son objeto, los campos desconocidos y los valores que no son string', () => {
  const sucio = { 'k|1': { eye: 'OD', inventado: 'z', notes: 5, hc: null }, 'k|2': 'x', 'k|3': null }
  assert.deepEqual(readUserData({ edits: sucio, bases: sucio }), { ...EMPTY_USER, edits: { 'k|1': { eye: 'OD' } }, bases: { 'k|1': { eye: 'OD' } } })
})

test('readUserData: en order se descarta la entrada que no es array y dentro de un array solo quedan los strings', () => {
  const out = readUserData({ order: { '2026-10-12': ['a', 5, 'b', null, { x: 1 }], '2026-10-13': 'a', '2026-10-14': { 0: 'a' } } })
  assert.deepEqual(out.order, { '2026-10-12': ['a', 'b'] })
})

test('readUserData: en included solo quedan los booleanos', () => {
  const out = readUserData({ included: { a: true, b: false, c: 'si', d: 1, e: null } })
  assert.deepEqual(out.included, { a: true, b: false })
})

test('readUserData: en ranges solo quedan las que tienen from y to string', () => {
  const out = readUserData({
    ranges: {
      '2026-10-12': { from: '2026-10-12', to: '2026-10-16' },
      '2026-10-19': { from: '2026-10-19' },
      '2026-10-26': { from: 1, to: '2026-10-30' },
      '2026-11-02': 'x',
    },
  })
  assert.deepEqual(out.ranges, { '2026-10-12': { from: '2026-10-12', to: '2026-10-16' } })
})

test('readUserData: en acks solo quedan los valores string', () => {
  const out = readUserData({ acks: { a: 'firma', b: 5, c: null, d: ['x'] } })
  assert.deepEqual(out.acks, { a: 'firma' })
})

test('readUserData: en tasks solo quedan las que tienen done boolean y note string', () => {
  const out = readUserData({
    tasks: {
      a: { done: true, note: 'nota' },
      b: { done: false, note: '' },
      c: { done: true },
      d: { note: 'x' },
      e: { done: 'si', note: 'x' },
      f: { done: true, note: 5 },
      g: 'x',
    },
  })
  assert.deepEqual(out.tasks, { a: { done: true, note: 'nota' }, b: { done: false, note: '' } })
})

test('readUserData: un snap pide objeto con date string; completa con vacío los campos que faltan o no son string (una columna nueva no rompe filas viejas)', () => {
  const out = readUserData({
    snaps: {
      completo: { ...EMPTY_FIELDS, name: 'PACIENTE UNO', date: '2026-10-12' },
      incompleto: { name: 'PACIENTE DOS', hc: 7, date: '2026-10-13' },
      sinFecha: { ...EMPTY_FIELDS, name: 'PACIENTE TRES' },
      fechaMala: { ...EMPTY_FIELDS, date: 20261012 },
      noObjeto: 'x',
    },
  })
  assert.deepEqual(out.snaps, {
    completo: { ...EMPTY_FIELDS, name: 'PACIENTE UNO', date: '2026-10-12' },
    incompleto: { ...EMPTY_FIELDS, name: 'PACIENTE DOS', date: '2026-10-13' },
  })
})

test('readUserData: una fila a mano necesita key y date string; lo demás se completa con vacío y siempre queda source manual', () => {
  const out = readUserData({
    manualRows: [
      manualRow('2026-10-12|A|1', '2026-10-12', { hc: '1' }),
      { key: '2026-10-13|B|2', date: '2026-10-13', source: 'agenda', name: 'PACIENTE DOS', hc: 2 },
      { date: '2026-10-14', name: 'sin key' },
      { key: 'sin fecha' },
      { key: 5, date: '2026-10-15' },
      'x',
      null,
    ],
  })
  assert.deepEqual(out.manualRows, [
    manualRow('2026-10-12|A|1', '2026-10-12', { hc: '1' }),
    { ...EMPTY_FIELDS, name: 'PACIENTE DOS', key: '2026-10-13|B|2', date: '2026-10-13', source: 'manual' },
  ])
})

// readSources

test('readSources: lo inválido da agenda null y sin calendarios', () => {
  for (const bad of [null, undefined, 'x', 3, []]) {
    assert.deepEqual(readSources(bad), { agenda: null, calendars: [] })
  }
})

test('readSources: un estado válido pasa idéntico', () => {
  const cal: CalendarFile = { name: 'c.ics', events: [event(), event({ cancelled: true, title: 'OTRO' })] }
  const state = { agenda: { name: 'a.csv', text: 'x,y' }, calendars: [cal] }
  assert.deepEqual(readSources(state), state)
})

test('readSources: la agenda necesita name y text string, si no queda null', () => {
  assert.equal(readSources({ agenda: { name: 'a.csv' }, calendars: [] }).agenda, null)
  assert.equal(readSources({ agenda: { name: 1, text: 'x' }, calendars: [] }).agenda, null)
  assert.equal(readSources({ agenda: 'a.csv', calendars: [] }).agenda, null)
  assert.deepEqual(readSources({ agenda: { name: 'a.csv', text: '' } }).agenda, { name: 'a.csv', text: '' })
})

test('readSources: calendars debe ser array; los archivos sin name string o sin events array se descartan', () => {
  assert.deepEqual(readSources({ agenda: null, calendars: {} }).calendars, [])
  const buenos = { name: 'c.ics', events: [event()] }
  const out = readSources({ calendars: [buenos, { name: 'sin eventos' }, { events: [] }, { name: 3, events: [] }, { name: 'x', events: 'no' }, 'x', null] })
  assert.deepEqual(out.calendars, [buenos])
})

test('readSources: dentro de un archivo solo quedan los eventos con date, title, description y calendar string y cancelled boolean', () => {
  const bueno = event()
  const out = readSources({
    calendars: [
      {
        name: 'c.ics',
        events: [
          bueno,
          { ...bueno, title: undefined },
          { ...bueno, date: 20261012 },
          { ...bueno, description: null },
          { ...bueno, calendar: 1 },
          { ...bueno, cancelled: 'no' },
          { date: '2026-10-12' },
          'x',
        ],
      },
    ],
  })
  assert.deepEqual(out.calendars, [{ name: 'c.ics', events: [bueno] }])
})

// respaldo

test('writeBackup: es JSON con sangría de 2, la versión actual y las nueve claves', () => {
  const text = writeBackup(FULL)
  const parsed: unknown = JSON.parse(text)
  assert.ok(typeof parsed === 'object' && parsed !== null)
  assert.equal('version' in parsed ? parsed.version : undefined, USER_VERSION)
  for (const key of Object.keys(EMPTY_USER)) assert.ok(key in parsed, key)
  assert.ok(text.includes('\n  "version"') || text.includes('\n  "edits"'))
})

test('readBackup: el roundtrip de un respaldo propio devuelve los mismos datos, también vacíos', () => {
  assert.deepEqual(readBackup(writeBackup(FULL)), { ok: true, data: FULL })
  assert.deepEqual(readBackup(writeBackup(EMPTY_USER)), { ok: true, data: EMPTY_USER })
})

test('readBackup: texto que no es JSON, que no es objeto o sin edits da ok false con un error escrito', () => {
  for (const bad of ['no es json', '', '[]', '5', '"x"', 'null', '{}', '{"version":1}', '{"acks":{}}']) {
    const r = readBackup(bad)
    assert.equal(r.ok, false, bad)
    if (!r.ok) assert.ok(typeof r.error === 'string' && r.error.length > 0, bad)
  }
})

test('readBackup: sin version se lee como la 1, el formato de los respaldos que ya existen, y se sanea', () => {
  const r = readBackup(JSON.stringify({ edits: { 'k|1': { eye: 'OD', inventado: 'z' } }, dayStart: '8:00' }))
  if (!r.ok) return assert.fail(r.error)
  assert.deepEqual(r.data, { ...EMPTY_USER, edits: { 'k|1': { eye: 'OD' } } })
})

test('readBackup: un respaldo de una versión más nueva se rechaza diciéndolo', () => {
  const r = readBackup(JSON.stringify({ version: USER_VERSION + 1, edits: {} }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.error, /nueva/)
})

test('readBackup: una version que no es número se rechaza', () => {
  for (const version of ['1', null, {}, [1], true]) {
    assert.equal(readBackup(JSON.stringify({ version, edits: {} })).ok, false, JSON.stringify(version))
  }
})

// integración con los stores

const USER_KEY = 'quiro-v1'
const SOURCES_KEY = 'quiro-sources-v1'
const USER_KEYS = Object.keys(EMPTY_USER) as (keyof UserData)[]

const reset = () => {
  useStore.getState().clearUserData()
  useStore.getState().setNews(null)
  useSources.setState({ agenda: null, calendars: [] })
  memory.clear()
}
const saveUser = (state: object, version: number) => {
  const text = JSON.stringify({ state, version })
  memory.set(USER_KEY, text)
  return text
}
const saveSources = (state: object, version: number) => memory.set(SOURCES_KEY, JSON.stringify({ state, version }))
const userSnapshot = () => Object.fromEntries(USER_KEYS.map((k) => [k, useStore.getState()[k]]))
const copyKeys = () => [...memory.keys()].filter((k) => k.includes('.antes-'))

test('store: al rehidratar se sanea lo leído, se descartan las claves desconocidas y no se crea ninguna copia', async () => {
  reset()
  saveUser({ edits: { 'k|1': { eye: 'OD' } }, dayStart: '8:00', tasks: 'basura' }, USER_VERSION)
  await useStore.persist.rehydrate()
  const state = useStore.getState()
  assert.deepEqual(state.edits, { 'k|1': { eye: 'OD' } })
  assert.deepEqual(state.tasks, {})
  assert.equal('dayStart' in state, false)
  assert.deepEqual(copyKeys(), [])
})

test('store: datos de una versión más nueva se leen en lo que se conoce y antes se guarda una copia con el texto original', async () => {
  reset()
  const original = saveUser({ edits: { 'k|1': { eye: 'OD' } } }, 99)
  await useStore.persist.rehydrate()
  assert.deepEqual(useStore.getState().edits, { 'k|1': { eye: 'OD' } })
  assert.equal(memory.get(`${USER_KEY}.antes-v99`), original)
})

test('store: la copia de seguridad de una versión que ya existía no se pisa', async () => {
  reset()
  saveUser({ edits: { 'k|1': { eye: 'OD' } } }, 99)
  memory.set(`${USER_KEY}.antes-v99`, 'copia previa')
  await useStore.persist.rehydrate()
  assert.equal(memory.get(`${USER_KEY}.antes-v99`), 'copia previa')
})

test('store: una versión vieja sin paso registrado guarda su copia y rehidratar no tumba nada', async () => {
  reset()
  const original = saveUser({ edits: { 'k|1': { eye: 'OD' } } }, 0)
  await assert.doesNotReject(async () => {
    await useStore.persist.rehydrate()
  })
  assert.equal(memory.get(`${USER_KEY}.antes-v0`), original)
  assert.deepEqual(readUserData(userSnapshot()), userSnapshot())
})

test('store: las novedades bien formadas sobreviven a rehidratar', async () => {
  reset()
  const news = {
    at: '2026-10-12T10:00:00Z',
    items: [
      { kind: 'added', key: 'k', date: '2026-10-13', name: 'X', surgery: 'Y' },
      { kind: 'removed', key: 'k2', date: '2026-10-14', name: 'X2', surgery: 'Y2' },
      { kind: 'moved', key: 'k3', date: '2026-10-15', name: 'X3', surgery: 'Y3' },
      { kind: 'changed', key: 'k4', date: '2026-10-16', name: 'X4', surgery: 'Y4' },
    ],
  }
  saveUser({ news }, USER_VERSION)
  await useStore.persist.rehydrate()
  assert.deepEqual(useStore.getState().news, news)
})

test('store: unas novedades mal formadas quedan en null', async () => {
  reset()
  saveUser({ news: { at: 5, items: [] } }, USER_VERSION)
  await useStore.persist.rehydrate()
  assert.equal(useStore.getState().news, null)

  reset()
  saveUser({ news: { at: '2026-10-12T10:00:00Z', items: 'x' } }, USER_VERSION)
  await useStore.persist.rehydrate()
  assert.equal(useStore.getState().news, null)
})

test('store: dentro de las novedades se descartan los items con kind desconocido o sin key, date, name o surgery string', async () => {
  reset()
  const bueno = { kind: 'added', key: 'k', date: '2026-10-13', name: 'X', surgery: 'Y' }
  saveUser(
    {
      news: {
        at: '2026-10-12T10:00:00Z',
        items: [
          bueno,
          { ...bueno, kind: 'inventado' },
          { ...bueno, kind: undefined },
          { ...bueno, key: 1 },
          { ...bueno, date: undefined },
          { ...bueno, name: null },
          { ...bueno, surgery: 5 },
          'x',
        ],
      },
    },
    USER_VERSION,
  )
  await useStore.persist.rehydrate()
  assert.deepEqual(useStore.getState().news, { at: '2026-10-12T10:00:00Z', items: [bueno] })
})

test('sources: la versión actual conserva la agenda y los calendarios, sin copia de seguridad', async () => {
  reset()
  const calendars: CalendarFile[] = [{ name: 'c.ics', events: [event()] }]
  saveSources({ agenda: { name: 'a.csv', text: 'x' }, calendars }, SOURCES_VERSION)
  await useSources.persist.rehydrate()
  assert.deepEqual(useSources.getState().agenda, { name: 'a.csv', text: 'x' })
  assert.deepEqual(useSources.getState().calendars, calendars)
  assert.deepEqual(copyKeys(), [])
})

test('sources: una versión más nueva se lee con lo que se reconoce y no hace copia', async () => {
  reset()
  const calendars: CalendarFile[] = [{ name: 'c.ics', events: [event()] }]
  saveSources({ agenda: { name: 'a.csv', text: 'x' }, calendars, nuevo: 'algo' }, SOURCES_VERSION + 1)
  await useSources.persist.rehydrate()
  assert.deepEqual(useSources.getState().agenda, { name: 'a.csv', text: 'x' })
  assert.deepEqual(useSources.getState().calendars, calendars)
  assert.deepEqual(copyKeys(), [])
})
