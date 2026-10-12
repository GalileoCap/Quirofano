import { addDaysTo, defaultMonday } from '../dates.ts'
import { weekLabel } from '../format.ts'
import Icon from './Icon.tsx'

/** Flechas, título y "Hoy" para moverse de semana (la semana la guarda quien lo usa). */
export default function WeekNav({ monday, onChange }: { monday: string; onChange: (monday: string) => void }) {
  return (
    <>
      <button className="btn btn-sm btn-square" aria-label="Semana anterior" onClick={() => onChange(addDaysTo(monday, -7))}>
        <Icon name="chevronLeft" />
      </button>
      <h2 className="font-display min-w-0 flex-1 text-center text-lg font-semibold text-primary sm:flex-none sm:text-xl">{weekLabel(monday)}</h2>
      <button className="btn btn-sm btn-square" aria-label="Semana siguiente" onClick={() => onChange(addDaysTo(monday, 7))}>
        <Icon name="chevronRight" />
      </button>
      <button className="btn btn-sm btn-ghost" onClick={() => onChange(defaultMonday())}>
        Hoy
      </button>
    </>
  )
}
