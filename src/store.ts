import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Edits } from './checklist.ts'
import type { RawEvent } from './ics.ts'
import { snapOf, type Novelty, type Orphan } from './review.ts'
import type { Conflict, Field, Row, Snap } from './types.ts'
import { FIELDS } from './types.ts'

export type CalendarFile = { name: string; events: RawEvent[] }

export type UserData = {
  /** Lo escrito a mano sobre cada fila */
  edits: Edits
  /** Lo que decían la agenda/el calendar la última vez que se confirmó cada campo escrito a mano */
  bases: Edits
  /** Cómo era cada fila tocada, para reconocerla si desaparece de las fuentes */
  snaps: Record<string, Snap>
  /** Orden elegido de cada día (claves de fila) */
  order: Record<string, string[]>
  /** true = incluir una fila que el cruce dejó afuera · false = sacar una que había entrado */
  included: Record<string, boolean>
  /** Pacientes agregados a mano */
  manualRows: Row[]
}

/** Qué cambió en la última carga de agenda/calendar. */
export type News = { at: string; items: Novelty[] }

type SourceState = {
  agenda: { name: string; text: string } | null
  calendars: CalendarFile[]
}

type SourceActions = {
  setAgenda: (name: string, text: string) => void
  addCalendars: (files: CalendarFile[]) => void
  removeCalendar: (name: string) => void
  removeAgenda: () => void
}

type Actions = {
  /** Escribe `value` en un campo de la fila; la primera vez anota qué decían las fuentes, así se ve si después cambian. */
  setEdit: (row: Row, field: Field, value: string) => void
  /** Me quedo con lo mío: lo escrito pasa a ser lo confirmado frente a lo que dicen hoy las fuentes. */
  keepMine: (key: string, conflicts: Conflict[]) => void
  /** Uso lo de la agenda/el calendar: se descarta lo escrito en esos campos. */
  useSource: (key: string, conflicts: Conflict[]) => void
  /** Una fila con trabajo manual que ya no está en las fuentes: llevarlo a la fila nueva / dejarla como agregada a mano / sacarla */
  moveOrphan: (o: Orphan) => void
  keepOrphan: (o: Orphan) => void
  dropOrphan: (key: string) => void
  news: News | null
  setNews: (news: News | null) => void
  /** Cambia de lugar la fila `key` dentro del día (dir −1 sube, +1 baja). `keys` es el orden actual de ese día. */
  moveRow: (date: string, keys: string[], key: string, dir: -1 | 1) => void
  setIncluded: (row: Row, value: boolean) => void
  addManualRow: (date: string) => string
  removeManualRow: (key: string) => void
  importUserData: (data: Partial<UserData>) => void
  /** Borra lo escrito a mano; la agenda y los calendarios quedan */
  clearUserData: () => void
}

const emptyUser: UserData = { edits: {}, bases: {}, snaps: {}, order: {}, included: {}, manualRows: [] }

const without = <T,>(o: Record<string, T>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key))

/** Saca todo rastro de una fila (lo escrito, lo confirmado, su foto y su lugar en el orden del día). */
const forget = (s: UserData, key: string, date: string): Partial<UserData> => ({
  edits: without(s.edits, key),
  bases: without(s.bases, key),
  snaps: without(s.snaps, key),
  included: without(s.included, key),
  order: s.order[date] ? { ...s.order, [date]: s.order[date].filter((k) => k !== key) } : s.order,
})

// todo queda en este navegador: nada de pacientes sale a ningún servidor.
// Si el almacenamiento está lleno o bloqueado la app sigue andando, solo que no recuerda nada al cerrarla.
const safeStorage = createJSONStorage(() => ({
  getItem: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch (e) {
      console.warn('No pude guardar en este navegador', e)
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* nada que hacer */
    }
  },
}))

/** La agenda y los calendarios cargados: en su propio almacenamiento porque pesan ~1 MB y casi nunca cambian. */
export const useSources = create<SourceState & SourceActions>()(
  persist(
    (set) => ({
      agenda: null,
      calendars: [],
      setAgenda: (name, text) => set({ agenda: { name, text } }),
      removeAgenda: () => set({ agenda: null }),
      addCalendars: (files) =>
        set((s) => ({ calendars: [...s.calendars.filter((c) => !files.some((f) => f.name === c.name)), ...files] })),
      removeCalendar: (name) => set((s) => ({ calendars: s.calendars.filter((c) => c.name !== name) })),
    }),
    {
      name: 'quiro-sources-v1',
      version: 2,
      storage: safeStorage,
      // v1 guardaba el .ics entero; ahora se guardan solo los eventos que sirven (hay que volver a cargar los calendarios)
      migrate: (persisted) => ({ agenda: (persisted as { agenda?: SourceState['agenda'] }).agenda ?? null, calendars: [] }),
    },
  ),
)

/** Todo lo que se escribe o se decide a mano sobre el checklist. */
export const useStore = create<UserData & Actions>()(
  persist(
    (set) => ({
      ...emptyUser,
      news: null,
      setNews: (news) => set({ news }),
      setEdit: (row, field, value) =>
        set((s) => {
          const key = row.key
          const next: Partial<UserData> = { edits: { ...s.edits, [key]: { ...s.edits[key], [field]: value } } }
          if (row.source === 'manual') return next
          if (s.bases[key]?.[field] === undefined) next.bases = { ...s.bases, [key]: { ...s.bases[key], [field]: (row.src ?? row)[field] } }
          if (!s.snaps[key]) next.snaps = { ...s.snaps, [key]: snapOf(row) }
          return next
        }),
      keepMine: (key, conflicts) =>
        set((s) => ({ bases: { ...s.bases, [key]: { ...s.bases[key], ...Object.fromEntries(conflicts.map((c) => [c.field, c.now])) } } })),
      useSource: (key, conflicts) =>
        set((s) => {
          const drop = (e: Edits[string] = {}) => Object.fromEntries(Object.entries(e).filter(([f]) => !conflicts.some((c) => c.field === f)))
          return { edits: { ...s.edits, [key]: drop(s.edits[key]) }, bases: { ...s.bases, [key]: drop(s.bases[key]) } }
        }),
      moveOrphan: (o) =>
        set((s) => {
          const to = o.movedTo
          if (!to) return s
          const next = forget(s, o.key, o.snap.date)
          return {
            ...next,
            // lo escrito (y lo que ya estaba confirmado) viaja a la fila nueva; si difiere de lo que dicen las fuentes se vuelve a avisar
            edits: { ...next.edits, [to.key]: { ...s.edits[o.key] } },
            bases: { ...next.bases, [to.key]: { ...s.bases[o.key] } },
            snaps: { ...next.snaps, [to.key]: snapOf(to) },
            included: o.included ? { ...next.included, [to.key]: true } : next.included,
          }
        }),
      keepOrphan: (o) =>
        set((s) => {
          const key = `manual-${crypto.randomUUID()}`
          const row: Row = { ...o.snap, ...s.edits[o.key], key, date: o.snap.date, source: 'manual' }
          return { ...forget(s, o.key, o.snap.date), manualRows: [...s.manualRows, row] }
        }),
      dropOrphan: (key) => set((s) => forget(s, key, s.snaps[key]?.date ?? '')),
      moveRow: (date, keys, key, dir) =>
        set((s) => {
          const i = keys.indexOf(key)
          const j = i + dir
          if (i < 0 || j < 0 || j >= keys.length) return s
          const next = [...keys]
          ;[next[i], next[j]] = [next[j], next[i]]
          return { order: { ...s.order, [date]: next } }
        }),
      setIncluded: (row, value) =>
        set((s) => ({ included: { ...s.included, [row.key]: value }, snaps: s.snaps[row.key] || row.source === 'manual' ? s.snaps : { ...s.snaps, [row.key]: snapOf(row) } })),
      addManualRow: (date) => {
        const key = `manual-${crypto.randomUUID()}`
        const row = { ...(Object.fromEntries(FIELDS.map((f) => [f, ''])) as Record<Field, string>), key, date, source: 'manual' as const }
        set((s) => ({ manualRows: [...s.manualRows, row] }))
        return key
      },
      removeManualRow: (key) => set((s) => ({ manualRows: s.manualRows.filter((r) => r.key !== key) })),
      importUserData: (data) => set({ ...emptyUser, ...data }),
      clearUserData: () => set({ ...emptyUser }),
    }),
    {
      name: 'quiro-v1',
      version: 1,
      storage: safeStorage,
      // en el merge de datos viejos, los ajustes nuevos toman su valor por defecto; la hora de inicio del día ya no existe
      merge: (persisted, current) => {
        const { dayStart: _old, ...saved } = persisted as Partial<UserData> & { dayStart?: string }
        return { ...current, ...saved }
      },
    },
  ),
)
