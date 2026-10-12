import { useMemo, useState } from 'react'
import { normName } from '../agenda.ts'
import { addDaysTo, mondayOf, today } from '../dates.ts'
import { longDate } from '../format.ts'
import { useAgenda } from '../hooks.ts'
import { classifyEvents, describeEvent, type EventStatus } from '../ics.ts'
import { useSources } from '../store.ts'
import Icon from './Icon.tsx'
import { AgendaCells, EventRaw } from './SourceParts.tsx'

const PAGE = 60
/** Desde cuándo se muestra por defecto: la semana pasada. */
const recent = () => addDaysTo(mondayOf(today()), -7)

const STATUS: Record<EventStatus['status'], { label: string; cls: string }> = {
  surgery: { label: 'Cirugía', cls: 'badge-primary badge-soft' },
  suspension: { label: 'Suspensión', cls: 'badge-secondary badge-soft' },
  problem: { label: 'Sin formato', cls: 'badge-warning' },
  ignored: { label: 'Ignorado', cls: 'badge-ghost' },
}

function Filters({ query, setQuery, recentOnly, setRecentOnly, children }: { query: string; setQuery: (q: string) => void; recentOnly: boolean; setRecentOnly: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="input input-sm flex w-full items-center gap-2">
        <Icon name="search" className="size-4 text-base-content/50" />
        <input className="grow" type="search" placeholder="Buscar por paciente, HC, cirugía…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="checkbox checkbox-xs" checked={recentOnly} onChange={(e) => setRecentOnly(e.target.checked)} />
          Solo desde la semana pasada
        </label>
        {children}
      </div>
    </div>
  )
}

function More({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  return (
    <div className="flex items-center justify-center gap-3 py-1 text-xs text-base-content/60">
      Mostrando {shown} de {total}
      {shown < total && (
        <button className="btn btn-xs" onClick={onMore}>
          Mostrar más
        </button>
      )}
    </div>
  )
}

function AgendaOriginals() {
  const file = useSources((s) => s.agenda)
  const rows = useAgenda()
  const [query, setQuery] = useState('')
  const [recentOnly, setRecentOnly] = useState(true)
  const [limit, setLimit] = useState(PAGE)

  const found = useMemo(() => {
    const q = normName(query)
    const from = recent()
    return rows
      .filter((r) => (!recentOnly || (r.date && r.date >= from)) && (!q || normName(r.cells.join(' ')).includes(q)))
      .toSorted((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.line - b.line)
  }, [rows, query, recentOnly])

  if (!file) return <p className="py-6 text-center text-base-content/60">Todavía no cargaste la agenda.</p>
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-base-content/70">
        {file.name}: {rows.length} filas con paciente. Cada fila se muestra como está en el CSV; el título dice la línea del archivo.
      </p>
      <Filters query={query} setQuery={setQuery} recentOnly={recentOnly} setRecentOnly={(v) => {
          setRecentOnly(v)
          setLimit(PAGE)
        }} />
      <ul className="flex flex-col gap-1">
        {found.slice(0, limit).map((r) => (
          <li key={r.line} className="collapse collapse-arrow card-border bg-base-100">
            <input type="checkbox" aria-label={`Ver la fila ${r.line}`} />
            <div className="collapse-title min-h-0 px-3 py-2 pe-8 text-sm">
              <span className="tabular-nums text-base-content/50">L{r.line}</span> ·{' '}
              {r.date ? longDate(r.date) : <span className="badge badge-xs badge-warning">fecha ilegible</span>} · <span className="font-semibold">{r.name || 'sin nombre'}</span>
              <span className="text-base-content/60"> · {r.hc} · {r.surgery}</span>
            </div>
            <div className="collapse-content px-3">
              <AgendaCells row={r} />
            </div>
          </li>
        ))}
      </ul>
      <More shown={Math.min(limit, found.length)} total={found.length} onMore={() => setLimit(limit + PAGE)} />
    </div>
  )
}

function CalendarOriginals() {
  const calendars = useSources((s) => s.calendars)
  const [query, setQuery] = useState('')
  const [recentOnly, setRecentOnly] = useState(true)
  const [showIgnored, setShowIgnored] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  const all = useMemo(() => calendars.flatMap((c) => c.events).toSorted((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)), [calendars])
  const found = useMemo(() => {
    const q = normName(query)
    const from = recent()
    return all
      .filter((e) => (!recentOnly || e.date >= from) && (!q || normName(`${e.title} ${e.description} ${e.calendar}`).includes(q)))
      .map((e) => ({ e, st: describeEvent(e) }))
  }, [all, query, recentOnly])
  const ignored = found.filter((x) => x.st.status === 'ignored').length
  const shown = showIgnored ? found : found.filter((x) => x.st.status !== 'ignored')

  if (!calendars.length) return <p className="py-6 text-center text-base-content/60">Todavía no cargaste ningún calendario.</p>
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-base-content/70">
        {calendars.map((c) => `${c.name}: ${c.events.length} eventos`).join(' · ')}. Se guardan solo los de los últimos 120 días; los cumpleaños no se cargan.
      </p>
      <Filters query={query} setQuery={setQuery} recentOnly={recentOnly} setRecentOnly={(v) => {
          setRecentOnly(v)
          setLimit(PAGE)
        }}>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="checkbox checkbox-xs" checked={showIgnored} onChange={(e) => setShowIgnored(e.target.checked)} />
          Mostrar lo que se ignoró ({ignored})
        </label>
      </Filters>
      <ul className="flex flex-col gap-1">
        {shown.slice(0, limit).map(({ e, st }, i) => {
          const read = classifyEvents([e]).events[0]
          return (
            <li key={`${e.calendar}|${e.date}|${e.title}|${i}`} className="collapse collapse-arrow card-border bg-base-100">
              <input type="checkbox" aria-label={`Ver el evento ${e.title}`} />
              <div className="collapse-title min-h-0 px-3 py-2 pe-8 text-sm">
                <span className="tabular-nums text-base-content/60">{longDate(e.date)}</span> · <span className={`badge badge-xs ${STATUS[st.status].cls}`}>{STATUS[st.status].label}</span> ·{' '}
                <span className="break-words font-semibold">{e.title}</span>
              </div>
              <div className="collapse-content flex flex-col gap-2 px-3">
                <EventRaw event={e} />
                <p className="text-xs">
                  <span className="text-base-content/60">Qué hizo la app: </span>
                  {st.reason}
                  {read && (
                    <span className="text-base-content/70">
                      {' '}
                      — paciente «{read.name}»{read.hc && `, HC ${read.hc}`}
                      {read.surgeon && `, cirujano ${read.surgeon}`}
                      {read.eye && `, ${read.eye}`}
                    </span>
                  )}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
      <More shown={Math.min(limit, shown.length)} total={shown.length} onMore={() => setLimit(limit + PAGE)} />
    </div>
  )
}

/** La agenda y el calendar tal como se cargaron, para poder contrastar el checklist con lo original. */
export default function OriginalsView() {
  const [kind, setKind] = useState<'agenda' | 'calendar'>('agenda')
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" className="tabs tabs-box self-start">
        {(['agenda', 'calendar'] as const).map((k) => (
          <button key={k} role="tab" className={`tab ${kind === k ? 'tab-active' : ''}`} onClick={() => setKind(k)}>
            {k === 'agenda' ? 'Agenda' : 'Calendar'}
          </button>
        ))}
      </div>
      {kind === 'agenda' ? <AgendaOriginals /> : <CalendarOriginals />}
    </div>
  )
}
