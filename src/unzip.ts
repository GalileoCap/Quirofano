// Lector mínimo de .zip (Google Calendar exporta un zip con un .ics por calendario). Sin dependencias: lee el
// directorio central y descomprime con DecompressionStream, que ya trae el navegador.
const u16 = (b: DataView, o: number) => b.getUint16(o, true)
const u32 = (b: DataView, o: number) => b.getUint32(o, true)

/** Archivos de un zip como texto UTF-8, por nombre. Solo los que cumplen `want`. */
export async function unzipText(buf: ArrayBuffer, want: (name: string) => boolean): Promise<Map<string, string>> {
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)
  // el registro final (EOCD) está en los últimos 65 KB
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65535); i--)
    if (u32(view, i) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) throw new Error('No es un zip válido')
  const count = u16(view, eocd + 10)
  let p = u32(view, eocd + 16)
  const out = new Map<string, string>()
  for (let n = 0; n < count; n++) {
    if (u32(view, p) !== 0x02014b50) throw new Error('Zip dañado')
    const method = u16(view, p + 10)
    const size = u32(view, p + 20)
    const nameLen = u16(view, p + 28)
    const extraLen = u16(view, p + 30)
    const commentLen = u16(view, p + 32)
    const local = u32(view, p + 42)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (!want(name)) continue
    const start = local + 30 + u16(view, local + 26) + u16(view, local + 28)
    const data = bytes.subarray(start, start + size)
    if (method === 0) out.set(name, new TextDecoder().decode(data))
    else if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      out.set(name, await new Response(stream).text())
    }
  }
  return out
}
