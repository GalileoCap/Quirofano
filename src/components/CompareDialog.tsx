import { useMemo, useState } from 'react'
import type { DayRange } from '../checklist.ts'
import { compareSheet, parseSheet, type Change, type Minor, type Sheet, type Unread } from '../compare.ts'
import { dayOfWeek, mondayOf } from '../dates.ts'
import { DAY_LABELS, FIELD_LABELS, shortDate } from '../format.ts'
import { agendaProblemKey, agendaProblemSignature, problemKey, problemSignature } from '../problems.ts'
import { useStore } from '../store.ts'
import type { AgendaRow, CalProblem, Excluded, Row } from '../types.ts'
import FileDrop from './FileDrop.tsx'

/** El lunes de la semana que más cirugías tiene en el checklist cargado. */
function weekOf(sheet: Sheet): string | null {
  const count = new Map<string, number>()
  for (const r of sheet.rows) count.set(mondayOf(r.date), (count.get(mondayOf(r.date)) ?? 0) + 1)
  return [...count].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

const PRESENCE: Record<'missing' | 'extra', { label: string; badge: string }> = {
  missing: { label: 'Falta en la app', badge: 'badge-error' },
  extra: { label: 'Sobra en la app', badge: 'badge-warning' },
}

const MINOR_LABELS: Record<Minor, string> = {
  manual: 'se escribe a mano',
  format: 'escrito distinto',
  detail: 'uno dice más',
  blank: 'el checklist no lo trae',
}

const dayTitle = (date: string) => `${DAY_LABELS[dayOfWeek(date)]} ${shortDate(date)}`

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Lo que no se pudo leer, dicho para la persona. */
const unreadText = (u: Unread) =>
  u.kind === 'calendar'
    ? `No pude leer el evento «${u.problem.title}» (${u.problem.calendar}, ${dm(u.problem.date)}) y parece ser esta.`
    : `La fila ${u.row.line} de la agenda tiene la fecha rota («${u.row.cells[1] ?? ''}») y parece ser esta.`

/** Qué hace aplicar un cambio de presencia, dicho para la persona. */
function presenceText(c: Exclude<Change, { kind: 'field' }>) {
  if (c.kind === 'extra') return { who: c.row, action: c.row.source === 'manual' ? 'Aplicar la borra.' : 'Aplicar la pasa a Sin incluir.' }
  if (c.excluded) return { who: c.sheet.values, action: 'Está en Sin incluir: aplicar la incluye.' }
  if (c.unread) return { who: c.sheet.values, action: `${unreadText(c.unread)} Aplicar la agrega a mano con los datos del checklist y reconoce el aviso.` }
  return { who: c.sheet.values, action: 'Aplicar la agrega a mano con los datos del checklist.' }
}

/** Un campo distinto: lo de la app y lo del checklist. */
function FieldLine({ c, checked, onToggle }: { c: Extract<Change, { kind: 'field' }>; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input type="checkbox" className="checkbox checkbox-sm mt-0.5" checked={checked} onChange={onToggle} />
      <span className="min-w-0 flex-1">
        {FIELD_LABELS[c.field]}: app {c.mine ? <q>{c.mine}</q> : <i className="text-base-content/60">vacío</i>} → checklist{' '}
        {c.theirs ? <q className="font-semibold">{c.theirs}</q> : <i className="font-semibold">vacío</i>}
        {c.minor && <span className="ml-1.5 text-xs text-base-content/60">({MINOR_LABELS[c.minor]})</span>}
      </span>
    </label>
  )
}

type FieldChange = Extract<Change, { kind: 'field' }>

/** Los campos distintos de cada cirugía, agrupados por fila de la app. */
function FieldRows({ changes, selected, toggle }: { changes: FieldChange[]; selected: Set<string>; toggle: (id: string) => void }) {
  const rows = [...new Set(changes.map((c) => c.row))]
  return rows.map((r) => (
    <div key={r.key} className="flex flex-col gap-1 rounded-box bg-base-200 p-2 text-sm">
      <span className="font-semibold">
        {r.name || 'Sin nombre'}
        {r.surgery && <span className="font-normal"> · {r.surgery}</span>}
      </span>
      {changes
        .filter((c) => c.row === r)
        .map((c) => (
          <FieldLine key={c.id} c={c} checked={selected.has(c.id)} onToggle={() => toggle(c.id)} />
        ))}
    </div>
  ))
}

/**
 * Compara un checklist armado afuera con el que arma la app y deja aplicar las diferencias que se tilden. El checklist
 * cargado vive solo mientras el diálogo está abierto: no se guarda en el navegador.
 */
export default function CompareDialog({
  monday,
  setMonday,
  rows,
  excluded,
  range,
  problems,
  brokenAgenda,
  onClose,
}: {
  monday: string
  setMonday: (monday: string) => void
  rows: Row[]
  excluded: Excluded[]
  range: DayRange
  /** Los eventos del calendar de la semana que no se pudieron leer */
  problems: CalProblem[]
  /** Las filas de la agenda con la fecha rota */
  brokenAgenda: AgendaRow[]
  onClose: () => void
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [applied, setApplied] = useState<string | null>(null)
  const comparison = useMemo(() => (sheet ? compareSheet(sheet, rows, excluded, range, { problems, agenda: brokenAgenda }) : null), [sheet, rows, excluded, range, problems, brokenAgenda])

  const load = async (files: File[]) => {
    const file = files[0]
    if (!file) return { ok: false, message: 'No elegiste ningún archivo.' }
    const parsed = parseSheet(await file.text())
    if (!parsed?.rows.length) return { ok: false, message: 'Ese archivo no parece un checklist: le falta la cabecera con FECHA y PACIENTE, o no tiene cirugías.' }
    setSheet(parsed)
    setSelected(new Set())
    setApplied(null)
    const week = weekOf(parsed)
    if (week && week !== monday) setMonday(week)
    return { ok: true, message: `Leí ${parsed.rows.length} cirugías de ${file.name}${week && week !== monday ? `. Pasé a la semana del ${shortDate(week)}` : ''}.` }
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const changes = comparison?.changes ?? []
  const chosen = changes.filter((c) => selected.has(c.id))
  // las menores van aparte y plegadas: no dicen que la app armó mal la cirugía
  const major = changes.filter((c) => c.kind !== 'field' || !c.minor)
  const minor = changes.filter((c): c is FieldChange => c.kind === 'field' && !!c.minor)

  const apply = () => {
    const st = useStore.getState()
    for (const c of chosen) {
      if (c.kind === 'field') st.setEdit(c.row, c.field, c.theirs)
      else if (c.kind === 'missing') {
        if (c.excluded) st.setIncluded(c.excluded, true)
        else {
          st.addManualRow(c.date, c.sheet.values)
          if (c.unread?.kind === 'calendar') st.acknowledge(problemKey(c.unread.problem), problemSignature(c.unread.problem))
          else if (c.unread) st.acknowledge(agendaProblemKey(c.unread.row), agendaProblemSignature(c.unread.row))
        }
      } else if (c.row.source === 'manual') st.removeManualRow(c.row.key)
      else st.setIncluded(c.row, false)
    }
    setApplied(`Apliqué ${chosen.length} ${chosen.length === 1 ? 'cambio' : 'cambios'}.`)
    setSelected(new Set())
  }

  const days = [...new Set(major.map((c) => c.date))]
  const minorDays = [...new Set(minor.map((c) => c.date))]

  return (
    <dialog className="modal modal-open modal-bottom sm:modal-middle" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box flex max-w-2xl flex-col gap-3">
        <h3 className="text-lg font-bold">Comparar con un checklist</h3>
        <p className="text-sm text-base-content/70">
          Cargá un checklist armado afuera (la planilla o un CSV que bajó la app) para ver en qué difiere del que arma la app. No se guarda: al cerrar se descarta. Nada se aplica hasta
          que lo tildes.
        </p>
        <FileDrop accept=".csv,text/csv" label="Elegí el checklist (.csv)" onFiles={load} />

        {sheet && comparison && (
          <>
            <div className="flex flex-col gap-1 text-sm">
              <p>
                {comparison.equal} {comparison.equal === 1 ? 'cirugía igual' : 'cirugías iguales'} · {comparison.minorOnly} solo con diferencias menores · {major.length}{' '}
                {major.length === 1 ? 'diferencia' : 'diferencias'}
                {minor.length > 0 && <span className="text-base-content/60"> (y {minor.length} menores)</span>}
              </p>
              {sheet.ignored.length > 0 && <p className="text-xs text-base-content/60">No se comparan (la app no tiene esas columnas): {sheet.ignored.join(', ')}.</p>}
              {comparison.outside.length > 0 && (
                <p className="text-xs text-base-content/60">
                  {comparison.outside.length} {comparison.outside.length === 1 ? 'cirugía cae' : 'cirugías caen'} fuera de los días de esta semana y no se comparan.
                </p>
              )}
              <p className="text-xs text-base-content/60">El orden dentro de cada día no se compara.</p>
              {applied && (
                <p role="status" className="text-success-content">
                  {applied}
                </p>
              )}
            </div>

            {changes.length > 0 && (
              <div className="flex gap-2">
                <button className="btn btn-xs" disabled={!major.length} onClick={() => setSelected((s) => new Set([...s, ...major.map((c) => c.id)]))}>
                  Tildar todo
                </button>
                <button className="btn btn-xs btn-ghost" disabled={!selected.size} onClick={() => setSelected(new Set())}>
                  Destildar
                </button>
              </div>
            )}

            {days.map((date) => {
              const today = major.filter((c) => c.date === date)
              return (
                <section key={date} className="flex flex-col gap-1.5">
                  <h4 className="font-display text-base font-semibold italic">{dayTitle(date)}</h4>
                  {today.map((c) => {
                    if (c.kind === 'field') return null
                    const { who, action } = presenceText(c)
                    return (
                      <label key={c.id} className="flex cursor-pointer items-start gap-2 rounded-box bg-base-200 p-2 text-sm">
                        <input type="checkbox" className="checkbox checkbox-sm mt-0.5" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                        <span className="min-w-0 flex-1">
                          <span className={`badge badge-sm badge-soft mr-1.5 ${PRESENCE[c.kind].badge}`}>{PRESENCE[c.kind].label}</span>
                          <span className="font-semibold">{who.name || 'Sin nombre'}</span>
                          {who.surgery && <> · {who.surgery}</>}
                          {c.otherDate && <span className="text-base-content/70"> ({c.kind === 'missing' ? 'la app la tiene' : 'el checklist la tiene'} el {shortDate(c.otherDate)})</span>}
                          <span className="block text-xs text-base-content/60">{action}</span>
                        </span>
                      </label>
                    )
                  })}
                  <FieldRows changes={today.filter((c) => c.kind === 'field')} selected={selected} toggle={toggle} />
                </section>
              )
            })}

            {minor.length > 0 && (
              <details className="rounded-box border border-base-300 px-3 py-2 text-sm">
                <summary className="cursor-pointer">
                  {minor.length} {minor.length === 1 ? 'diferencia menor' : 'diferencias menores'}
                </summary>
                <p className="mt-1 text-xs text-base-content/60">
                  No dicen que la app armó mal la cirugía: columnas que se escriben a mano, el mismo valor escrito distinto, uno que dice más que el otro o algo que el checklist no trae.
                  "Tildar todo" no las tilda.
                </p>
                <button className="btn btn-xs mt-2" onClick={() => setSelected((s) => new Set([...s, ...minor.map((c) => c.id)]))}>
                  Tildar las menores
                </button>
                {minorDays.map((date) => (
                  <section key={date} className="mt-2 flex flex-col gap-1.5">
                    <h4 className="font-display text-sm font-semibold italic">{dayTitle(date)}</h4>
                    <FieldRows changes={minor.filter((c) => c.date === date)} selected={selected} toggle={toggle} />
                  </section>
                ))}
              </details>
            )}
          </>
        )}

        {/* pegado abajo y tapando también el relleno inferior del modal, para que no se vea la lista pasar por debajo */}
        <div className="modal-action sticky -bottom-6 -mx-6 -mb-6 mt-0 bg-base-100 px-6 pt-2 pb-6">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          <button className="btn btn-sm btn-primary" disabled={!chosen.length} onClick={apply}>
            Aplicar {chosen.length || ''}
          </button>
        </div>
      </div>
    </dialog>
  )
}
