import { useRef } from 'react'
import { today } from '../dates.ts'
import { useAgenda, useCalendarEvents } from '../hooks.ts'
import { loadAgenda, loadCalendars } from '../load.ts'
import { useSources, useStore, type UserData } from '../store.ts'
import Card from './Card.tsx'
import FileDrop from './FileDrop.tsx'
import Icon from './Icon.tsx'

export default function DataView() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <AgendaCard />
        <CalendarCard />
      </div>
      <div className="flex flex-col gap-4">
        <DataCard />
      </div>
    </div>
  )
}

export function AgendaCard() {
  const agenda = useSources((s) => s.agenda)
  const removeAgenda = useSources((s) => s.removeAgenda)
  const rows = useAgenda()
  const from = today()
  const upcoming = rows.filter((r) => r.date && r.date >= from).length
  return (
    <Card
      title="Agenda quirúrgica"
      hint="En la hoja de cálculo: Archivo → Descargar → Valores separados por comas (.csv). Se cruza con el calendar para armar el checklist."
    >
      {agenda && (
        <div className="flex items-center gap-2 rounded-box bg-base-200 p-2 text-sm">
          <Icon name="check" className="size-4 text-success" />
          <span className="min-w-0 flex-1 truncate">
            {agenda.name} · {rows.length} cirugías ({upcoming} de hoy en adelante)
          </span>
          <button className="btn btn-ghost btn-xs text-error" onClick={() => confirm('¿Quitar la agenda de este navegador?') && removeAgenda()}>
            Quitar
          </button>
        </div>
      )}
      <FileDrop accept=".csv,text/csv" label={agenda ? 'Reemplazar la agenda (.csv)' : 'Cargar la agenda (.csv)'} onFiles={loadAgenda} />
    </Card>
  )
}

export function CalendarCard() {
  const calendars = useSources((s) => s.calendars)
  const removeCalendar = useSources((s) => s.removeCalendar)
  const { perFile } = useCalendarEvents()
  return (
    <Card
      title="Calendar"
      hint="En Google Calendar: Configuración → Importar y exportar → Exportar. Sirve el .zip tal cual o los .ics de AGENDA QUIRURGICA y SUSPENSION QUIRURGICA. Es opcional: sin calendar se arma solo con la fecha de la agenda."
    >
      {calendars.length > 0 && (
        <ul className="flex flex-col gap-1">
          {calendars.map((c) => {
            const info = perFile.find((f) => f.name === c.name)
            return (
              <li key={c.name} className="flex items-center gap-2 rounded-box bg-base-200 p-2 text-sm">
                <Icon name="calendar" className="size-4 text-primary" />
                <span className="min-w-0 flex-1 truncate">
                  {c.name} · {info?.events.length ?? 0} cirugías
                </span>
                <button className="btn btn-ghost btn-xs text-error" onClick={() => removeCalendar(c.name)}>
                  Quitar
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <FileDrop accept=".ics,.zip,text/calendar,application/zip" multiple label="Cargar calendarios (.ics o .zip)" onFiles={loadCalendars} />
    </Card>
  )
}

function DataCard() {
  const store = useStore()
  const clearUserData = useStore((s) => s.clearUserData)
  const importUserData = useStore((s) => s.importUserData)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportJson = () => {
    const { edits, bases, snaps, order, included, manualRows, ranges } = store
    const blob = new Blob([JSON.stringify({ edits, bases, snaps, order, included, manualRows, ranges }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `quiro-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Partial<UserData>
      if (typeof data !== 'object' || !data || !('edits' in data)) throw new Error('formato')
      if (confirm('Esto reemplaza todo lo que escribiste a mano (notas, orden, filas agregadas). ¿Seguir?')) importUserData(data)
    } catch {
      alert('No pude leer ese archivo.')
    }
  }

  return (
    <Card
      title="Datos"
      hint="Todo se procesa y se guarda en este navegador: ningún dato de pacientes se sube a un servidor. Exportá un respaldo de lo que escribiste a mano de vez en cuando (no incluye la agenda ni los calendarios)."
    >
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm" onClick={exportJson}>
          Exportar JSON
        </button>
        <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
          Importar JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importJson(f)
            e.target.value = ''
          }}
        />
        <button
          className="btn btn-sm btn-error btn-soft ml-auto"
          onClick={() => {
            if (!confirm('Se borran la agenda, los calendarios y todo lo que escribiste a mano en este navegador. ¿Seguro?')) return
            useSources.setState({ agenda: null, calendars: [] })
            clearUserData()
          }}
        >
          Borrar todo
        </button>
      </div>
    </Card>
  )
}
