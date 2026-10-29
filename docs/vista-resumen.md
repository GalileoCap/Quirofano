# Vista resumen de la semana

"Regla 1" es la primera de las reglas de los campos, en `CLAUDE.md`.

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

## Vista Calendario

Los días del rango de la semana como columnas, igual que en `../guardias` (FullCalendar 6 con `daygrid`, locale `es`, mismos retoques `.fc` en `index.css`). Una tarjeta por cirugía en el orden del día. Las de "Sin incluir" van al final, punteadas. Los textos de las marcas son los del Resumen (`flagNotes` en `overview.ts`, también salen como tooltip) y se ven en el borde: rojo fuerte con borde grueso = fecha o presencia, rojo fino = agenda ≠ calendar en un campo, amarillo con contorno = por confirmar. Tocar una cirugía abre el mismo detalle que en el Resumen, y una de "Sin incluir" abre el panel de origen.

No hay grilla de horas. El horario es texto libre y casi siempre está vacío (regla 1), así que un eje horario obligaría a leerlo y a calcular el fin con la duración. El horario, si se escribió, se muestra tal cual delante del nombre. En el teléfono el calendario se desliza hacia los costados (`DAY_MIN_REM` por día) en vez de apretar los nombres.
