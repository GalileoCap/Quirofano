# Quiro

Ayuda para las tareas de una residente/un residente de oftalmología. Primera función: armar el checklist de cirugías de la semana cruzando la agenda quirúrgica (CSV de la hoja de cálculo) con el calendar (ICS de Google Calendar). El checklist se arma desde la app y la exportación a la planilla sigue igual. Uno armado afuera se puede cargar para compararlo (ver "Comparar con un checklist armado afuera").

La interfaz y los textos van en español rioplatense (voseo: "elegí", "cargá"). Las respuestas a la persona que usa Quiro también.

Las reglas de trabajo son las de session-kit (`~/.claude/CLAUDE.md`). Este archivo agrega las del proyecto. `.claude/settings.json` declara el plugin y `.claude/claude-kit.json` le dice a `session-tells` que lea también los comentarios de `src/` y `tests/`, en español.

## Intent

Los goals del dueño, los objetivos y las restricciones activos. Cada entrada es un archivo de [docs/intent/](docs/intent/INDEX.md) (`INDEX.md` lo escribe `session-intent index`), y `session-intent check` exige que esta lista sea la de las activas.

- `G1` Ayudar a la residente con sus tareas, empezando por el checklist.
- `O1` Lo que arma la app se puede controlar contra un checklist real.
- `O2` Ninguna entrada de la agenda o del calendar se pierde en silencio.
- `O3` Cada cirugía del checklist lleva los datos de esa cirugía (propuesto).

## Comandos

- `npm run dev`: Vite en el puerto 3003 (ver `.claude/launch.json`).
- `npm test`: tests con el runner de Node (`tests/*.test.ts`, usan las fuentes `.ts` directo, por eso los imports llevan extensión). Cada test tiene 5 segundos de tope (`--test-timeout`). La salida va a un archivo, nunca a un pipe.
- `npm run lint`: oxlint (`.oxlintrc.json`: correctness y suspicious como error) con `--deny-warnings`. Cero avisos, sin supresiones ([docs/suppressions.md](docs/suppressions.md) lo lista, `session-suppressions check`).
- `npm run build`: lint, `tsc --noEmit` y build de Vite a `dist/`.

Antes de dar algo por terminado: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` sin avisos, y mirarlo en el navegador (móvil y escritorio). Se dice qué escenarios se probaron y cuáles no.

## Datos de pacientes

- Es una app 100 % del lado del cliente: la agenda y los calendarios se procesan en el navegador y quedan en `localStorage`. Nada de pacientes se manda a un servidor. Si algún día hace falta uno, hay que discutirlo antes.
- `samples/` (agenda, checklist y calendar reales) está en `.gitignore`: nunca commitear datos reales. Los tests usan datos inventados.

## Estética (igual que `../guardias`)

- Stack: React 19, Vite, Tailwind 4, daisyUI 5 y zustand. Tema daisyUI `rosa` y fuentes Fraunces (títulos, en cursiva) y Nunito, copiados de `guardias/src/index.css`.
- Mismo ícono (`public/favicon.svg`: corazón, ojo y cruz) y mismo encabezado con el logo.
- Íconos SVG inline (`components/Icon.tsx`, trazos de Lucide), nunca emojis.
- Mobile primero: navegación inferior (`dock`) en el teléfono y pestañas arriba desde `sm`. Los diálogos son una hoja inferior y los inputs miden 16 px para que iOS no haga zoom.

## Reglas de los campos (del dueño, no negociables)

1. Ningún campo tiene un valor automático. Cada valor viene de una fuente (agenda o calendar) o lo escribe la persona a mano. No se calcula, no se infiere, no hay "por defecto" ni "sugerencia que se completa sola". Por eso el horario queda vacío hasta que se escribe (no se calcula por duración ni hay hora de inicio del día), y la duración faltante no se reemplaza por 60. Si algún día algo se tiene que calcular, se discute antes. El cruce (qué fila de la agenda va con qué evento) sí decide de dónde sale cada dato, pero siempre se puede ver en el panel de origen.
2. Todos los campos son inputs de texto libre, también Ojo, Dioptrías y Duración (no selectores ni números). La persona necesita poder agregar notas en cualquiera (`60 min, si hay tiempo`, `OD, pero revisar`).
3. Sugerencias, no automatismos. Los campos Cirugía, Cirujano, Ayudante, Ojo, Anestesia, Contacto y Duración ofrecen sugerencias (`<datalist>`) armadas con los valores que ya hay en la agenda y el calendar, del último año, de la más usada a la menos usada (`src/suggest.ts`). Elegir una sugerencia solo completa ese campo y nunca toca otro. Se puede escribir cualquier otra cosa.

## Lo guardado en el navegador

Todo vive en `localStorage` con zustand persist, en dos claves (`src/store.ts`): `quiro-v1` (lo escrito a mano, las tareas y las novedades de la última carga; `useStore`) y `quiro-sources-v1` (agenda y eventos del calendar; `useSources`). Las claves no se renombran nunca. Cambiar la forma de lo guardado (`src/persist.ts`, versión, migración, lectores y respaldo de Datos) sigue la skill `migracion` (`.claude/skills/migracion/SKILL.md`): una migración por deploy, y un paso que ya salió no se toca.

## Deploy

Solo se deploya cuando el dueño lo pide, con la skill `deploy` (`.claude/skills/deploy/SKILL.md`): versión, tag `vX.Y.Z` y push, que publica en `quirofano.smplworks.net`. Entre deploys se commitea pero no se pushea.

## Cómo se arma el checklist

### Agenda

`src/agenda.ts`. La cabecera del CSV está corrida. Columnas reales: 0 marca temporal · 1 fecha de la cirugía · 2 paciente · 3 HC · 4 duración · 5 cirugía · 6 cirujano · 7 ayudante · 8 ojo · 9 contacto · 10 teléfono · 11 insumo · 12 dioptrías · 13 anestesia · 14 pedido B · 15 observaciones · 16 edad · 17 DNI. La fecha (col. 1) tiene celdas rotas (`ABARC`, `01/062026`, años `0004`). El mismo paciente puede tener varias filas (reprogramaciones, cirugías de años anteriores). Una fila sin nombre ni HC entra igual (se ve que le faltan), y una con la fecha rota cargada en los últimos 120 días se avisa arriba (`agendaProblems`).

### Calendar

`src/ics.ts`. La exportación de Google Calendar es un `.zip` con un `.ics` por calendario (se abre solo).

- Las cirugías actuales están en el calendario `AGENDA` (el principal, mezclado con eventos personales). `AGENDA QUIRURGICA` es el viejo, con texto libre. Lo suspendido va a `SUSPENSION QUIRURGICA`. `Birthdays` se descarta al cargar.
- Formato actual del título: `CIRUGÍA / PACIENTE / CIRUJANO / AYUDANTE`, y la descripción trae `OJO / DIOPTRÍAS / HC / TELÉFONO`. El formato viejo es `CIRUGÍA / CIRUJANO / AYUDANTE` con `[OJO /] PACIENTE / HC / TELÉFONO` en la descripción. Cada pedazo de la descripción se reconoce por su forma, no por su posición.
- Ningún evento de un calendario de cirugías se pierde en silencio (`A3`, nada se pierde en silencio). El que no se lee y tiene una señal de cirugía (palabra, HC, teléfono, ojo) o es una suspensión se avisa arriba. El resto (vacaciones, feriados, «Chala, granu») va a la lista desplegable de la semana. El aviso (`src/problems.ts`) tiene "Cargar a mano" (agrega una cirugía vacía ese día y abre el formulario, sin completar nada) y "Reconocer" (se guarda en `acks` con la huella del evento; vuelve a avisar si cambia su título o su descripción, y "Avisos reconocidos" permite volver a avisar). Un evento que salió del rango o se corrigió en el calendar deja de avisar solo.
- Se guardan solo los eventos de los últimos 120 días.
- El PDF que imprime Google Calendar corta los títulos, así que no se lee.

### Cruce

`src/merge.ts`. El calendar manda sobre qué cirugías hay cada día y la agenda aporta los datos. Se cruza por HC (la descripción del evento la trae) y, si no, por nombre (tolera orden distinto y nombres incompletos), prefiriendo la fila con la misma fecha y, a igual puntaje, la carga más reciente. De una fila de otra fecha se toman solo nombre, HC, teléfono, contacto y DNI, porque puede ser otra cirugía de la misma persona (`A4`, de otra fecha solo la persona). El detalle ofrece "Usar los datos de la agenda del …". La misma cirugía en dos calendarios cuenta una vez. Lo que está en la agenda con fecha de la semana pero no en el calendar entra igual al checklist, y lo que está en el calendar y no en la agenda también. Estar en una sola fuente no es una diferencia ni se marca: el chip de origen ("Agenda L95" sin "+ Calendar") ya lo dice. Sin calendar para esas fechas se usa solo la agenda. "Sin incluir" queda para lo suspendido y lo que se sacó a mano. Todo lo que no se pudo cruzar bien se avisa en la fila, no se esconde.

### A mano, horario, exportación y rango

- A mano (`src/store.ts`): PREQUI, HC, notas, quirófano y quiró día, más cualquier corrección de campo, orden, filas sacadas o agregadas. Se guardan por clave de fila (`fecha|HC`), así sobreviven a volver a cargar la agenda.
- Horario: columna que se escribe a mano (regla 1). El cruce no la completa.
- Exportación: mismo formato que la planilla "Checklist" (21 columnas, días del último al primero, encabezado `PREQUI`/`HC` solo en el primer día). El CSV sale sin marca BOM, con saltos `\r\n` y sin salto final, igual que el que baja Google Sheets (`tests/export.test.ts` fija esa forma).
- Rango de días (`weekRange` en `src/checklist.ts`, selectores "Días" en `ChecklistView.tsx`): cada semana se arma por defecto de lunes a domingo. Se puede acotar (ej. lunes a viernes) y queda guardado por semana (`ranges` en `useStore`, también en el respaldo de Datos). Lo que cae fuera del rango no entra al checklist ni a "Sin incluir", y el CSV se llama con las fechas del rango.

## Comparar con un checklist armado afuera

Botón "Comparar" (`src/compare.ts`, `CompareDialog.tsx`; `A1`, comparar con un checklist cargado). Lee la planilla por el nombre de columna (NUMERO es la HC y HC es la casilla) o el CSV que exporta la app, empareja por HC y después por nombre en el mismo día, y no guarda el archivo. Nada viene tildado, y aplicar es escribir a mano (`A2`, aplicar es escribir a mano). Las diferencias menores (columnas a mano, mismo valor escrito distinto, uno que dice más, vacío en el checklist) van plegadas, y lo que falta en la app se busca entre los eventos y filas que no se leyeron (`A5`, comparar prioriza lo que importa).

## Volver a cargar, origen de cada dato, vistas y tareas

Se leen antes de tocar esa parte:

- [docs/volver-a-cargar.md](docs/volver-a-cargar.md): una carga nueva durante la semana. Las novedades, lo escrito a mano que difiere de las fuentes (*Dejar el mío* / *Usar el de…*) y las filas con trabajo que desaparecen (`src/review.ts`). Nunca se pisa nada sin confirmar.
- [docs/origen.md](docs/origen.md): de dónde sale cada dato. El panel "Origen", la pestaña "Originales" y `origin` en cada fila.
- [docs/vista-resumen.md](docs/vista-resumen.md): Resumen y Calendario, las marcas de `rowFlags` y sus filtros, y "Reconocer" (`acks`).
- [docs/tareas.md](docs/tareas.md): la pestaña Tareas (`src/tasks.ts`), las de la semana y las de cada cirugía.

## Lo que no se puede automatizar

El checklist que arma la residente a mano no sale ni del calendar ni de la agenda por fecha. Tiene cirugías movidas, sumadas y bajadas por conversaciones que no quedaron escritas en ninguna de las dos (en la semana del 12/10, de 34 filas, 10 no estaban en el calendar y 5 del calendar no estaban en el checklist). Por eso el cruce propone y avisa, y la persona incluye, saca o edita. No hay que intentar "adivinar" más.
