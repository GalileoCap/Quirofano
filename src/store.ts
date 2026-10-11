import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Edits } from './checklist.ts'
import type { Field, Row } from './types.ts'
import { FIELDS } from './types.ts'

export type CalendarFile = { name: string; text: string }

export type UserData = {
  /** Lo escrito a mano sobre cada fila */
  edits: Edits
  /** Orden elegido de cada día (claves de fila) */
  order: Record<string, string[]>
  /** true = incluir una fila que el cruce dejó afuera · false = sacar una que había entrado */
  included: Record<string, boolean>
  /** Pacientes agregados a mano */
  manualRows: Row[]
  /** Hora de la primera cirugía del día, 'HH:MM' */
  dayStart: string
}

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
  setEdit: (key: string, field: Field, value: string) => void
  /** Cambia de lugar la fila `key` dentro del día (dir −1 sube, +1 baja). `keys` es el orden actual de ese día. */
  moveRow: (date: string, keys: string[], key: string, dir: -1 | 1) => void
  setIncluded: (key: string, value: boolean) => void
  addManualRow: (date: string) => string
  removeManualRow: (key: string) => void
  setDayStart: (value: string) => void
  importUserData: (data: Partial<UserData>) => void
  /** Borra lo escrito a mano; la agenda y los calendarios quedan */
  clearUserData: () => void
}

const emptyUser: UserData = { edits: {}, order: {}, included: {}, manualRows: [], dayStart: '08:00' }

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
    { name: 'quiro-sources-v1', version: 1, storage: safeStorage },
  ),
)

/** Todo lo que se escribe o se decide a mano sobre el checklist. */
export const useStore = create<UserData & Actions>()(
  persist(
    (set) => ({
      ...emptyUser,
      setEdit: (key, field, value) => set((s) => ({ edits: { ...s.edits, [key]: { ...s.edits[key], [field]: value } } })),
      moveRow: (date, keys, key, dir) =>
        set((s) => {
          const i = keys.indexOf(key)
          const j = i + dir
          if (i < 0 || j < 0 || j >= keys.length) return s
          const next = [...keys]
          ;[next[i], next[j]] = [next[j], next[i]]
          return { order: { ...s.order, [date]: next } }
        }),
      setIncluded: (key, value) => set((s) => ({ included: { ...s.included, [key]: value } })),
      addManualRow: (date) => {
        const key = `manual-${crypto.randomUUID()}`
        const row = { ...(Object.fromEntries(FIELDS.map((f) => [f, ''])) as Record<Field, string>), key, date, source: 'manual' as const }
        set((s) => ({ manualRows: [...s.manualRows, row] }))
        return key
      },
      removeManualRow: (key) => set((s) => ({ manualRows: s.manualRows.filter((r) => r.key !== key) })),
      setDayStart: (dayStart) => set({ dayStart }),
      importUserData: (data) => set({ ...emptyUser, ...data }),
      clearUserData: () => set({ ...emptyUser }),
    }),
    {
      name: 'quiro-v1',
      version: 1,
      storage: safeStorage,
      // en el merge de datos viejos, los ajustes nuevos toman su valor por defecto
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<UserData>) }),
    },
  ),
)
