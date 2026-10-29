# Poder confiar: de dónde sale cada dato

Nada del checklist es una caja negra. Cada fila del cruce lleva `origin` (`src/types.ts`): la fila de la agenda, el evento del calendar, si se encontraron por HC o por nombre y qué fuente puso cada campo.

- Panel "Origen" (`SourceDialog.tsx`, chip "Agenda L95 + Calendar" en cada fila y botón en "Sin incluir"). Muestra cómo se armó la fila y una tabla checklist / agenda / calendar campo por campo (negrita = la fuente que lo puso, amarillo = las fuentes no coinciden, "a mano" = lo escrito). Muestra también la fila de la agenda celda por celda tal como está en el CSV, con lo que la app entendió (`AGENDA_COLUMNS`: «.» se ignora, «60 min» se lee como 60, fecha ilegible), el evento del calendar con título y descripción crudos, y las otras filas del mismo paciente por si el cruce eligió mal.
- Pestaña "Originales" (`OriginalsView.tsx`): toda la agenda (por línea del CSV) y todos los eventos guardados del calendar, con buscador. Muestra también lo que se ignora (cancelado, calendario descartado, evento personal) y por qué (`describeEvent`).
- Las celdas crudas (`AgendaRow.cells`) y la descripción (`CalEvent.description`) no se guardan aparte: salen de reprocesar el CSV y los eventos guardados.
