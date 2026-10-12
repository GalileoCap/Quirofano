# Quiro

Ayuda para las tareas de una residente/un residente de oftalmología. Primera función: armar el checklist de cirugías de la semana cruzando la agenda quirúrgica (CSV de la hoja de cálculo) con el calendar (ICS de Google Calendar). El checklist se arma desde la app, así que no hay una planilla propia con la cual compararlo. La exportación a la planilla sigue igual.

La interfaz y los textos van en español rioplatense (voseo: "elegí", "cargá"). Las respuestas a la persona que usa Quiro también.

Las reglas de trabajo son las de session-kit (`~/.claude/CLAUDE.md`). Este archivo agrega las del proyecto. `.claude/settings.json` declara el plugin y `.claude/claude-kit.json` le dice a `session-tells` que lea también los comentarios de `src/` y `tests/`, en español.

## Comandos

- `npm run dev`: Vite en el puerto 3003 (ver `.claude/launch.json`).
- `npm test`: tests con el runner de Node (`tests/*.test.ts`, usan las fuentes `.ts` directo, por eso los imports llevan extensión). Cada test tiene 5 segundos de tope (`--test-timeout`). La salida va a un archivo, nunca a un pipe.
- `npm run lint`: oxlint (`.oxlintrc.json`: correctness y suspicious como error) con `--deny-warnings`. Cero avisos, sin supresiones.
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

## Lo guardado en el navegador y sus migraciones

Todo vive en `localStorage` con zustand persist, en dos claves (`src/store.ts`): `quiro-v1` (lo escrito a mano, las tareas y las novedades de la última carga; `useStore`) y `quiro-sources-v1` (agenda y eventos del calendar; `useSources`). La versión va dentro de lo guardado (`{"state":…,"version":N}`) y las claves no se renombran nunca: `v1` en el nombre es histórico, no la versión.

Todo lo que tenga que ver con la forma de lo guardado está en `src/persist.ts`. Para cambiarla:

**Una migración por deploy, no una por cambio.** Entre un deploy y el siguiente, todos los cambios a la forma de lo guardado se juntan en un solo paso (una sola subida de versión). Mientras el cambio no se deployó, ese paso se sigue editando en vez de sumar otro, y la versión no vuelve a subir. Lo deployado manda: no se toca un paso que ya salió, se agrega uno nuevo. Hoy no hay nada deployado, así que `USER_VERSION` (1) y `SOURCES_VERSION` (1) son la base de la primera salida.

1. Subir `USER_VERSION` (o `SOURCES_VERSION`), solo si desde el último deploy no se había subido ya.
2. Agregar en `USER_MIGRATIONS` (o `SOURCES_MIGRATIONS`) el paso que lleva de la versión anterior a la nueva; la clave es la versión de la que parte. `runMigrations` los encadena en orden y lanza si falta uno.
3. Si cambia la forma de un campo, ajustar su lector (`readUserData`, `readSources`, `readNews`). Esos lectores corren siempre después de la migración y también con lo que está en la versión actual: lo que falta queda vacío (así una columna nueva en `FIELDS` no rompe filas viejas) y lo que no se entiende se descarta entrada por entrada, sin tumbar la app.
4. Escribir el test del paso con un estado de la versión vieja (`tests/persist.test.ts`).

El respaldo de Datos (`writeBackup`/`readBackup`) lleva `version` y pasa por las mismas migraciones. Los respaldos anteriores no la traen y se leen como versión 1. Uno de una versión más nueva que la de la app se rechaza con un aviso en vez de leerse a medias.

Antes de leer lo guardado con otra versión (más vieja, más nueva o ilegible), `quiro-v1` se copia tal cual a `quiro-v1.antes-vN` (si esa copia ya existe no se pisa), para que una migración que sale mal o una pestaña con la app vieja no destruya lo escrito. La agenda y los calendarios no se copian: se vuelven a cargar. Las copias no se borran solas.

## Cómo se arma el checklist

### Agenda

`src/agenda.ts`. La cabecera del CSV está corrida. Columnas reales: 0 marca temporal · 1 fecha de la cirugía · 2 paciente · 3 HC · 4 duración · 5 cirugía · 6 cirujano · 7 ayudante · 8 ojo · 9 contacto · 10 teléfono · 11 insumo · 12 dioptrías · 13 anestesia · 14 pedido B · 15 observaciones · 16 edad · 17 DNI. La fecha (col. 1) tiene celdas rotas (`ABARC`, `01/062026`, años `0004`). El mismo paciente puede tener varias filas (reprogramaciones, cirugías de años anteriores).

### Calendar

`src/ics.ts`. La exportación de Google Calendar es un `.zip` con un `.ics` por calendario (se abre solo).

- Las cirugías actuales están en el calendario `AGENDA` (el principal, mezclado con eventos personales). `AGENDA QUIRURGICA` es el viejo, con texto libre. Lo suspendido va a `SUSPENSION QUIRURGICA`. `Birthdays` se descarta al cargar.
- Formato actual del título: `CIRUGÍA / PACIENTE / CIRUJANO / AYUDANTE`, y la descripción trae `OJO / DIOPTRÍAS / HC / TELÉFONO`. El formato viejo es `CIRUGÍA / CIRUJANO / AYUDANTE` con `[OJO /] PACIENTE / HC / TELÉFONO` en la descripción. Cada pedazo de la descripción se reconoce por su forma, no por su posición.
- Un evento con palabras de cirugía pero sin formato legible (`CATARAT BROCHARD ORTELLADO`, `/CATABROCHARD/…`) se avisa arriba en vez de ignorarse. El aviso (`src/problems.ts`) tiene "Cargar a mano" (agrega una cirugía vacía ese día y abre el formulario, sin completar nada) y "Reconocer" (se guarda en `acks` con la huella del evento; vuelve a avisar si cambia su título o su descripción, y "Avisos reconocidos" permite volver a avisar). Un evento que salió del rango o se corrigió en el calendar deja de avisar solo.
- Se guardan solo los eventos de los últimos 120 días.
- El PDF que imprime Google Calendar corta los títulos, así que no se lee.

### Cruce

`src/merge.ts`. El calendar manda sobre qué cirugías hay cada día y la agenda aporta los datos. Se cruza por HC (la descripción del evento la trae) y, si no, por nombre (tolera orden distinto y nombres incompletos), prefiriendo la fila con la misma fecha y, a igual puntaje, la carga más reciente. La misma cirugía en dos calendarios cuenta una vez. Lo que está en la agenda con fecha de la semana pero no en el calendar entra igual al checklist, y lo que está en el calendar y no en la agenda también. Estar en una sola fuente no es una diferencia ni se marca: el chip de origen ("Agenda L95" sin "+ Calendar") ya lo dice. Sin calendar para esas fechas se usa solo la agenda. "Sin incluir" queda para lo suspendido y lo que se sacó a mano. Todo lo que no se pudo cruzar bien se avisa en la fila, no se esconde.

### A mano, horario, exportación y rango

- A mano (`src/store.ts`): PREQUI, HC, notas, quirófano y quiró día, más cualquier corrección de campo, orden, filas sacadas o agregadas. Se guardan por clave de fila (`fecha|HC`), así sobreviven a volver a cargar la agenda.
- Horario: columna que se escribe a mano (regla 1). El cruce no la completa.
- Exportación: mismo formato que la planilla "Checklist" (21 columnas, días del último al primero, encabezado `PREQUI`/`HC` solo en el primer día). El CSV sale sin marca BOM, con saltos `\r\n` y sin salto final, igual que el que baja Google Sheets (`tests/export.test.ts` fija esa forma).
- Rango de días (`weekRange` en `src/checklist.ts`, selectores "Días" en `ChecklistView.tsx`): cada semana se arma por defecto de lunes a domingo. Se puede acotar (ej. lunes a viernes) y queda guardado por semana (`ranges` en `useStore`, también en el respaldo de Datos). Lo que cae fuera del rango no entra al checklist ni a "Sin incluir", y el CSV se llama con las fechas del rango.

## Volver a cargar la agenda/el calendar durante la semana

Al empezar la semana se cargan agenda y calendar y se arma el checklist, se corrige a mano y más tarde se vuelven a cargar. Todo lo que difiere entre el checklist y las fuentes se muestra y se confirma (`src/review.ts`):

- Cirugías nuevas: las del calendar entran solas. Las novedades de la última carga (nuevas, movidas de día, que ya no están, con otros datos) se listan en "Novedades". `load.ts` compara el checklist de antes y de después en 9 semanas, solo si las dos cargas se armaron igual, con o sin calendar.
- Campos escritos a mano (`edits`): llevan anotado en `bases` qué decían las fuentes la última vez que se confirmaron. Si lo escrito difiere de lo que dicen hoy las fuentes y no está confirmado (edición vieja sin base, o las fuentes cambiaron después), la fila muestra "Difiere de la agenda/el calendar" con *Dejar el mío* (confirma) o *Usar el de la agenda/calendar* (descarta lo escrito). Mientras tanto rige lo escrito y nunca se pisa nada sin confirmar. PREQUI, notas, quirófano y horario no cuentan, porque las fuentes no los traen.
- Filas con trabajo manual que desaparecen de las fuentes: `snaps` guarda cómo eran. "Ya no están…" ofrece pasar lo escrito al día nuevo si se movió (mismo HC), dejarla a mano o sacarla. Las que no tenían nada escrito solo salen en Novedades.
- Lo que no cambió conserva lo escrito sin avisos.

## Poder confiar: de dónde sale cada dato

Nada del checklist es una caja negra. Cada fila del cruce lleva `origin` (`src/types.ts`): la fila de la agenda, el evento del calendar, si se encontraron por HC o por nombre y qué fuente puso cada campo.

- Panel "Origen" (`SourceDialog.tsx`, chip "Agenda L95 + Calendar" en cada fila y botón en "Sin incluir"). Muestra cómo se armó la fila y una tabla checklist / agenda / calendar campo por campo (negrita = la fuente que lo puso, amarillo = las fuentes no coinciden, "a mano" = lo escrito). Muestra también la fila de la agenda celda por celda tal como está en el CSV, con lo que la app entendió (`AGENDA_COLUMNS`: «.» se ignora, «60 min» se lee como 60, fecha ilegible), el evento del calendar con título y descripción crudos, y las otras filas del mismo paciente por si el cruce eligió mal.
- Pestaña "Originales" (`OriginalsView.tsx`): toda la agenda (por línea del CSV) y todos los eventos guardados del calendar, con buscador. Muestra también lo que se ignora (cancelado, calendario descartado, evento personal) y por qué (`describeEvent`).
- Las celdas crudas (`AgendaRow.cells`) y la descripción (`CalEvent.description`) no se guardan aparte: salen de reprocesar el CSV y los eventos guardados.

## Vista resumen de la semana

El checklist tiene dos vistas (`ChecklistView.tsx`): Resumen (por defecto, `OverviewView.tsx`) y Calendario (`CalendarView.tsx`, abajo). El resumen es una línea por cirugía, por día, para ver de lejos qué difiere o qué falta. Las dos dejan agregar una cirugía a mano: "Agregar" en el título de cada día del Resumen (también en los días sin cirugías, mientras no haya un filtro puesto) y el "+" en el encabezado de cada día del Calendario. Agrega una fila vacía ese día y abre el formulario, sin completar nada (regla 1).

Tocar una línea abre el detalle (`DetailDialog.tsx`, solo lectura). Muestra las marcas, los datos agrupados, lo que se completa a mano, el aviso de "Difiere" con sus botones, subir/bajar, sacar y el chip de origen. "Editar" en ese modal abre el formulario, así que editar es un segundo click (el lápiz de la fila lo abre directo). Las de "Sin incluir" (suspendidas o sacadas a mano) aparecen en su día, con "Incluir" (las sacadas), y tocarlas abre el panel de origen.

Las marcas salen de `rowFlags` (`src/overview.ts`) y cada una es también un filtro con su cuenta. El filtro vale para las dos vistas (`FilterBar.tsx`).

- Fecha o presencia: lo más importante, y por eso va primero y resalta mucho más que el resto (rojo sólido, borde grueso a la izquierda de la fila, y lo mismo en el Calendario). Es una cirugía que sobra, que falta o que está en otro día, medido contra lo que dicen las fuentes (`Presence`). Solo es un problema si está en las dos fuentes y difieren, o si difiere con lo que escribió la persona; estar en una sola fuente no lo es:
  - Sobra: se agregó a mano y ninguna fuente la tiene ese día.
  - Falta: las fuentes la tienen y se sacó a mano.
  - Otro día: la agenda y el calendar la tienen en días distintos.
  - Suspendida en el calendar.
  - Si es la misma persona (misma HC, o el mismo nombre si falta) y una está de un lado en un día y del otro lado en otro, la marca dice el otro día ("las fuentes la tienen el 16/10", `elsewhereDates`). Dos cirugías reales de una persona en días distintos no cuentan como movidas.

- Reconocer: lo que difiere de las fuentes (fecha o presencia y campos en que agenda y calendar no coinciden) se puede marcar como reconocido con "Reconocer" (Resumen y el modal; "Volver a avisar" lo deshace). La fila deja de avisar y de contar en esos filtros, y pasa a "Reconocidas". Se guarda en `acks` (clave de fila → `Flags.signature`, una huella de lo que dicen la agenda y el calendar de esa cirugía, sin el número de línea ni lo escrito a mano). Si en una carga nueva cambia algo de lo que dicen las fuentes, la huella ya no coincide y la advertencia vuelve; si no cambió, sigue reconocida. También silencia el aviso del cruce de esa fila, porque es la misma diferencia. Lo por confirmar tiene sus propios botones y lo editado no se reconoce.
- Por confirmar: lo escrito a mano que difiere de las fuentes y nadie confirmó (`conflicts`).
- Agenda ≠ calendar: campos en que las dos fuentes dicen cosas distintas (la fecha es de presencia).
- Editadas: campos en que el checklist difiere de lo que salió del cruce (confirmados o no).
- Faltan datos: falta alguno de Paciente, HC, Cirugía, Cirujano, Ojo, Duración (`REQUIRED_FIELDS`). Ayudante, anestesia, dioptrías y teléfono pueden faltar sin aviso.
- Sin completar: Horario, Prequi o HC (check) todavía vacíos (`PENDING_FIELDS`). Son columnas a mano y nunca se completan solas (regla 1).

En la fila, la celda marcada en amarillo es un campo por confirmar, en rojo uno en que las fuentes no coinciden, en cursiva con subrayado punteado uno escrito a mano, y «falta» uno vacío que debería tener dato.

### Vista Calendario

Los días del rango de la semana como columnas, igual que en `../guardias` (FullCalendar 6 con `daygrid`, locale `es`, mismos retoques `.fc` en `index.css`). Una tarjeta por cirugía en el orden del día. Las de "Sin incluir" van al final, punteadas. Los textos de las marcas son los del Resumen (`flagNotes` en `overview.ts`, también salen como tooltip) y se ven en el borde: rojo fuerte con borde grueso = fecha o presencia, rojo fino = agenda ≠ calendar en un campo, amarillo con contorno = por confirmar. Tocar una cirugía abre el mismo detalle que en el Resumen, y una de "Sin incluir" abre el panel de origen.

No hay grilla de horas. El horario es texto libre y casi siempre está vacío (regla 1), así que un eje horario obligaría a leerlo y a calcular el fin con la duración. El horario, si se escribió, se muestra tal cual delante del nombre. En el teléfono el calendario se desliza hacia los costados (`DAY_MIN_REM` por día) en vez de apretar los nombres.

## Tareas

Pestaña "Tareas" (`TasksView.tsx`, definiciones en `src/tasks.ts`): lo que la residente tiene que hacer además del checklist. Viven solo en el sitio y no entran en la planilla que se exporta (sí en el respaldo de Datos, en `tasks`). Comparte la semana con el Checklist (`monday` vive en `App.tsx`).

- Tareas de la semana: se completan antes del lunes (vencen el domingo anterior). Hoy: hacer la valija, revisar que haya suficientes lentes y revisar que todas las cirugías tengan sus datos. La de lentes no tiene casilla propia: depende de sus sub-items (`lensTask`) y está hecha cuando todas las revisiones por cirugía lo están (sin cirugías, también). Los sub-items (`lensChecks`, estado en `tasks` con clave `lente|fecha|HC`) son una lista con cada cirugía de la semana, su check de "revisé el lente" y las dioptrías tal cual están (sin sumarlas ni interpretarlas; lo que es «.» o «-» cuenta como sin cargar). Las que no tienen dioptrías se resaltan en amarillo, y el check dice que así está bien. Tocar la fila (no el check) abre `SurgeryCheckDialog.tsx`: todo lo que tiene la cirugía (las dioptrías pueden estar en las observaciones o en otro dato), el origen, un campo para cargar las dioptrías a mano (queda como cualquier campo escrito a mano, así que si las fuentes cambian se avisa) y el mismo check. Cargar las dioptrías no tilda la revisión: eso es de la persona. La de los datos (`dataChecks` y `dataTask`, clave `datos|fecha|HC`) funciona igual, también sin casilla propia: está hecha cuando cada cirugía a la que le falta alguno de Cirugía, Cirujano, Ojo, Duración, Paciente u Horario (`WEEK_FIELDS`) cargó el dato o reconoció que así está bien. Lista solo las incompletas, y tocar una abre el modal con esos campos (con las mismas sugerencias que el formulario) y la casilla.
- Tareas por cirugía: se arman por cada fila del checklist de la semana. Hoy: llamar al paciente dos días antes (días corridos, sin ajustar por fin de semana: una cirugía del lunes se llama el sábado). Muestra el teléfono que tiene la fila y, debajo, lo que se mira al llamar: a qué hora citar, la cirugía y el ojo. La hora de citación es `CALL_HOURS_BEFORE` (2) horas antes del horario (`callTime`): es un número que se calcula solo para mostrarlo, nunca se guarda en un campo, con un rango («8-8.30», «9:00 a 11:00») se resta al inicio, y si el horario no es una hora ni un rango claros (texto, notas) no se calcula nada. Tocar la fila (no la casilla) abre el modal de la cirugía (`SurgeryCheckDialog` en modo `call`) con los datos de la semana y el teléfono para completarlos, la hora de citación y la nota de la llamada (la misma nota de la tarea, así que se queda en el sitio: no sale en el CSV que se exporta, que solo arma `sheetCsv` con las filas del checklist, y solo viaja en el respaldo de Datos). Las que no tienen teléfono (lo que es «.» o «-» cuenta como sin cargar) se resaltan en amarillo igual que las de dioptrías: el check (`phoneChecks`, clave `telefono|fecha|HC`, aparte de la casilla de la llamada) dice que así está bien, y tocar el resto abre el mismo modal con el campo del teléfono (queda como cualquier campo escrito a mano). Con el teléfono cargado el modal ya no pide reconocer nada. Lo mismo vale para el nombre del paciente (`nameChecks`, clave `nombre|fecha|HC`): una cirugía sin nombre se resalta, su check reconoce que así está bien y tocarla abre el modal para cargarlo.
- Cada tarea tiene casilla (hecha) y una nota de texto libre. El estado de una tarea se guarda en `tasks` por clave de tarea (`TaskItem.key`: id de la tarea y lunes de la semana, o clave de la fila `fecha|HC`). Si una cirugía cambia de día es otra fila, así que sus tareas empiezan de cero (lo anterior queda guardado sin mostrarse).
- Estados: hecha, vencida (la fecha pasó), para hoy y pendiente (`taskStatus`). Una tarea sin tocar no deja nada guardado.
- Agregar una tarea es agregar una entrada a `TASK_DEFS` (`scope: 'week' | 'surgery'` y `daysBefore`); el resto sale solo.

## Lo que no se puede automatizar

El checklist que arma la residente a mano no sale ni del calendar ni de la agenda por fecha. Tiene cirugías movidas, sumadas y bajadas por conversaciones que no quedaron escritas en ninguna de las dos (en la semana del 12/10, de 34 filas, 10 no estaban en el calendar y 5 del calendar no estaban en el checklist). Por eso el cruce propone y avisa, y la persona incluye, saca o edita. No hay que intentar "adivinar" más.
