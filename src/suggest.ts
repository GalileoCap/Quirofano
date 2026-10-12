import { normName } from './agenda.ts'
import { agendaValue, eventValue } from './origin.ts'
import type { AgendaRow, CalEvent, Field } from './types.ts'

/** Los campos que ofrecen sugerencias: los que repiten valores (el nombre, la HC o el teléfono son de cada paciente). */
export const SUGGESTED_FIELDS: Field[] = ['surgery', 'surgeon', 'assistant', 'eye', 'anesthesia', 'contact', 'duration']

/**
 * Valores que ya hay en la agenda y el calendar para cada campo, del más usado al menos usado. Las variantes de
 * escritura (mayúsculas, acentos, espacios) cuentan como una sola y se ofrece la grafía más usada. Solo cuenta lo
 * de `since` en adelante ('YYYY-MM-DD'): la fecha de la cirugía o, si esa celda está rota, la de la carga.
 */
export function suggestions(agenda: AgendaRow[], events: CalEvent[], { since, limit = 150 }: { since: string; limit?: number }): Partial<Record<Field, string[]>> {
  const out: Partial<Record<Field, string[]>> = {}
  const recentAgenda = agenda.filter((a) => (a.date ?? a.stamp ?? '') >= since)
  const recentEvents = events.filter((e) => e.date >= since)
  for (const f of SUGGESTED_FIELDS) {
    const groups = new Map<string, { total: number; spellings: Map<string, number> }>()
    const values = [...recentAgenda.map((a) => agendaValue(a, f)), ...recentEvents.map((e) => eventValue(e, f))]
    for (const v of values) {
      const norm = normName(v)
      if (!norm) continue
      const g = groups.get(norm) ?? { total: 0, spellings: new Map() }
      g.total++
      g.spellings.set(v, (g.spellings.get(v) ?? 0) + 1)
      groups.set(norm, g)
    }
    out[f] = [...groups.values()]
      .toSorted((a, b) => b.total - a.total)
      .slice(0, limit)
      .map((g) => [...g.spellings].toSorted((a, b) => b[1] - a[1])[0][0])
  }
  return out
}
