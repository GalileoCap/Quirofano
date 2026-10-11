# Quiro

Ayuda para las tareas de una residente/un residente de oftalmología. Primera función: armar el **checklist de cirugías de la semana** cruzando la agenda quirúrgica (CSV de la hoja de cálculo) con el calendar (ICS de Google Calendar).

La interfaz y los textos van en español rioplatense (voseo: "elegí", "cargá").

## Comandos

- `npm run dev` — Vite en el puerto 3003 (ver `.claude/launch.json`)
- `npm test` — tests con el runner de Node (`tests/*.test.ts`, usan las fuentes `.ts` directo, por eso los imports llevan extensión)
- `npm run build` — `tsc --noEmit` + build de Vite a `dist/`

Antes de dar algo por terminado: `npx tsc --noEmit`, `npm test` y mirarlo en el navegador (móvil y escritorio).

## Datos de pacientes

- Es una app 100 % del lado del cliente: la agenda y los calendarios se procesan en el navegador y quedan en `localStorage`. **Nada de pacientes se manda a un servidor.** Si algún día hace falta uno, hay que discutirlo antes.
- `samples/` (agenda, checklist y calendar reales) está en `.gitignore`: nunca commitear datos reales. Los tests usan datos inventados.

## Estética (igual que `../guardias`)

- Stack: React 19 + Vite + Tailwind 4 + daisyUI 5 + zustand. Tema daisyUI `rosa` y fuentes Fraunces (títulos, en cursiva) y Nunito, copiados de `guardias/src/index.css`.
- Mismo ícono (`public/favicon.svg`: corazón + ojo + cruz) y mismo encabezado con el logo.
- Íconos SVG inline (`components/Icon.tsx`, trazos de Lucide), nunca emojis.
- Mobile primero: navegación inferior (`dock`) en el teléfono y pestañas arriba desde `sm`; diálogos como hoja inferior; inputs de 16 px para que iOS no haga zoom.

## Cómo se arma el checklist

- **Agenda** (`src/agenda.ts`): la cabecera del CSV está corrida. Columnas reales: 0 marca temporal · 1 fecha de la cirugía · 2 paciente · 3 HC · 4 duración · 5 cirugía · 6 cirujano · 7 ayudante · 8 ojo · 9 contacto · 10 teléfono · 11 insumo · 12 dioptrías · 13 anestesia · 14 pedido B · 15 observaciones · 16 edad · 17 DNI. La fecha (col. 1) tiene celdas rotas (`ABARC`, `01/062026`, años `0004`); el mismo paciente puede tener varias filas (reprogramaciones, cirugías de años anteriores).
- **Calendar** (`src/ics.ts`): cada evento es `CIRUGÍA / PACIENTE / CIRUJANO / AYUDANTE`, de día completo, en el calendario `AGENDA QUIRURGICA`. Lo suspendido va al calendario `SUSPENSION QUIRURGICA`. Se ignoran feriados y eventos personales. El PDF que imprime Google Calendar corta los títulos: no se lee, hay que exportar `.ics` (o el `.zip` de la exportación, que se abre solo).
- **Cruce** (`src/merge.ts`): el calendar manda sobre qué cirugías hay cada día; la agenda aporta los datos. Se cruza por nombre (tolera orden distinto y nombres incompletos), prefiriendo la fila con la misma fecha y, a igual puntaje, la carga más reciente. Lo que está en la agenda con fecha de la semana pero no en el calendar queda en "Sin incluir"; sin calendar para esas fechas se usa solo la fecha de la agenda. Todo lo que no se pudo cruzar bien se avisa en la fila, no se esconde.
- **A mano** (`src/store.ts`): PREQUI, HC, notas, quirófano y quiró día, más cualquier corrección de campo, orden, filas sacadas/agregadas. Se guardan por clave de fila (`fecha|HC`), así sobreviven a volver a cargar la agenda.
- **Horarios** (`src/checklist.ts`): una cirugía atrás de otra desde la hora de inicio según la duración (60 min si falta); lo escrito a mano se respeta.
- **Exportación**: mismo formato que la planilla "Checklist" (21 columnas, días del último al primero, encabezado `PREQUI`/`HC` solo en el primer día).
