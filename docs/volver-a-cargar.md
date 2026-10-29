# Volver a cargar la agenda/el calendar durante la semana

Al empezar la semana se cargan agenda y calendar y se arma el checklist, se corrige a mano y más tarde se vuelven a cargar. Todo lo que difiere entre el checklist y las fuentes se muestra y se confirma (`src/review.ts`):

- Cirugías nuevas: las del calendar entran solas. Las novedades de la última carga (nuevas, movidas de día, que ya no están, con otros datos) se listan en "Novedades". `load.ts` compara el checklist de antes y de después en 9 semanas, solo si las dos cargas se armaron igual, con o sin calendar.
- Campos escritos a mano (`edits`): llevan anotado en `bases` qué decían las fuentes la última vez que se confirmaron. Si lo escrito difiere de lo que dicen hoy las fuentes y no está confirmado (edición vieja sin base, o las fuentes cambiaron después), la fila muestra "Difiere de la agenda/el calendar" con *Dejar el mío* (confirma) o *Usar el de la agenda/calendar* (descarta lo escrito). Mientras tanto rige lo escrito y nunca se pisa nada sin confirmar. PREQUI, notas, quirófano y horario no cuentan, porque las fuentes no los traen.
- Filas con trabajo manual que desaparecen de las fuentes: `snaps` guarda cómo eran. "Ya no están…" ofrece pasar lo escrito al día nuevo si se movió (mismo HC), dejarla a mano o sacarla. Las que no tenían nada escrito solo salen en Novedades.
- Lo que no cambió conserva lo escrito sin avisos.
