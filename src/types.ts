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

/** Una fila del checklist: datos de la agenda + columnas que se completan a mano. */
export type Row = Record<Field, string> & {
  /** Identifica la fila entre cambios de agenda: fecha + paciente (+ cirugía si hay dos el mismo día) */
  key: string
  date: string
  source: Source
  /** Aviso de por qué la fila merece mirarse (viene del cruce) */
  warning?: string
  /** Número de fila de la agenda de donde salió */
  line?: number
}

/** Una cirugía que no entra al checklist: suspendida, que no está en el calendar, o que se sacó a mano. */
export type Excluded = { row: Row; reason: 'suspended' | 'not-in-calendar' | 'removed' }
