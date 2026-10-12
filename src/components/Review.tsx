import { FIELD_LABELS, shortDate } from '../format.ts'
import type { Novelty, Orphan } from '../review.ts'
import { useStore, type News } from '../store.ts'
import Icon from './Icon.tsx'

const KIND: Record<Novelty['kind'], { label: string; badge: string }> = {
  added: { label: 'Nueva', badge: 'badge-success' },
  moved: { label: 'Movida', badge: 'badge-info' },
  removed: { label: 'Ya no está', badge: 'badge-error' },
  changed: { label: 'Cambió', badge: 'badge-warning' },
}

/** Qué cambió en la última carga de agenda/calendar. Las nuevas ya están en el checklist; esto es para que se vea. */
export function NewsCard({ news, onClose }: { news: News; onClose: () => void }) {
  return (
    <section className="card card-border bg-base-100">
      <div className="card-body gap-2 p-3">
        <div className="flex items-center gap-2">
          <h3 className="card-title flex-1 text-base">Novedades de la última carga ({news.items.length})</h3>
          <button className="btn btn-xs btn-ghost" onClick={onClose}>
            Entendido
          </button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {news.items.map((n) => (
            <li key={`${n.kind}|${n.key}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className={`badge badge-sm badge-soft ${KIND[n.kind].badge}`}>{KIND[n.kind].label}</span>
              <span className="w-12 shrink-0 tabular-nums text-base-content/60">{shortDate(n.date)}</span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{n.name}</span> · {n.surgery}
                {n.from && <span className="text-base-content/60"> (era el {shortDate(n.from)})</span>}
                {n.changes?.map((c) => (
                  <span key={c.field} className="block text-xs text-base-content/70">
                    {FIELD_LABELS[c.field]}: <q>{c.was || 'vacío'}</q> → <q>{c.now || 'vacío'}</q>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Filas con cosas hechas a mano que ya no están en la agenda/el calendar: hay que decidir qué hacer con ellas. */
export function Orphans({ orphans }: { orphans: Orphan[] }) {
  const { moveOrphan, keepOrphan, dropOrphan } = useStore()
  return (
    <section className="card card-border border-warning bg-base-100">
      <div className="card-body gap-2 p-3">
        <h3 className="card-title text-base">
          <Icon name="warning" className="size-5 shrink-0 text-warning" /> Ya no están en la agenda/el calendar ({orphans.length})
        </h3>
        <p className="text-xs text-base-content/60">Tenías cosas escritas a mano en estas cirugías y ya no aparecen en el día en que las habías puesto.</p>
        <ul className="flex flex-col gap-2">
          {orphans.map((o) => (
            <li key={o.key} className="flex flex-col gap-1 rounded-box bg-base-200 p-2 text-sm">
              <div>
                <span className="mr-2 tabular-nums text-base-content/60">{shortDate(o.snap.date)}</span>
                <span className="font-semibold">{o.snap.name}</span> · {o.snap.surgery}
              </div>
              {Object.entries(o.edit).some(([, v]) => v) && (
                <div className="text-xs text-base-content/70">
                  Lo que escribiste:{' '}
                  {Object.entries(o.edit)
                    .filter(([, v]) => v)
                    .map(([f, v]) => `${FIELD_LABELS[f as keyof typeof FIELD_LABELS]}: ${v}`)
                    .join(' · ')}
                </div>
              )}
              {o.movedTo && (
                <div className="text-xs">
                  Aparece ahora el <span className="font-semibold">{shortDate(o.movedTo.date)}</span>.
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {o.movedTo && (
                  <button className="btn btn-xs btn-primary" onClick={() => moveOrphan(o)}>
                    Pasar lo mío al {shortDate(o.movedTo.date)}
                  </button>
                )}
                <button className="btn btn-xs" onClick={() => keepOrphan(o)}>
                  Dejarla el {shortDate(o.snap.date)} (a mano)
                </button>
                <button className="btn btn-xs btn-ghost text-error" onClick={() => dropOrphan(o.key)}>
                  Sacarla
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
