import { useMemo, useState } from 'react'
import type { DayRange } from '../checklist.ts'
import { compareSheet, parseSheet, type Change, type Sheet } from '../compare.ts'
import { dayOfWeek, mondayOf } from '../dates.ts'
import { DAY_LABELS, FIELD_LABELS, shortDate } from '../format.ts'
import { useStore } from '../store.ts'
import type { Excluded, Row } from '../types.ts'
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

/** Qué hace aplicar un cambio de presencia, dicho para la persona. */
function presenceText(c: Exclude<Change, { kind: 'field' }>) {
  if (c.kind === 'extra') return { who: c.row, action: c.row.source === 'manual' ? 'Aplicar la borra.' : 'Aplicar la pasa a Sin incluir.' }
  return { who: c.sheet.values, action: c.excluded ? 'Está en Sin incluir: aplicar la incluye.' : 'Aplicar la agrega a mano con los datos del checklist.' }
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
  onClose,
}: {
  monday: string
  setMonday: (monday: string) => void
  rows: Row[]
  excluded: Excluded[]
  range: DayRange
  onClose: () => void
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [applied, setApplied] = useState<string | null>(null)
  const comparison = useMemo(() => (sheet ? compareSheet(sheet, rows, excluded, range) : null), [sheet, rows, excluded, range])

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

  const apply = () => {
    const st = useStore.getState()
    for (const c of chosen) {
      if (c.kind === 'field') st.setEdit(c.row, c.field, c.theirs)
      else if (c.kind === 'missing') {
        if (c.excluded) st.setIncluded(c.excluded, true)
        else st.addManualRow(c.date, c.sheet.values)
      } else if (c.row.source === 'manual') st.removeManualRow(c.row.key)
      else st.setIncluded(c.row, false)
    }
    setApplied(`Apliqué ${chosen.length} ${chosen.length === 1 ? 'cambio' : 'cambios'}.`)
    setSelected(new Set())
  }

  const days = [...new Set(changes.map((c) => c.date))]

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
                {comparison.equal} {comparison.equal === 1 ? 'cirugía igual' : 'cirugías iguales'} · {changes.length} {changes.length === 1 ? 'diferencia' : 'diferencias'}
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
                <button className="btn btn-xs" onClick={() => setSelected(new Set(changes.map((c) => c.id)))}>
                  Tildar todo
                </button>
                <button className="btn btn-xs btn-ghost" disabled={!selected.size} onClick={() => setSelected(new Set())}>
                  Destildar
                </button>
              </div>
            )}

            {days.map((date) => {
              const today = changes.filter((c) => c.date === date)
              const fieldRows = [...new Set(today.flatMap((c) => (c.kind === 'field' ? [c.row] : [])))]
              return (
                <section key={date} className="flex flex-col gap-1.5">
                  <h4 className="font-display text-base font-semibold italic">
                    {DAY_LABELS[dayOfWeek(date)]} {shortDate(date)}
                  </h4>
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
                  {fieldRows.map((r) => (
                    <div key={r.key} className="flex flex-col gap-1 rounded-box bg-base-200 p-2 text-sm">
                      <span className="font-semibold">
                        {r.name || 'Sin nombre'}
                        {r.surgery && <span className="font-normal"> · {r.surgery}</span>}
                      </span>
                      {today.map(
                        (c) =>
                          c.kind === 'field' &&
                          c.row === r && (
                            <label key={c.id} className="flex cursor-pointer items-start gap-2">
                              <input type="checkbox" className="checkbox checkbox-sm mt-0.5" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                              <span className="min-w-0 flex-1">
                                {FIELD_LABELS[c.field]}: app {c.mine ? <q>{c.mine}</q> : <i className="text-base-content/60">vacío</i>} → checklist{' '}
                                {c.theirs ? <q className="font-semibold">{c.theirs}</q> : <i className="font-semibold">vacío</i>}
                              </span>
                            </label>
                          ),
                      )}
                    </div>
                  ))}
                </section>
              )
            })}
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
