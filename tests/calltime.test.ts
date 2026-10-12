import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CALL_HOURS_BEFORE, callTime } from '../src/tasks.ts'

// La hora de citación se muestra, nunca se guarda: el Horario es texto libre y
// solo se lee cuando es una hora o un rango de dos horas (regla 1 de CLAUDE.md)

const expectTimes = (pairs: [string, string][]) => {
  for (const [input, expected] of pairs) assert.equal(callTime(input), expected, JSON.stringify(input))
}

const expectNull = (inputs: string[]) => {
  for (const input of inputs) assert.equal(callTime(input), null, JSON.stringify(input))
}

test('se cita al paciente 2 horas antes', () => {
  assert.equal(CALL_HOURS_BEFORE, 2)
})

test('H:MM y HH:MM restan las horas y conservan los minutos, sin cero a la izquierda en la hora', () => {
  expectTimes([
    ['9:00', '7:00'],
    ['09:30', '7:30'],
    ['14:45', '12:45'],
    ['23:59', '21:59'],
  ])
})

test('una hora sola (H o HH) se lee como hora en punto', () => {
  expectTimes([
    ['8', '6:00'],
    ['10', '8:00'],
    ['23', '21:00'],
  ])
})

test('el punto también separa horas de minutos', () => {
  expectTimes([
    ['10.15', '8:15'],
    ['9.30', '7:30'],
  ])
})

test('la coma separa horas de minutos, sola o en cada extremo de un rango, y la coma de texto no', () => {
  expectTimes([
    ['9,30', '7:30'],
    ['15,00', '13:00'],
    ['14,00-16,00', '12:00'],
    ['15,30-16,00', '13:30'],
    ['8,30 hs', '6:30'],
  ])
  expectNull(['9,5', '9,75', '9,00-25,00', '9,', ',30', '1,30', '9:00, si hay lugar'])
})

test('el sufijo h, hs o hs. se acepta con o sin espacio antes', () => {
  expectTimes([
    ['8h', '6:00'],
    ['8hs', '6:00'],
    ['8hs.', '6:00'],
    ['8:30 hs', '6:30'],
    ['8:30 hs.', '6:30'],
    ['8:30 h', '6:30'],
    ['10.15hs', '8:15'],
  ])
})

test('los espacios de los bordes no importan', () => {
  expectTimes([
    [' 9:00 ', '7:00'],
    ['  8hs  ', '6:00'],
  ])
})

test('la hora 2:00 cita a medianoche y se muestra como 0:00', () => {
  expectTimes([['2:00', '0:00']])
})

test('si la cita caería antes de medianoche no se calcula', () => {
  expectNull(['1:30', '1', '1:59', '0:00'])
})

test('un horario vacío o sin ninguna hora no da nada', () => {
  expectNull(['', '   ', '.', '-'])
})

test('texto que no es una hora no da nada', () => {
  expectNull(['a confirmar', 'mañana'])
})

test('una hora con notas alrededor no se lee con certeza', () => {
  expectNull(['9:00, si hay lugar', '9 a las 11', '9 y 10'])
})

test('un rango resta las horas al inicio y el fin no influye en el resultado', () => {
  expectTimes([
    ['8-8.30', '6:00'],
    ['9-10', '7:00'],
    ['9:00 a 11:00', '7:00'],
    ['8:30 - 9', '6:30'],
    ['10:15–11:00', '8:15'],
    ['8 a 9hs', '6:00'],
    ['8hs-9hs', '6:00'],
    [' 9 - 10 ', '7:00'],
  ])
})

test('un rango no exige que el fin sea posterior al inicio', () => {
  expectTimes([['10-9', '8:00']])
})

test('un rango cuyo inicio caería antes de medianoche no se calcula', () => {
  expectNull(['1:30-3', '1-5'])
})

test('un rango con el fin inválido, incompleto o con más de dos horas no da nada', () => {
  expectNull(['9-25', '9-10:75', '9-', '-9', '9-10-11', '9:00 a'])
})

test('horas o minutos fuera de rango no dan nada', () => {
  expectNull(['24:00', '24', '9:75', '9:60'])
})

test('minutos de un solo dígito o horas pegadas sin separador no se adivinan', () => {
  expectNull(['9:5', '900'])
})
