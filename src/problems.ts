import type { CalProblem } from './types.ts'

/** El aviso de un evento del calendar que parece una cirugía pero no se pudo leer. */
export const problemText = (p: CalProblem) =>
  `El evento "${p.title}" del ${p.date.slice(8, 10)}/${p.date.slice(5, 7)} no tiene el formato "CIRUGÍA / PACIENTE / CIRUJANO": no lo pude cruzar.`

/** Qué evento es (fecha, calendario y título): sirve de clave para reconocerlo. */
export const problemKey = (p: CalProblem) => `problem|${p.date}|${p.calendar}|${p.title}`

/** Lo que dice el evento: si cambia (por ejemplo la descripción), el reconocimiento ya no vale. */
export const problemSignature = (p: CalProblem) => JSON.stringify([p.date, p.calendar, p.title, p.description])

/** Separa los avisos reconocidos (con lo que dice hoy el evento) de los que siguen abiertos. */
export function splitProblems(problems: CalProblem[], acks: Record<string, string>): { open: CalProblem[]; acked: CalProblem[] } {
  const acked = (p: CalProblem) => acks[problemKey(p)] === problemSignature(p)
  return { open: problems.filter((p) => !acked(p)), acked: problems.filter(acked) }
}
