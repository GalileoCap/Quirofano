---
id: A2
from: [O1]
source: session
status: decided 2026-10-29
kind: behaviour
implemented_by: [src/components/CompareDialog.tsx, src/store.ts]
proven_by: [unproven]
supersedes: []
---

# A2 Aplicar una diferencia es escribirla a mano

Aplicar un campo lo escribe con `setEdit`, como si la persona lo tipeara: queda anotada la base y, si después las fuentes cambian, se avisa como cualquier campo escrito a mano. Una cirugía que falta se incluye si estaba en Sin incluir, o se agrega a mano con los datos del archivo (`addManualRow(date, values)`). Una que sobra pasa a Sin incluir, o se borra si era agregada a mano.

## Contexto

La regla 1 del dueño dice que cada valor viene de una fuente o lo escribe la persona. El checklist cargado no es una fuente del cruce. Lo armó una persona, y aplicarlo es una decisión de quien lo tilda, así que se guarda como lo escrito a mano y no como un dato de la agenda o del calendar.

## Consecuencias

Lo aplicado aparece como editado (cursiva y subrayado punteado) y cuenta en el filtro "Editadas". Una cirugía agregada desde el archivo y que no está en ninguna fuente se marca "Sobra", que es lo que es. Se deshace si el dueño quiere que lo aplicado se vea distinto de lo tipeado. Probado en el navegador el 2026-10-29: se aplicaron un horario, un ayudante, una cirugía que faltaba y una que sobraba. Ningún test lo fija.
