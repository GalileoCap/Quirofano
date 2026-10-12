import { normName } from './agenda.ts'
import { normHc } from './merge.ts'
import { FIELDS, MANUAL_FIELDS, type Conflict, type Field, type Fields, type Row, type Snap } from './types.ts'

type Edit = Partial<Record<Field, string>>
type EditsByKey = Record<string, Edit>

/** Solo los campos del checklist de una fila (sin clave, fecha ni avisos). */
export const fieldsOf = (r: Fields): Fields => Object.fromEntries(FIELDS.map((f) => [f, r[f]])) as Fields

export const snapOf = (r: Row): Snap => ({ ...fieldsOf(r.src ?? r), date: r.date })

/**
 * Lo escrito a mano sobre una fila, separado en lo que rige y lo que hay que confirmar.
 * `base` es lo que decían las fuentes la última vez que se confirmó cada campo (se anota al escribirlo).
 * - Lo escrito coincide con las fuentes → nada que decir.
 * - Difiere y las fuentes dicen lo mismo que cuando se confirmó → rige lo escrito, sin avisos.
 * - Difiere y no hay confirmación (edición vieja) o las fuentes cambiaron después → conflicto: sigue rigiendo lo escrito
 *   hasta que se confirme o se vuelva a lo de las fuentes.
 * - Lo "editado" era igual a lo que decían las fuentes y ahora cambió → no era una edición de verdad: rige lo nuevo.
 * Las columnas que solo existen en el checklist (PREQUI, notas…) nunca son diferencias.
 */
export function resolveEdit(src: Fields, edit: Edit, base: Edit | undefined): { edit: Edit; conflicts: Conflict[] } {
  const out: Edit = {}
  const conflicts: Conflict[] = []
  for (const f of Object.keys(edit) as Field[]) {
    const mine = edit[f]!
    const was = base?.[f]
    const now = src[f]
    if (was !== undefined && mine === was && now !== was) continue
    out[f] = mine
    if (!MANUAL_FIELDS.includes(f) && now !== mine && now !== was) conflicts.push({ field: f, mine, was, now })
  }
  return { edit: out, conflicts }
}

const hasText = (e: Edit | undefined) => !!e && Object.values(e).some((v) => v?.trim())

/** Una fila que el cruce ya no devuelve pero en la que hay algo hecho a mano. */
export type Orphan = { key: string; snap: Snap; edit: Edit; included: boolean; movedTo?: Row }

const same = (a: { hc: string; name: string; surgery: string }, b: typeof a) =>
  a.hc && b.hc ? normHc(a.hc) === normHc(b.hc) : normName(a.name) === normName(b.name) && normName(a.surgery) === normName(b.surgery)

/**
 * Filas con trabajo manual (campos escritos o incluidas a mano) que desaparecieron de las fuentes: la cirugía se movió
 * de día, se canceló o se borró. `present` son todas las filas que el cruce devuelve hoy para las semanas que importan.
 */
export function findOrphans(p: {
  present: Row[]
  snaps: Record<string, Snap>
  edits: EditsByKey
  included: Record<string, boolean>
  from: string
}): Orphan[] {
  const keys = new Set(p.present.map((r) => r.key))
  const out: Orphan[] = []
  for (const [key, snap] of Object.entries(p.snaps)) {
    if (snap.date < p.from || keys.has(key) || p.included[key] === false) continue
    const worked = hasText(p.edits[key])
    if (!worked && !p.included[key]) continue
    // movida: la misma persona/cirugía aparece ahora en otro día y esa fila todavía no tiene trabajo propio
    const movedTo = p.present.find((r) => r.date !== snap.date && !hasText(p.edits[r.key]) && same(r, snap))
    out.push({ key, snap, edit: p.edits[key] ?? {}, included: !!p.included[key], movedTo })
  }
  return out.sort((a, b) => a.snap.date.localeCompare(b.snap.date))
}

export type Novelty = {
  kind: 'added' | 'removed' | 'moved' | 'changed'
  key: string
  date: string
  name: string
  surgery: string
  /** Solo en 'moved': el día anterior */
  from?: string
  /** Solo en 'changed' */
  changes?: { field: Field; was: string; now: string }[]
}

/**
 * Qué cambió entre dos cargas de agenda/calendar: cirugías nuevas, que ya no están, movidas de día o con datos distintos.
 * Se omite lo que ya requiere confirmación (conflictos y filas con trabajo manual que desaparecieron): eso va aparte.
 */
export function diffRows(before: Row[], after: Row[], edits: EditsByKey, included: Record<string, boolean>): Novelty[] {
  const was = new Map(before.map((r) => [r.key, r]))
  const now = new Map(after.map((r) => [r.key, r]))
  const added = after.filter((r) => !was.has(r.key))
  const removed = before.filter((r) => !now.has(r.key) && !hasText(edits[r.key]) && included[r.key] !== true && included[r.key] !== false)
  const out: Novelty[] = []
  const movedFrom = new Set<string>()
  for (const a of added) {
    const m = removed.find((r) => !movedFrom.has(r.key) && r.date !== a.date && same(r, a))
    if (m) movedFrom.add(m.key)
    out.push({ kind: m ? 'moved' : 'added', key: a.key, date: a.date, name: a.name, surgery: a.surgery, from: m?.date })
  }
  for (const r of removed)
    if (!movedFrom.has(r.key)) out.push({ kind: 'removed', key: r.key, date: r.date, name: r.name, surgery: r.surgery })
  for (const b of after) {
    const a = was.get(b.key)
    if (!a) continue
    const changes = FIELDS.filter((f) => f !== 'time' && a[f] !== b[f] && edits[b.key]?.[f] === undefined).map((field) => ({
      field,
      was: a[field],
      now: b[field],
    }))
    if (changes.length) out.push({ kind: 'changed', key: b.key, date: b.date, name: b.name, surgery: b.surgery, changes })
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.name.localeCompare(y.name))
}
