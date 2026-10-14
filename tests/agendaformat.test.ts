import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadAgenda } from '../src/load.ts'
import { useSources } from '../src/store.ts'

// Datos inventados: nunca poner pacientes reales en el repo

// el store guarda en localStorage, que Node no trae
const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) },
})

const HEADER = ['Marca temporal', 'Marca temporal', 'APELLIDO Y  NOMBRE  ', 'OBRA SOCIAL', 'DURACION', 'CIRUGIA', 'CIRUJANO', 'AYUDANTE', '', 'JERARQUIA', 'TELEFONO DE CONTACTO', 'INSUMO A UTILIZAR', 'DIOPTRIAS', 'ANESTESIA', 'PEDIDO B', 'OBSERVACIONES', 'EDAD', 'DNI', '']
const ROW = ['01/10/2026 10:00:00', '14/10/2026', 'PEREZ JUAN', '11111/00', '60', 'CATARATA', 'GARCIA', 'LOPEZ', 'DERECHO', '-', '1155550000', '', '', 'LOCAL', 'No', 'uno, dos, tres, cuatro', '-', '-', '']

const file = (name: string, sep: string) => new File([[HEADER, ROW].map((r) => r.join(sep)).join('\r\n')], name)

test('una agenda separada por tabulaciones se rechaza diciendo por qué y no pisa la que ya estaba', async () => {
  useSources.getState().setAgenda('anterior.csv', 'texto de la agenda anterior')
  const result = await loadAgenda([file('agenda.tsv', '\t')])
  assert.equal(result.ok, false)
  assert.match(result.message, /tabulaciones/)
  assert.deepEqual(useSources.getState().agenda, { name: 'anterior.csv', text: 'texto de la agenda anterior' })
})

test('la misma agenda separada por comas se carga', async () => {
  const csv = new File([[HEADER, ROW].map((r) => r.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',')).join('\r\n')], 'agenda.csv')
  const result = await loadAgenda([csv])
  assert.equal(result.ok, true)
  assert.equal(useSources.getState().agenda?.name, 'agenda.csv')
})
