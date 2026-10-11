import { addDaysTo } from './dates.ts'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** '2026-10-13' → '13/10'. */
export const shortDate = (iso: string) => `${iso.slice(8, 10).replace(/^0/, '')}/${iso.slice(5, 7).replace(/^0/, '')}`

/** Título de la semana que empieza en `monday`: "12 – 18 de octubre de 2026". */
export function weekLabel(monday: string) {
  const sunday = addDaysTo(monday, 6)
  const [d1, m1, y1] = [+monday.slice(8), +monday.slice(5, 7) - 1, monday.slice(0, 4)]
  const [d2, m2, y2] = [+sunday.slice(8), +sunday.slice(5, 7) - 1, sunday.slice(0, 4)]
  if (m1 === m2) return `${d1} – ${d2} de ${MONTHS[m2]} de ${y2}`
  return `${d1} de ${MONTHS[m1]}${y1 !== y2 ? ` de ${y1}` : ''} – ${d2} de ${MONTHS[m2]} de ${y2}`
}
