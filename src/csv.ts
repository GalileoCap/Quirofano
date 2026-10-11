/** Parser de CSV (RFC 4180): comillas dobles, comas y saltos de línea dentro de una celda. Devuelve filas de celdas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text // sin la marca BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const escapeCell = (s: string, sep: string) => (s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** Serializa filas de celdas como CSV. */
export const toCsv = (rows: string[][]) => rows.map((r) => r.map((c) => escapeCell(c, ',')).join(',')).join('\r\n')

/** Serializa filas de celdas como TSV (lo que Google Sheets entiende al pegar). Los saltos de línea pasan a espacio. */
export const toTsv = (rows: string[][]) => rows.map((r) => r.map((c) => c.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n')
