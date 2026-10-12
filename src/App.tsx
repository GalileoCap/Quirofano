import { useState } from 'react'
import ChecklistView from './components/ChecklistView.tsx'
import DataView from './components/DataView.tsx'
import OriginalsView from './components/OriginalsView.tsx'
import TasksView from './components/TasksView.tsx'
import { defaultMonday } from './dates.ts'
import Icon, { type IconName } from './components/Icon.tsx'

type Tab = 'checklist' | 'tareas' | 'originales' | 'datos'

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'checklist', label: 'Checklist', icon: 'check' },
  { key: 'tareas', label: 'Tareas', icon: 'listChecks' },
  { key: 'originales', label: 'Originales', icon: 'database' },
  { key: 'datos', label: 'Datos', icon: 'settings' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('checklist')
  // la semana se comparte entre el checklist y las tareas
  const [monday, setMonday] = useState(defaultMonday)
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 p-2 pb-24 sm:gap-4 sm:p-4 sm:pb-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="font-display flex items-center gap-2 text-2xl font-semibold italic text-primary sm:text-3xl">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8 sm:size-9" />
          Quiro
        </h1>
        {/* En el teléfono la navegación va abajo (alcance del pulgar); acá arriba solo desde sm */}
        <div role="tablist" className="tabs tabs-box hidden sm:inline-flex">
          {TABS.map((t) => (
            <button key={t.key} role="tab" className={`tab ${tab === t.key ? 'tab-active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </header>
      {tab === 'checklist' ? (
        <ChecklistView monday={monday} setMonday={setMonday} />
      ) : tab === 'tareas' ? (
        <TasksView monday={monday} setMonday={setMonday} />
      ) : tab === 'originales' ? (
        <OriginalsView />
      ) : (
        <DataView />
      )}
      <nav className="dock dock-md sm:hidden" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            className={tab === t.key ? 'dock-active' : ''}
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key)
              scrollTo({ top: 0 })
            }}
          >
            <Icon name={t.icon} className="size-5" />
            <span className="dock-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
