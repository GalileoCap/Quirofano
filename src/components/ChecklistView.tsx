import { useMemo, useState } from 'react'
import { sheetCsv, sheetTsv } from '../checklist.ts'
import { addDaysTo, dayOfWeek, isoOf, mondayOf } from '../dates.ts'
import { DAY_LABELS, shortDate, weekLabel } from '../format.ts'
import { useChecklist } from '../hooks.ts'
import { useSources, useStore } from '../store.ts'
import type { Excluded, Row } from '../types.ts'
import { weekDays } from '../merge.ts'
import { AgendaCard, CalendarCard } from './DataView.tsx'
import Icon from './Icon.tsx'
import RowCard from './RowCard.tsx'
import RowDialog from './RowDialog.tsx'

/** La semana que se arma por defecto: la actual, y desde el sábado la que viene. */
function defaultMonday() {
  const today = isoOf(new Date())
  const dow = dayOfWeek(today)
  return mondayOf(dow === 6 ? addDaysTo(today, 2) : dow === 0 ? addDaysTo(today, 1) : today)
}

const REASON: Record<Excluded['reason'], string> = {
  suspended: 'Suspendida',
  'not-in-calendar': 'No está en el calendar',
  removed: 'Sacada a mano',
}

export default function ChecklistView() {
  const [monday, setMonday] = useState(defaultMonday)
  const [editing, setEditing] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const hasSources = useSources((s) => !!s.agenda)
  const { rows, excluded, warnings } = useChecklist(monday)
  const { moveRow, setIncluded, addManualRow, removeManualRow } = useStore()

  const days = useMemo(
    () =>
      weekDays(monday)
        .map((date) => ({ date, rows: rows.filter((r) => r.date === date) }))
        .filter((d) => d.rows.length),
    [monday, rows],
  )
  const editingRow = rows.find((r) => r.key === editing)

  const say = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sheetTsv(rows))
      say('Copiado: pegalo en la planilla')
    } catch {
      prompt('Copiá el checklist:', sheetTsv(rows))
    }
  }

  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + sheetCsv(rows)], { type: 'text/csv;charset=utf-8' }))
    a.download = `checklist-${monday}_${addDaysTo(monday, 6)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const remove = (r: Row) => (r.source === 'manual' ? removeManualRow(r.key) : setIncluded(r.key, false))

  if (!hasSources)
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <p className="text-center text-base-content/70">Para armar el checklist cargá la agenda quirúrgica y, si querés, el calendar.</p>
        <AgendaCard />
        <CalendarCard />
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="card card-border bg-base-100">
        <div className="card-body flex-row flex-wrap items-center gap-2 p-2.5 sm:p-3">
          <button className="btn btn-sm btn-square" aria-label="Semana anterior" onClick={() => setMonday(addDaysTo(monday, -7))}>
            <Icon name="chevronLeft" />
          </button>
          <h2 className="font-display min-w-0 flex-1 text-center text-lg font-semibold text-primary sm:flex-none sm:text-xl">{weekLabel(monday)}</h2>
          <button className="btn btn-sm btn-square" aria-label="Semana siguiente" onClick={() => setMonday(addDaysTo(monday, 7))}>
            <Icon name="chevronRight" />
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setMonday(defaultMonday())}>
            Hoy
          </button>
          <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
            <button className="btn btn-sm btn-primary flex-1 sm:flex-none" disabled={!rows.length} onClick={copy}>
              <Icon name="copy" /> Copiar<span className="hidden sm:inline"> para la planilla</span>
            </button>
            <button className="btn btn-sm flex-1 sm:flex-none" disabled={!rows.length} onClick={download}>
              <Icon name="download" /> CSV
            </button>
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div role="alert" className="alert alert-warning alert-soft flex-col items-start gap-1 text-sm text-base-content">
          {warnings.map((w) => (
            <p key={w} className="flex gap-1.5">
              <Icon name="warning" className="mt-0.5 size-4" />
              {w}
            </p>
          ))}
        </div>
      )}

      {!days.length && (
        <p className="py-8 text-center text-base-content/60">
          No hay cirugías esta semana{excluded.length ? ' (hay algunas sin incluir más abajo)' : ''}.
        </p>
      )}

      {days.map(({ date, rows: dayRows }) => {
        const keys = dayRows.map((r) => r.key)
        return (
          <section key={date} className="flex flex-col gap-2">
            <h3 className="flex items-baseline gap-2 px-1">
              <span className="font-display text-lg font-semibold italic text-primary">{DAY_LABELS[dayOfWeek(date)]}</span>
              <span className="text-sm text-base-content/60">
                {shortDate(date)} · {dayRows.length} {dayRows.length === 1 ? 'cirugía' : 'cirugías'}
              </span>
              <button className="btn btn-ghost btn-xs ml-auto" onClick={() => setEditing(addManualRow(date))}>
                <Icon name="plus" /> Agregar
              </button>
            </h3>
            <ul className="flex flex-col gap-2">
              {dayRows.map((r, i) => (
                <RowCard
                  key={r.key}
                  row={r}
                  first={i === 0}
                  last={i === dayRows.length - 1}
                  onMove={(dir) => moveRow(date, keys, r.key, dir)}
                  onEdit={() => setEditing(r.key)}
                  onRemove={() => remove(r)}
                />
              ))}
            </ul>
          </section>
        )
      })}

      {excluded.length > 0 && (
        <section className="card card-border bg-base-100">
          <div className="card-body gap-2 p-3">
            <h3 className="card-title text-base">Sin incluir ({excluded.length})</h3>
            <p className="text-xs text-base-content/60">
              Están en la agenda con fecha de esta semana pero no entran al checklist. Incluilas si corresponde.
            </p>
            <ul className="flex flex-col gap-1">
              {excluded.map(({ row, reason }) => (
                <li key={row.key} className="flex items-center gap-2 text-sm">
                  <span className="w-12 shrink-0 tabular-nums text-base-content/60">{shortDate(row.date)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold">{row.name}</span> · {row.surgery}
                  </span>
                  <span className="badge badge-sm badge-ghost hidden whitespace-nowrap sm:inline-flex">{REASON[reason]}</span>
                  <button className="btn btn-xs" onClick={() => setIncluded(row.key, true)}>
                    Incluir
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {editingRow && <RowDialog row={editingRow} onClose={() => setEditing(null)} />}
      {toast && (
        <div className="toast toast-center toast-bottom mb-16 sm:mb-4">
          <div className="alert alert-success">{toast}</div>
        </div>
      )}
    </div>
  )
}
