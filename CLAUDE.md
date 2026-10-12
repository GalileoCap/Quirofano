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

## Reglas de los campos (del dueño, no negociables)

1. **Ningún campo tiene un valor automático.** Cada valor viene de una fuente (agenda o calendar) o lo escribe la persona a mano. No se calcula, no se infiere, no hay "por defecto" ni "sugerencia que se completa sola". Por eso el **horario** queda vacío hasta que se escribe (no se calcula por duración ni hay hora de inicio del día), y la duración faltante no se reemplaza por 60. Si algún día algo se tiene que calcular, se discute antes. El cruce (qué fila de la agenda va con qué evento) sí decide de dónde sale cada dato, pero siempre se puede ver en el panel de origen.
2. **Todos los campos son inputs de texto libre**, también Ojo, Dioptrías y Duración (no selectores ni números): la persona necesita poder agregar notas en cualquiera (`60 min, si hay tiempo`, `OD, pero revisar`).
3. **Sugerencias, no automatismos:** los campos Cirugía, Cirujano, Ayudante, Ojo, Anestesia, Contacto y Duración ofrecen sugerencias (`<datalist>`) armadas con los valores que ya hay en la agenda y el calendar, del último año, de la más usada a la menos usada (`src/suggest.ts`). Elegir una sugerencia solo completa ese campo; nunca toca otro. Se puede escribir cualquier otra cosa.

## Cómo se arma el checklist

- **Agenda** (`src/agenda.ts`): la cabecera del CSV está corrida. Columnas reales: 0 marca temporal · 1 fecha de la cirugía · 2 paciente · 3 HC · 4 duración · 5 cirugía · 6 cirujano · 7 ayudante · 8 ojo · 9 contacto · 10 teléfono · 11 insumo · 12 dioptrías · 13 anestesia · 14 pedido B · 15 observaciones · 16 edad · 17 DNI. La fecha (col. 1) tiene celdas rotas (`ABARC`, `01/062026`, años `0004`); el mismo paciente puede tener varias filas (reprogramaciones, cirugías de años anteriores).
- **Calendar** (`src/ics.ts`): la exportación de Google Calendar es un `.zip` con un `.ics` por calendario (se abre solo). Las cirugías actuales están en el calendario **`AGENDA`** (el principal, mezclado con eventos personales); `AGENDA QUIRURGICA` es el viejo, con texto libre; lo suspendido va a `SUSPENSION QUIRURGICA`; `Birthdays` se descarta al cargar. Formato actual del título: `CIRUGÍA / PACIENTE / CIRUJANO / AYUDANTE`, y la descripción trae `OJO / DIOPTRÍAS / HC / TELÉFONO`. El formato viejo es `CIRUGÍA / CIRUJANO / AYUDANTE` con `[OJO /] PACIENTE / HC / TELÉFONO` en la descripción. Cada pedazo de la descripción se reconoce por su forma, no por su posición. Un evento con palabras de cirugía pero sin formato legible (`CATARAT BROCHARD ORTELLADO`, `/CATABROCHARD/…`) se avisa arriba en vez de ignorarse. Se guardan solo los eventos de los últimos 120 días. El PDF que imprime Google Calendar corta los títulos: no se lee.
- **Cruce** (`src/merge.ts`): el calendar manda sobre qué cirugías hay cada día; la agenda aporta los datos. Se cruza por **HC** (la descripción del evento la trae) y, si no, por nombre (tolera orden distinto y nombres incompletos), prefiriendo la fila con la misma fecha y, a igual puntaje, la carga más reciente. La misma cirugía en dos calendarios cuenta una vez. Lo que está en la agenda con fecha de la semana pero no en el calendar queda en "Sin incluir"; sin calendar para esas fechas se usa solo la fecha de la agenda. Todo lo que no se pudo cruzar bien se avisa en la fila, no se esconde.
- **A mano** (`src/store.ts`): PREQUI, HC, notas, quirófano y quiró día, más cualquier corrección de campo, orden, filas sacadas/agregadas. Se guardan por clave de fila (`fecha|HC`), así sobreviven a volver a cargar la agenda.
- **Horario**: columna que se escribe a mano (regla 1); el cruce no la completa.
- **Exportación**: mismo formato que la planilla "Checklist" (21 columnas, días del último al primero, encabezado `PREQUI`/`HC` solo en el primer día). El CSV sale sin marca BOM, con saltos `\r\n` y sin salto final, igual que el que baja Google Sheets (`tests/export.test.ts` fija esa forma).
- **Rango de días** (`weekRange` en `src/checklist.ts`, selectores "Días" en `ChecklistView.tsx`): cada semana se arma por defecto de lunes a domingo; se puede acotar (ej. lunes a viernes) y queda guardado por semana (`ranges` en `useStore`, también en el respaldo de Datos). Lo que cae fuera del rango no entra al checklist ni a "Sin incluir", y el CSV se llama con las fechas del rango.

## Volver a cargar la agenda/el calendar durante la semana

Flujo: al empezar la semana se cargan agenda y calendar y se arma el checklist; se corrige a mano; más tarde se vuelven a cargar. Todo lo que **difiere** entre el checklist y las fuentes se muestra y se confirma (`src/review.ts`):

- **Cirugías nuevas** en el calendar entran solas; las novedades de la última carga (nuevas, movidas de día, que ya no están, con otros datos) se listan en "Novedades" (`load.ts` compara el checklist de antes y de después en 9 semanas; solo si las dos cargas se armaron igual, con o sin calendar).
- **Campos escritos a mano** (`edits`) llevan anotado en `bases` qué decían las fuentes la última vez que se confirmaron. Si lo escrito difiere de lo que dicen hoy las fuentes y no está confirmado (edición vieja sin base, o las fuentes cambiaron después), la fila muestra "Difiere de la agenda/el calendar" con *Dejar el mío* (confirma) o *Usar el de la agenda/calendar* (descarta lo escrito). Mientras tanto rige lo escrito: nunca se pisa nada sin confirmar. PREQUI, notas, quirófano, horario no cuentan (las fuentes no los traen).
- **Filas con trabajo manual que desaparecen de las fuentes** (`snaps` guarda cómo eran): "Ya no están…" ofrece pasar lo escrito al día nuevo si se movió (mismo HC), dejarla a mano o sacarla. Las que no tenían nada escrito solo salen en Novedades.
- Lo que no cambió conserva lo escrito sin avisos.

## Poder confiar: de dónde sale cada dato

Nada del checklist es una caja negra. Cada fila del cruce lleva `origin` (`src/types.ts`): la fila de la agenda, el evento del calendar, si se encontraron por HC o por nombre y qué fuente puso cada campo.

- **Panel "Origen"** (`SourceDialog.tsx`, chip "Agenda L95 + Calendar" en cada fila y botón en "Sin incluir"): cómo se armó la fila, tabla checklist / agenda / calendar campo por campo (negrita = la fuente que lo puso, amarillo = las fuentes no coinciden, "a mano" = lo escrito), la fila de la agenda celda por celda tal como está en el CSV con lo que la app entendió (`AGENDA_COLUMNS`: «.» se ignora, «60 min» se lee como 60, fecha ilegible), el evento del calendar con título y descripción crudos, y las otras filas del mismo paciente por si el cruce eligió mal.
- **Pestaña "Originales"** (`OriginalsView.tsx`): toda la agenda (por línea del CSV) y todos los eventos guardados del calendar, con buscador, y mostrando también lo que se ignora (cancelado, calendario descartado, evento personal) y por qué (`describeEvent`).
- Las celdas crudas (`AgendaRow.cells`) y la descripción (`CalEvent.description`) no se guardan aparte: salen de reprocesar el CSV y los eventos guardados.

## Vista resumen de la semana

El checklist tiene tres vistas (`ChecklistView.tsx`): **Resumen** (por defecto, `OverviewView.tsx`), **Detalle** (las tarjetas de siempre) y **Calendario** (`CalendarView.tsx`, abajo). El resumen es una línea por cirugía, por día, para ver de lejos qué difiere o qué falta. Tocar una línea abre el detalle (`DetailDialog.tsx`, solo lectura). Muestra las marcas, los datos agrupados, lo que se completa a mano, el aviso de "Difiere" con sus botones, subir/bajar, sacar y el chip de origen. "Editar" en ese modal abre el formulario, así que editar es un segundo click (el lápiz de la fila lo abre directo). Las de "Sin incluir" aparecen en su día, atenuadas, con "Incluir", y tocarlas abre el panel de origen. Las marcas salen de `rowFlags` (`src/overview.ts`) y cada una es también un filtro con su cuenta:

- **Por confirmar**: lo escrito a mano que difiere de las fuentes y nadie confirmó (`conflicts`).
- **Agenda ≠ calendar**: campos (o la fecha) en que las dos fuentes dicen cosas distintas, filas que están en una sola fuente, y las de "Sin incluir" por no estar en el calendar o estar suspendidas.
- **Editadas**: campos en que el checklist difiere de lo que salió del cruce (confirmados o no), filas agregadas a mano y las sacadas a mano.
- **Faltan datos**: falta alguno de Paciente, HC, Cirugía, Cirujano, Ojo, Duración (`REQUIRED_FIELDS`). Ayudante, anestesia, dioptrías y teléfono pueden faltar sin aviso.
- **Sin completar**: Horario, Prequi o HC (check) todavía vacíos (`PENDING_FIELDS`); son columnas a mano, nunca se completan solas (regla 1).

En la fila, la celda marcada en amarillo es un campo por confirmar, en rojo uno en que las fuentes no coinciden, en cursiva con subrayado punteado uno escrito a mano, y «falta» uno vacío que debería tener dato.

### Vista Calendario

Los días del rango de la semana como columnas, igual que en `../guardias` (FullCalendar 6 con `daygrid`, locale `es`, mismos retoques `.fc` en `index.css`). Una tarjeta por cirugía en el orden del día; las de "Sin incluir" van al final, punteadas y atenuadas. Los textos de las marcas son los del Resumen (`flagNotes` en `overview.ts`, también salen como tooltip) y se ven en el borde: celeste = a mano, rojo = agenda ≠ calendar, amarillo con contorno = por confirmar. Tocar una cirugía abre el mismo detalle que en el Resumen; una de "Sin incluir", el panel de origen.

**No hay grilla de horas**: el horario es texto libre y casi siempre está vacío (regla 1), así que un eje horario obligaría a leerlo y a calcular el fin con la duración. El horario, si se escribió, se muestra tal cual delante del nombre. En el teléfono el calendario se desliza hacia los costados (`DAY_MIN_REM` por día) en vez de apretar los nombres.

## Lo que no se puede automatizar

El checklist que arma la residente a mano no sale ni del calendar ni de la agenda por fecha: tiene cirugías movidas, sumadas y bajadas por conversaciones que no quedaron escritas en ninguna de las dos (en la semana del 12/10, de 34 filas, 10 no estaban en el calendar y 5 del calendar no estaban en el checklist). Por eso el cruce propone y avisa, y la persona incluye/saca/edita; no hay que intentar "adivinar" más.
