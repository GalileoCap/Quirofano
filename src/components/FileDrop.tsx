import { useRef, useState } from 'react'
import type { LoadResult } from '../load.ts'
import Icon from './Icon.tsx'

/** Zona para soltar o elegir archivos. El procesamiento es local: los archivos no salen del navegador. */
export default function FileDrop({
  accept,
  multiple,
  label,
  onFiles,
}: {
  accept: string
  multiple?: boolean
  label: string
  onFiles: (files: File[]) => Promise<LoadResult>
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<LoadResult | null>(null)

  const handle = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true)
    try {
      setResult(await onFiles([...list]))
    } catch (e) {
      setResult({ ok: false, message: `No pude leer el archivo. ${e instanceof Error ? e.message : ''}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={`flex flex-col items-center gap-1 rounded-box border-2 border-dashed px-3 py-5 text-sm transition-colors ${
          over ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/60 hover:bg-primary/5'
        }`}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          handle(e.dataTransfer.files)
        }}
      >
        {busy ? <span className="loading loading-spinner loading-sm text-primary" /> : <Icon name="upload" className="size-5 text-primary" />}
        <span className="font-semibold">{label}</span>
        <span className="text-xs text-base-content/60">Tocá para elegir o soltá el archivo acá</span>
      </button>
      <input
        ref={ref}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          handle(e.target.files)
          e.target.value = ''
        }}
      />
      {result && (
        <p role="status" className={`text-sm ${result.ok ? 'text-success-content' : 'text-error'}`}>
          {result.message}
        </p>
      )}
    </div>
  )
}
