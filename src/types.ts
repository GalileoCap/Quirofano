/** Una cirugía cargada en la hoja "AGENDA QUIRURGICA" (una fila del formulario). */
export type AgendaRow = {
  /** Número de fila en el CSV (1 = encabezado), para poder señalarla */
  line: number
  /** Marca temporal del formulario, 'YYYY-MM-DD' (o null si no se puede leer) */
  stamp: string | null
  /** Fecha de la cirugía, 'YYYY-MM-DD' (null si la celda está rota) */
  date: string | null
  name: string
  hc: string
  /** Minutos; null si no se pudo leer */
  duration: number | null
  surgery: string
  surgeon: string
  assistant: string
  eye: string
  /** Quién es la persona de contacto (esposa, hija…) */
  contact: string
  phone: string
  supplies: string
  diopters: string
  anesthesia: string
  pedidoB: string
  notes: string
  age: string
  dni: string
  /** Las celdas de la fila tal como están en el CSV, sin interpretar */
  cells: string[]
}

export type CalendarKind = 'surgery' | 'suspension'

/** Un evento del calendar con el formato "CIRUGIA / PACIENTE / CIRUJANO / AYUDANTE". */
export type CalEvent = {
  date: string
  title: string
  /** Nombre del calendario de origen (si el archivo lo trae) */
  calendar: string
  kind: CalendarKind
  surgery: string
  name: string
  surgeon: string
  assistant: string
  /** De la descripción del evento ("OJO / DIOPTRÍAS / HC / TELÉFONO"); vacío si no la trae */
  eye: string
  diopters: string
  hc: string
  phone: string
  /** La descripción del evento tal como viene en el .ics */
  description: string
}

/** Un evento de un calendario de cirugías que no tiene el formato esperado (se avisa en vez de ignorarlo). */
export type CalProblem = { date: string; title: string; calendar: string }

export type Source = 'both' | 'agenda' | 'calendar' | 'manual'

/** Los campos de una fila del checklist, en el orden de la planilla. */
export const FIELDS = [
  'name',
  'hc',
  'duration',
  'time',
  'surgery',
  'surgeon',
  'assistant',
  'eye',
  'contact',
  'phone',
  'diopters',
  'anesthesia',
  'notes',
  'dni',
  'prequi',
  'hcCheck',
  'extra',
  'quirofano',
  'quiroDia',
] as const
export type Field = (typeof FIELDS)[number]

export type Fields = Record<Field, string>

/**
 * Un campo escrito a mano que difiere de la agenda/el calendar y todavía no se confirmó.
 * `was` es lo que decían las fuentes la última vez que se miró (undefined = edición vieja que nunca se confirmó).
 */
export type Conflict = { field: Field; mine: string; was?: string; now: string }

/** Columnas que solo existen en el checklist (las fuentes no las traen): escribirlas no es una diferencia. */
export const MANUAL_FIELDS: readonly Field[] = ['time', 'prequi', 'hcCheck', 'extra', 'quirofano', 'quiroDia']

/** De dónde salió una fila del cruce: las fuentes que la armaron y qué fuente puso cada campo. */
export type Origin = {
  agenda?: AgendaRow
  event?: CalEvent
  /** Cómo se encontró la fila de la agenda para el evento: por HC o por nombre */
  by?: 'hc' | 'name'
  /** La fuente que no tiene la cirugía, cuando esa fuente sí tiene cirugías ese día (diferencia entre agenda y calendar) */
  missing?: 'agenda' | 'calendar'
  /** Fuente de cada campo que tiene valor (el horario y las columnas a mano no figuran) */
  fields: Partial<Record<Field, 'agenda' | 'calendar'>>
}

/** Una fila del checklist: datos de la agenda + columnas que se completan a mano. */
export type Row = Fields & {
  /** Identifica la fila entre cambios de agenda: fecha + paciente (+ cirugía si hay dos el mismo día) */
  key: string
  date: string
  source: Source
  /** Aviso de por qué la fila merece mirarse (viene del cruce) */
  warning?: string
  /** Número de fila de la agenda de donde salió */
  line?: number
  /** Las fuentes del cruce (las filas agregadas a mano no tienen) */
  origin?: Origin
  /** Lo que salió del cruce, antes de poner encima lo escrito a mano */
  src?: Fields
  /** Campos editados a mano que la agenda/el calendar cambiaron después: hay que confirmar */
  conflicts?: Conflict[]
}

/** Cómo era una fila cuando se la tocó por primera vez (para reconocerla si después desaparece de las fuentes). */
export type Snap = Fields & { date: string }

/** Una cirugía que no entra al checklist: suspendida o sacada a mano. */
export type Excluded = { row: Row; reason: 'suspended' | 'removed' }
