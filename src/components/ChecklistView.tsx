import { lazy, Suspense, useMemo, useState } from 'react'
import { sheetCsv, sheetTsv, weekRange } from '../checklist.ts'
import { addDaysTo, dayOfWeek } from '../dates.ts'
import { DAY_LABELS, shortDate } from '../format.ts'
import { useChecklist, useOrphans } from '../hooks.ts'
import { problemKey, problemSignature, problemText, splitProblems } from '../problems.ts'
import { useSources, useStore } from '../store.ts'
import { itemsOf, type Filter } from '../overview.ts'
import type { Row } from '../types.ts'
import { weekDays } from '../merge.ts'
import DetailDialog from './DetailDialog.tsx'
import { AgendaCard, CalendarCard } from './DataView.tsx'
import Icon from './Icon.tsx'
import RowDialog from './RowDialog.tsx'
import SourceDialog from './SourceDialog.tsx'
import WeekNav from './WeekNav.tsx'
import FilterBar from './FilterBar.tsx'
import OverviewView from './OverviewView.tsx'
import { NewsCard, Orphans } from './Review.tsx'

// FullCalendar es lo más pesado de la app: se baja solo al abrir la vista Calendario
const CalendarView = lazy(() => import('./CalendarView.tsx'))

export default function ChecklistView({ monday, setMonday }: { monday: string; setMonday: (monday: string) => void }) {
  const [viewing, setViewing] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [sourcing, setSourcing] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [mode, setMode] = useState<'resumen' | 'calendario'>('resumen')
  const hasSources = useSources((s) => !!s.agenda)
  const { rows, excluded, warnings, problems } = useChecklist(monday)
  const { setIncluded, addManualRow, removeManualRow, keepMine, news, setNews, ranges, setRange, acks, acknowledge, unacknowledge } = useStore()
  const range = weekRange(monday, ranges)
  const fullWeek = range.from === monday && range.to === addDaysTo(monday, 6)
  const orphans = useOrphans()

  const items = useMemo(() => itemsOf(rows, excluded, acks), [rows, excluded, acks])
  const unreadable = useMemo(() => splitProblems(problems, acks), [problems, acks])
  const flagsOf = (key: string) => items.find((i) => i.row.key === key)?.flags
  // los días que se arman (el rango elegido de la semana), para poder agregar una cirugía en cualquiera
  const rangeDays = weekDays(monday).filter((d) => d >= range.from && d <= range.to)
  const conflicted = rows.filter((r) => r.conflicts)
  const viewingRow = rows.find((r) => r.key === viewing)
  const editingRow = rows.find((r) => r.key === editing)
  const viewingFlags = viewing ? flagsOf(viewing) : undefined
  const sourcingRow = rows.find((r) => r.key === sourcing) ?? excluded.find((x) => x.row.key === sourcing)?.row

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
    a.href = URL.createObjectURL(new Blob([sheetCsv(rows)], { type: 'text/csv;charset=utf-8' }))
    a.download = `checklist-${range.from}_${range.to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  /** Reconoce las diferencias de la fila, si tiene alguna sin reconocer. */
  const ack = (key: string) => {
    const signature = flagsOf(key)?.signature
    if (signature) acknowledge(key, signature)
  }

  /** Agrega una cirugía vacía ese día y abre el formulario. */
  const add = (date: string) => setEditing(addManualRow(date))

  const remove = (r: Row) => (r.source === 'manual' ? removeManualRow(r.key) : setIncluded(r, false))

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
          <WeekNav monday={monday} onChange={setMonday} />
          <div role="group" aria-label="Vista" className="join w-full sm:w-auto">
            {(['resumen', 'calendario'] as const).map((m) => (
              <button key={m} className={`btn btn-sm join-item flex-1 capitalize sm:flex-none ${mode === m ? 'btn-primary' : ''}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 text-sm" role="group" aria-label="Días que se arman">
            <span className="text-base-content/60">Días</span>
            {(['from', 'to'] as const).map((bound) => (
              <label key={bound} className="flex items-center gap-1">
                <span className="sr-only">{bound === 'from' ? 'Desde' : 'Hasta'}</span>
                {bound === 'to' && <span className="text-base-content/60">a</span>}
                <select
                  className="select select-sm w-auto"
                  value={range[bound]}
                  onChange={(e) => {
                    const v = e.target.value
                    // si el extremo que se mueve pasa al otro, el otro lo acompaña
                    setRange(monday, bound === 'from' ? { from: v, to: v > range.to ? v : range.to } : { from: v < range.from ? v : range.from, to: v })
                  }}
                >
                  {weekDays(monday).map((d) => (
                    <option key={d} value={d}>
                      {DAY_LABELS[dayOfWeek(d)]} {shortDate(d)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {!fullWeek && (
              <button className="btn btn-sm btn-ghost" onClick={() => setRange(monday, null)}>
                Semana entera
              </button>
            )}
          </div>
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

      {unreadable.open.map((p) => (
        <div key={problemKey(p)} role="alert" className="alert alert-warning alert-soft flex-wrap items-center gap-2 text-sm text-base-content">
          <Icon name="warning" className="size-4" />
          <span className="min-w-0 flex-1">{problemText(p)}</span>
          <button className="btn btn-xs" title="Agrega una cirugía vacía ese día para que la cargues" onClick={() => setEditing(addManualRow(p.date))}>
            <Icon name="plus" /> Cargar a mano
          </button>
          <button className="btn btn-xs" title="Ya lo sé: no avisar hasta que el evento cambie en el calendar" onClick={() => acknowledge(problemKey(p), problemSignature(p))}>
            Reconocer
          </button>
        </div>
      ))}
      {unreadable.acked.length > 0 && (
        <details className="px-1 text-sm text-base-content/70">
          <summary className="cursor-pointer">Avisos reconocidos ({unreadable.acked.length})</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {unreadable.acked.map((p) => (
              <li key={problemKey(p)} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">{problemText(p)}</span>
                <button className="btn btn-xs" onClick={() => unacknowledge(problemKey(p))}>
                  Volver a avisar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {conflicted.length > 0 && (
        <div role="alert" className="alert alert-warning alert-soft items-center gap-2 text-sm text-base-content">
          <Icon name="warning" className="size-4" />
          <span className="flex-1">
            {conflicted.length} {conflicted.length === 1 ? 'cirugía difiere' : 'cirugías difieren'} de la agenda/el calendar: revisalas y confirmá cada una.
          </span>
          <button
            className="btn btn-xs"
            onClick={() => confirm('Se queda lo que escribiste en todas. ¿Seguir?') && conflicted.forEach((r) => keepMine(r.key, r.conflicts!))}
          >
            Dejar todo lo mío
          </button>
        </div>
      )}

      {orphans.length > 0 && <Orphans orphans={orphans} />}
      {news && news.items.length > 0 && <NewsCard news={news} onClose={() => setNews(null)} />}

      <FilterBar items={items} filter={filter} onFilter={setFilter} />

      {mode === 'resumen' && (
        <OverviewView days={rangeDays} rows={rows} items={items} filter={filter} onView={setViewing} onEdit={setEditing} onSource={setSourcing} onInclude={(r) => setIncluded(r, true)} onAck={ack} onAdd={add} />
      )}

      {mode === 'calendario' && (
        <Suspense fallback={<p className="py-8 text-center text-base-content/60">Cargando el calendario…</p>}>
          <CalendarView from={range.from} to={range.to} items={items} filter={filter} onView={setViewing} onSource={setSourcing} onAdd={add} />
        </Suspense>
      )}

      {viewingRow && viewingFlags && (
        <DetailDialog
          row={viewingRow}
          flags={viewingFlags}
          dayRows={rows.filter((r) => r.date === viewingRow.date)}
          onEdit={() => {
            setViewing(null)
            setEditing(viewingRow.key)
          }}
          onSource={() => setSourcing(viewingRow.key)}
          onAck={() => ack(viewingRow.key)}
          onUnack={() => unacknowledge(viewingRow.key)}
          onRemove={() => {
            setViewing(null)
            remove(viewingRow)
          }}
          onClose={() => setViewing(null)}
        />
      )}
      {sourcingRow && <SourceDialog row={sourcingRow} onClose={() => setSourcing(null)} />}
      {editingRow && <RowDialog row={editingRow} onClose={() => setEditing(null)} />}
      {toast && (
        <div className="toast toast-center toast-bottom mb-16 sm:mb-4">
          <div className="alert alert-success">{toast}</div>
        </div>
      )}
    </div>
  )
}
