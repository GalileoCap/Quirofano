import { addDaysTo, today } from './dates.ts'
import type { AgendaRow, CalProblem } from './types.ts'

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** El aviso de un evento del calendar que no se pudo leer como cirugía. */
export const problemText = (p: CalProblem) =>
  p.strong
    ? `El evento "${p.title}" del ${dm(p.date)} no tiene el formato "CIRUGÍA / PACIENTE / CIRUJANO": no lo pude cruzar.`
    : `"${p.title}" (${dm(p.date)}, ${p.calendar})`

/** Qué evento es (fecha, calendario y título): sirve de clave para reconocerlo. */
export const problemKey = (p: CalProblem) => `problem|${p.date}|${p.calendar}|${p.title}`

/** Lo que dice el evento: si cambia (por ejemplo la descripción), el reconocimiento ya no vale. */
export const problemSignature = (p: CalProblem) => JSON.stringify([p.date, p.calendar, p.title, p.description])

/** Separa los avisos reconocidos (con lo que dice hoy el evento) de los que siguen abiertos. */
export function splitProblems(problems: CalProblem[], acks: Record<string, string>): { open: CalProblem[]; acked: CalProblem[] } {
  const acked = (p: CalProblem) => acks[problemKey(p)] === problemSignature(p)
  return { open: problems.filter((p) => !acked(p)), acked: problems.filter(acked) }
}

/** Hasta cuántos días atrás importa una fila de la agenda con la fecha rota (lo mismo que se guarda del calendar). */
export const AGENDA_PROBLEM_DAYS = 120

/**
 * Filas de la agenda cargadas en los últimos `AGENDA_PROBLEM_DAYS` días cuya fecha no se entiende: no entran a ningún
 * checklist, así que se avisan. Las que no tienen marca temporal legible también, porque no se sabe de cuándo son.
 */
export const agendaProblems = (agenda: AgendaRow[], now = today()) => {
  const since = addDaysTo(now, -AGENDA_PROBLEM_DAYS)
  return agenda.filter((a) => !a.date && (a.stamp ?? since) >= since)
}

export const agendaProblemText = (a: AgendaRow) =>
  `La fila ${a.line} de la agenda${a.stamp ? ` (cargada el ${dm(a.stamp)})` : ''} tiene una fecha que no se entiende («${a.cells[1] ?? ''}»): ${a.name || 'sin nombre'}${a.surgery ? ` · ${a.surgery}` : ''}. Corregila en la hoja o cargala a mano.`

/** La fila por su marca temporal y paciente (el número de línea cambia si se borran filas de la hoja). */
export const agendaProblemKey = (a: AgendaRow) => `agenda|${a.cells[0] ?? ''}|${a.name}|${a.hc}`

export const agendaProblemSignature = (a: AgendaRow) => JSON.stringify(a.cells)
